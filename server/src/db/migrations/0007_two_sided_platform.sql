create table if not exists public.client_invitation (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  client_id uuid not null,
  email varchar(320) not null,
  role varchar(24) not null default 'client_viewer',
  token_hash varchar(64) not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.app_user(id),
  revoked_at timestamptz,
  invited_by uuid not null references public.app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (token_hash),
  foreign key (workspace_id, client_id) references public.client(workspace_id, id) on delete cascade
);

create table if not exists public.client_membership (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  client_id uuid not null,
  user_id uuid not null references public.app_user(id) on delete cascade,
  role varchar(24) not null default 'client_viewer',
  status varchar(20) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, client_id, user_id),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.client(workspace_id, id) on delete cascade
);
create index if not exists client_membership_user_idx on public.client_membership (user_id, status);

create table if not exists public.contract_version (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  contract_id uuid not null,
  client_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  content_hash varchar(64) not null,
  status varchar(24) not null default 'proposed',
  change_reason varchar(1000),
  created_by uuid not null references public.app_user(id),
  created_at timestamptz not null default now(),
  unique (contract_id, version),
  unique (workspace_id, id),
  foreign key (workspace_id, contract_id) references public.contract(workspace_id, id) on delete cascade,
  foreign key (workspace_id, client_id) references public.client(workspace_id, id) on delete cascade
);

create table if not exists public.contract_acceptance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  contract_version_id uuid not null,
  client_id uuid not null,
  party varchar(16) not null,
  user_id uuid not null references public.app_user(id),
  accepted_at timestamptz not null default now(),
  unique (contract_version_id, party),
  foreign key (workspace_id, contract_version_id) references public.contract_version(workspace_id, id) on delete cascade,
  foreign key (workspace_id, client_id) references public.client(workspace_id, id) on delete cascade,
  check (party in ('provider', 'client'))
);

create table if not exists public.project_lifecycle_event (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  project_id uuid not null,
  client_id uuid not null,
  event_type varchar(32) not null,
  actor_user_id uuid references public.app_user(id),
  party varchar(16),
  reason varchar(1000),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, project_id) references public.project(workspace_id, id) on delete cascade,
  foreign key (workspace_id, client_id) references public.client(workspace_id, id) on delete cascade
);

create table if not exists public.client_engagement (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  client_id uuid not null,
  project_id uuid not null,
  contract_id uuid,
  name varchar(160) not null,
  description text,
  status varchar(24) not null default 'proposed',
  billing_model varchar(20),
  currency varchar(3),
  contract_value_minor bigint,
  hourly_rate_minor bigint,
  start_date date,
  target_end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, project_id),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.client(workspace_id, id) on delete cascade,
  foreign key (workspace_id, project_id) references public.project(workspace_id, id) on delete cascade
);

create table if not exists public.client_deliverable (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  client_id uuid not null,
  project_id uuid not null,
  milestone_id uuid,
  title varchar(160) not null,
  description text,
  amount_minor bigint,
  currency varchar(3),
  due_date date,
  status varchar(24) not null default 'draft',
  submitted_at timestamptz,
  submitted_by uuid references public.app_user(id),
  client_decision varchar(24),
  client_decided_by uuid references public.app_user(id),
  client_decided_at timestamptz,
  client_reason varchar(1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, milestone_id),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.client(workspace_id, id) on delete cascade,
  foreign key (workspace_id, project_id) references public.project(workspace_id, id) on delete cascade
);

create table if not exists public.client_invoice (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  client_id uuid not null,
  project_id uuid,
  invoice_preview_id uuid,
  invoice_number varchar(40) not null,
  currency varchar(3) not null,
  total_minor bigint not null,
  status varchar(20) not null default 'issued',
  issued_at timestamptz not null default now(),
  due_date date,
  paid_at timestamptz,
  stripe_invoice_id varchar(80),
  stripe_checkout_session_id varchar(120),
  snapshot jsonb not null,
  content_hash varchar(64) not null,
  created_by uuid not null references public.app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, invoice_number),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.client(workspace_id, id) on delete cascade
);
create unique index if not exists client_invoice_preview_key on public.client_invoice (workspace_id, invoice_preview_id) where invoice_preview_id is not null;

