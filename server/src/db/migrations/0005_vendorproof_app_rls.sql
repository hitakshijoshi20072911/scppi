-- Restricted runtime role. Password provisioning is intentionally external to migrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendorproof_app') THEN
    CREATE ROLE vendorproof_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE vendorproof_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO vendorproof_app', current_database()); END $$;
GRANT USAGE ON SCHEMA public TO vendorproof_app;
REVOKE CREATE ON SCHEMA public FROM vendorproof_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.app_user, public.workspace, public.membership, public.session,
  public.client, public.project, public.contract, public.time_entry, public.milestone,
  public.audit_event, public.source_connection, public.scope_rule, public.work_item,
  public.billing_run, public.run_source, public.run_item, public.provider_execution,
  public.invoice_preview, public.invoice_line, public.invoice_evidence_claim, public.invoice_review
TO vendorproof_app;

-- These are the complete application tables after migrations 0000-0004; do not
-- grant access to migration ledgers or internal migration metadata.
DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'client','project','contract','time_entry','milestone',
    'source_connection','scope_rule','work_item','billing_run','run_source',
    'run_item','provider_execution','invoice_preview','invoice_line',
    'invoice_evidence_claim','invoice_review'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('CREATE POLICY vendorproof_workspace_access ON public.%I USING (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid)', tenant_table);
  END LOOP;
END
$$;

ALTER TABLE public.app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user FORCE ROW LEVEL SECURITY;
CREATE POLICY vendorproof_user_read ON public.app_user FOR SELECT
  USING (id = nullif(current_setting('app.user_id', true), '')::uuid
    OR email = nullif(current_setting('app.auth_email', true), '')
    OR EXISTS (
      SELECT 1 FROM public.membership m
      WHERE m.user_id = app_user.id
        AND m.workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
        AND m.status = 'active'
    ));
CREATE POLICY vendorproof_user_insert ON public.app_user FOR INSERT
  WITH CHECK (email = nullif(current_setting('app.auth_email', true), ''));
CREATE POLICY vendorproof_user_update ON public.app_user FOR UPDATE
  USING (id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE public.session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session FORCE ROW LEVEL SECURITY;
CREATE POLICY vendorproof_session_access ON public.session
  USING (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR token_hash = nullif(current_setting('app.session_token_hash', true), '')
  )
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE public.workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace FORCE ROW LEVEL SECURITY;
CREATE POLICY vendorproof_workspace_select ON public.workspace FOR SELECT
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR EXISTS (SELECT 1 FROM public.membership m WHERE m.workspace_id = workspace.id AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid AND m.status = 'active'));
CREATE POLICY vendorproof_workspace_insert ON public.workspace FOR INSERT
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY vendorproof_workspace_update ON public.workspace FOR UPDATE
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE public.membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership FORCE ROW LEVEL SECURITY;
CREATE POLICY vendorproof_membership_read ON public.membership FOR SELECT
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
CREATE POLICY vendorproof_membership_owner_insert ON public.membership FOR INSERT
  WITH CHECK (
    workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM public.workspace w
      WHERE w.id = membership.workspace_id
        AND w.owner_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  );

-- Global registration/login lookup uses explicit email GUC; tenant audit writes
-- are constrained to the explicitly selected workspace.
ALTER TABLE public.audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_event FORCE ROW LEVEL SECURITY;
CREATE POLICY vendorproof_audit_access ON public.audit_event
  USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
    AND actor_user_id IS NOT DISTINCT FROM nullif(current_setting('app.user_id', true), '')::uuid);
