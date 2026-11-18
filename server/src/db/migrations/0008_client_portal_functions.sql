-- Client-portal mutations run as SECURITY DEFINER so the restricted
-- application role never gains write access to provider-owned tables.
-- Membership and invitation checks happen inside each function.

create or replace function public.vendorproof_accept_client_invitation(
  p_token_hash varchar,
  p_user_id uuid,
  p_email varchar
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  inv record;
  mem_role varchar;
begin
  select * into inv from public.client_invitation where token_hash = p_token_hash;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Invitation not found'); end if;
  if inv.accepted_at is not null then return jsonb_build_object('ok', false, 'code', 'ALREADY_ACCEPTED', 'message', 'Invitation already used'); end if;
  if inv.revoked_at is not null then return jsonb_build_object('ok', false, 'code', 'REVOKED', 'message', 'Invitation was revoked'); end if;
  if inv.expires_at < now() then return jsonb_build_object('ok', false, 'code', 'EXPIRED', 'message', 'Invitation expired'); end if;
  if lower(inv.email) <> lower(p_email) then return jsonb_build_object('ok', false, 'code', 'EMAIL_MISMATCH', 'message', 'Invitation was sent to a different email address'); end if;
  insert into public.client_membership (workspace_id, client_id, user_id, role)
    values (inv.workspace_id, inv.client_id, p_user_id, inv.role)
    on conflict (workspace_id, client_id, user_id)
    do update set role = excluded.role, status = 'active', updated_at = now()
    returning role into mem_role;
  update public.client_invitation set accepted_at = now(), accepted_by = p_user_id, updated_at = now() where id = inv.id;
  insert into public.audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id)
    values (inv.workspace_id, p_user_id, 'client.invite_accepted', 'client_membership', inv.client_id, jsonb_build_object('role', mem_role), gen_random_uuid()::text);
  return jsonb_build_object('ok', true, 'workspaceId', inv.workspace_id, 'clientId', inv.client_id, 'role', mem_role);
end $$;

create or replace function public.vendorproof_client_contract_decision(
  p_version_id uuid,
  p_user_id uuid,
  p_decision varchar,
  p_reason varchar
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v record;
  v_status varchar;
  v_count int;
begin
  select cv.*, cm.role as member_role into v
    from public.contract_version cv
    join public.client_membership cm
      on cm.workspace_id = cv.workspace_id and cm.client_id = cv.client_id
     and cm.user_id = p_user_id and cm.status = 'active'
   where cv.id = p_version_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Contract version not found'); end if;
  if v.member_role not in ('client_admin', 'client_owner') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Client admin or owner role required');
  end if;
  if v.status in ('accepted', 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Version already ' || v.status);
  end if;
  if p_decision = 'accept' then
    insert into public.contract_acceptance (workspace_id, contract_version_id, client_id, party, user_id)
      values (v.workspace_id, p_version_id, v.client_id, 'client', p_user_id)
      on conflict (contract_version_id, party) do nothing;
    select count(*) into v_count from public.contract_acceptance where contract_version_id = p_version_id;
    if v_count >= 2 then
      update public.contract_version set status = 'accepted' where id = p_version_id;
      update public.contract set status = 'active', updated_at = now() where workspace_id = v.workspace_id and id = v.contract_id;
      update public.client_engagement set status = 'active', updated_at = now() where workspace_id = v.workspace_id and contract_id = v.contract_id;
      v_status := 'accepted';
    else
      update public.contract_version set status = 'client_accepted' where id = p_version_id;
      v_status := 'client_accepted';
    end if;
  elsif p_decision = 'reject' then
    update public.contract_version set status = 'rejected' where id = p_version_id;
    v_status := 'rejected';
  else
    update public.contract_version set status = 'change_requested' where id = p_version_id;
    v_status := 'change_requested';
  end if;
  insert into public.audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id)
    values (v.workspace_id, p_user_id, 'contract.client_decision', 'contract_version', p_version_id, jsonb_build_object('decision', p_decision, 'reason', p_reason), gen_random_uuid()::text);
  insert into public.client_notification (workspace_id, client_id, type, title, body, entity_type, entity_id)
    values (v.workspace_id, v.client_id, 'contract.' || p_decision, 'Contract v' || v.version || ': ' || replace(p_decision, '_', ' '), p_reason, 'contract_version', p_version_id);
  return jsonb_build_object('ok', true, 'decision', p_decision, 'status', v_status);
end $$;

create or replace function public.vendorproof_client_deliverable_decision(
  p_deliverable_id uuid,
  p_user_id uuid,
  p_decision varchar,
  p_reason varchar
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  d record;
  v_status varchar;
begin
  select cd.*, cm.role as member_role into d
    from public.client_deliverable cd
    join public.client_membership cm
      on cm.workspace_id = cd.workspace_id and cm.client_id = cd.client_id
     and cm.user_id = p_user_id and cm.status = 'active'
   where cd.id = p_deliverable_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Deliverable not found'); end if;
  if d.member_role not in ('billing_approver', 'client_admin', 'client_owner') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Billing approver role or higher required');
  end if;
  if d.status <> 'submitted' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Deliverable is not awaiting client review');
  end if;
  if p_decision = 'accept' then
    v_status := 'accepted';
  else
    v_status := 'changes_requested';
  end if;
  update public.client_deliverable
     set status = v_status, client_decision = p_decision, client_decided_by = p_user_id,
         client_decided_at = now(), client_reason = p_reason, updated_at = now()
   where id = p_deliverable_id;
  insert into public.audit_event (workspace_id, actor_user_id, action, entity_type, entity_id, after_data, request_id)
    values (d.workspace_id, p_user_id, 'deliverable.client_decision', 'client_deliverable', p_deliverable_id, jsonb_build_object('decision', p_decision, 'reason', p_reason), gen_random_uuid()::text);
  return jsonb_build_object('ok', true, 'decision', p_decision, 'status', v_status);
end $$;

revoke all on function public.vendorproof_accept_client_invitation(varchar, uuid, varchar) from public;
revoke all on function public.vendorproof_client_contract_decision(uuid, uuid, varchar, varchar) from public;
revoke all on function public.vendorproof_client_deliverable_decision(uuid, uuid, varchar, varchar) from public;
grant execute on function public.vendorproof_accept_client_invitation(varchar, uuid, varchar) to vendorproof_app;
grant execute on function public.vendorproof_client_contract_decision(uuid, uuid, varchar, varchar) to vendorproof_app;
grant execute on function public.vendorproof_client_deliverable_decision(uuid, uuid, varchar, varchar) to vendorproof_app;