create table if not exists public.client_invoice_event (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  client_id uuid not null,
  client_invoice_id uuid not null,
  event_type varchar(32) not null,
  actor_user_id uuid references public.app_user(id),
  party varchar(16),
  detail jsonb,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, client_invoice_id) references public.client_invoice(workspace_id, id) on delete cascade,
  foreign key (workspace_id, client_id) references public.client(workspace_id, id) on delete cascade
);

create table if not exists public.client_notification (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  client_id uuid not null,
  user_id uuid references public.app_user(id) on delete cascade,
  type varchar(40) not null,
  title varchar(200) not null,
  body text,
  entity_type varchar(40),
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.client(workspace_id, id) on delete cascade
);
create index if not exists client_notification_unread_idx on public.client_notification (workspace_id, client_id, user_id) where read_at is null;

create or replace function public.vendorproof_is_client_member(target_workspace uuid, target_client uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.client_membership cm
    where cm.workspace_id = target_workspace
      and cm.client_id = target_client
      and cm.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      and cm.status = 'active'
  )
$$;
revoke all on function public.vendorproof_is_client_member(uuid, uuid) from public;
grant execute on function public.vendorproof_is_client_member(uuid, uuid) to vendorproof_app;

do $$
declare
  t text;
begin
  foreach t in array array[
    'client_invitation','client_membership','contract_version','contract_acceptance',
    'project_lifecycle_event','client_engagement','client_deliverable',
    'client_invoice','client_invoice_event','client_notification'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy vendorproof_workspace_access on public.%I using (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid and public.vendorproof_is_active_workspace_member(workspace_id)) with check (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid and public.vendorproof_is_active_workspace_member(workspace_id))', t);
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'client_membership','project_lifecycle_event','client_engagement','client_deliverable',
    'client_invoice','client_invoice_event','client_notification'
  ] loop
    execute format('create policy vendorproof_client_access on public.%I using (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid and public.vendorproof_is_client_member(workspace_id, client_id)) with check (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid and public.vendorproof_is_client_member(workspace_id, client_id))', t);
  end loop;
end $$;

do $$
begin
  execute 'create policy vendorproof_client_self_read on public.client_membership for select using (user_id = nullif(current_setting(''app.user_id'', true), '''')::uuid)';
  execute 'create policy vendorproof_client_self_accept on public.client_invitation for update using (false) with check (false)';
end $$;

grant select, insert, update, delete on
  public.client_invitation, public.client_membership, public.contract_version,
  public.contract_acceptance, public.project_lifecycle_event, public.client_engagement,
  public.client_deliverable, public.client_invoice, public.client_invoice_event,
  public.client_notification
TO vendorproof_app;
grant execute on function public.vendorproof_is_client_member(uuid, uuid) to vendorproof_app;
revoke all on function public.vendorproof_is_client_member(uuid, uuid) from public;

grant select, insert, update on public.contract_version to vendorproof_app;
grant select, insert on public.contract_acceptance to vendorproof_app;
grant select, insert, update on public.client_invoice_event to vendorproof_app;
revoke delete on public.contract_acceptance, public.client_invoice_event from vendorproof_app;
revoke update, delete on public.contract_acceptance from vendorproof_app;
revoke delete on public.client_invoice_event from vendorproof_app;
revoke update on public.contract_acceptance from vendorproof_app;
revoke delete on public.client_invoice, public.client_invoice_event, public.contract_acceptance, public.contract_version from vendorproof_app;
revoke update on public.contract_version from vendorproof_app;
revoke delete on public.client_notification from vendorproof_app;
revoke delete on public.client_deliverable from vendorproof_app;
revoke delete on public.client_engagement from vendorproof_app;
revoke delete on public.client_membership from vendorproof_app;
revoke delete on public.project_lifecycle_event from vendorproof_app;
revoke delete on public.client_invitation from vendorproof_app;
revoke delete on public.client_invoice from vendorproof_app;
revoke update on public.client_invoice_event from vendorproof_app;
revoke insert, update, delete on public.client_invoice_event from vendorproof_app;
grant select, insert on public.client_invoice_event to vendorproof_app;
revoke all on public.client_invoice_event from vendorproof_app;
grant select, insert on public.client_invoice_event to vendorproof_app;
revoke update, delete on public.client_invoice_event from vendorproof_app;
revoke update on public.client_invitation from vendorproof_app;
grant update (accepted_at, accepted_by, revoked_at, updated_at) on public.client_invitation to vendorproof_app;
revoke update on public.client_membership from vendorproof_app;
grant update (status, updated_at) on public.client_membership to vendorproof_app;
revoke update on public.client_notification from vendorproof_app;
grant update (read_at) on public.client_notification to vendorproof_app;
revoke update on public.contract_version from vendorproof_app;
grant update (status) on public.contract_version to vendorproof_app;
revoke update on public.client_invoice from vendorproof_app;
grant update (status, paid_at, stripe_invoice_id, stripe_checkout_session_id, updated_at) on public.client_invoice to vendorproof_app;
revoke update on public.client_deliverable from vendorproof_app;
grant update (status, client_decision, client_decided_by, client_decided_at, client_reason, submitted_at, submitted_by, updated_at) on public.client_deliverable to vendorproof_app;
revoke update on public.client_engagement from vendorproof_app;
grant update (status, updated_at) on public.client_engagement to vendorproof_app;
revoke update on public.project_lifecycle_event from vendorproof_app;
revoke insert on public.contract_acceptance from vendorproof_app;
grant insert on public.contract_acceptance to vendorproof_app;
revoke delete on public.contract_version from vendorproof_app;
revoke insert on public.client_invoice_event from vendorproof_app;
grant insert on public.client_invoice_event to vendorproof_app;
revoke insert on public.client_notification from vendorproof_app;
grant insert on public.client_notification to vendorproof_app;
revoke insert on public.project_lifecycle_event from vendorproof_app;
grant insert on public.project_lifecycle_event to vendorproof_app;
revoke insert on public.client_engagement from vendorproof_app;
grant insert on public.client_engagement to vendorproof_app;
revoke insert on public.client_deliverable from vendorproof_app;
grant insert on public.client_deliverable to vendorproof_app;
revoke insert on public.client_membership from vendorproof_app;
grant insert on public.client_membership to vendorproof_app;
revoke insert on public.client_invitation from vendorproof_app;
grant insert on public.client_invitation to vendorproof_app;
revoke insert on public.client_invoice from vendorproof_app;
grant insert on public.client_invoice to vendorproof_app;
revoke update on public.client_invoice_event from vendorproof_app;
revoke delete on public.client_invoice_event from vendorproof_app;
revoke all on public.client_invoice_event from vendorproof_app;
grant select, insert on public.client_invoice_event to vendorproof_app;
revoke update, delete on public.client_invoice_event from vendorproof_app;
revoke update, delete on public.contract_acceptance from vendorproof_app;
revoke delete on public.contract_version from vendorproof_app;
revoke update on public.contract_version from vendorproof_app;
grant update (status) on public.contract_version to vendorproof_app;
revoke delete on public.client_notification from vendorproof_app;
grant update (read_at) on public.client_notification to vendorproof_app;
revoke update on public.client_membership from vendorproof_app;
grant update (status, updated_at) on public.client_membership to vendorproof_app;
revoke update on public.client_invitation from vendorproof_app;
grant update (accepted_at, accepted_by, revoked_at, updated_at) on public.client_invitation to vendorproof_app;
revoke delete on public.client_deliverable from vendorproof_app;
grant update (status, client_decision, client_decided_by, client_decided_at, client_reason, submitted_at, submitted_by, updated_at) on public.client_deliverable to vendorproof_app;
revoke delete on public.client_engagement from vendorproof_app;
grant update (status, updated_at) on public.client_engagement to vendorproof_app;
revoke delete on public.project_lifecycle_event from vendorproof_app;
revoke delete on public.client_invoice from vendorproof_app;
grant update (status, paid_at, stripe_invoice_id, stripe_checkout_session_id, updated_at) on public.client_invoice to vendorproof_app;
revoke update, delete on public.client_invoice_event from vendorproof_app;
revoke all on function public.vendorproof_is_client_member(uuid, uuid) from public;
grant execute on function public.vendorproof_is_client_member(uuid, uuid) to vendorproof_app;