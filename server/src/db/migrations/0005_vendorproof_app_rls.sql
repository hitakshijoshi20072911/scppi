-- Restricted runtime role. Password provisioning is intentionally external to migrations.
-- Refuse to convert a role that owns any object in any database; ownership can bypass grants/RLS.
DO $$
DECLARE
  app_role oid;
BEGIN
  SELECT oid INTO app_role FROM pg_roles WHERE rolname = 'vendorproof_app';
  IF app_role IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM pg_shdepend
      WHERE refclassid = 'pg_authid'::regclass
        AND refobjid = app_role
        AND deptype = 'o'
    )
  ) THEN
    RAISE EXCEPTION 'vendorproof_app owns database objects; remove ownership before applying this migration';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendorproof_app') THEN
    CREATE ROLE vendorproof_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE vendorproof_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

-- Normalize a pre-existing role before granting only the required privileges.
DO $$
DECLARE
  granted_role text;
BEGIN
  FOR granted_role IN
    SELECT granted.rolname::text
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    WHERE membership.member = 'vendorproof_app'::regrole
  LOOP
    EXECUTE format('REVOKE %I FROM vendorproof_app', granted_role);
  END LOOP;
  EXECUTE format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM vendorproof_app', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO vendorproof_app', current_database());
END
$$;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM vendorproof_app;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM vendorproof_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM vendorproof_app;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM vendorproof_app;
DO $$
DECLARE
  column_record record;
BEGIN
  FOR column_record IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON TABLE public.%2$I FROM vendorproof_app',
      column_record.column_name,
      column_record.table_name
    );
  END LOOP;
END
$$;
GRANT USAGE ON SCHEMA public TO vendorproof_app;
REVOKE CREATE ON SCHEMA public FROM vendorproof_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.app_user, public.workspace, public.membership, public.session,
  public.client, public.project, public.contract, public.time_entry, public.milestone,
  public.audit_event, public.source_connection, public.scope_rule, public.work_item,
  public.billing_run, public.run_source, public.run_item, public.provider_execution,
  public.invoice_preview, public.invoice_line, public.invoice_evidence_claim, public.invoice_review
TO vendorproof_app;
REVOKE UPDATE ON public.app_user FROM vendorproof_app;
GRANT UPDATE (last_login_at, updated_at) ON public.app_user TO vendorproof_app;

CREATE OR REPLACE FUNCTION public.vendorproof_is_active_workspace_member(target_workspace uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.membership m
    WHERE m.workspace_id = target_workspace
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND m.status = 'active'
  )
$$;
REVOKE ALL ON FUNCTION public.vendorproof_is_active_workspace_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendorproof_is_active_workspace_member(uuid) TO vendorproof_app;

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
    EXECUTE format('CREATE POLICY vendorproof_workspace_access ON public.%I USING (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid AND public.vendorproof_is_active_workspace_member(workspace_id)) WITH CHECK (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid AND public.vendorproof_is_active_workspace_member(workspace_id))', tenant_table);
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
    AND (
      (role = 'owner' AND user_id = nullif(current_setting('app.user_id', true), '')::uuid
        AND EXISTS (
          SELECT 1 FROM public.workspace w
          WHERE w.id = membership.workspace_id
            AND w.owner_id = nullif(current_setting('app.user_id', true), '')::uuid
        ))
      OR (role IN ('admin', 'member') AND EXISTS (
        SELECT 1 FROM public.membership actor
        WHERE actor.workspace_id = membership.workspace_id
          AND actor.user_id = nullif(current_setting('app.user_id', true), '')::uuid
          AND actor.status = 'active'
          AND actor.role IN ('owner', 'admin')
      ))
    )
  );

-- Global registration/login lookup uses explicit email GUC; tenant audit writes
-- are constrained to the explicitly selected workspace.
ALTER TABLE public.audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_event FORCE ROW LEVEL SECURITY;
CREATE POLICY vendorproof_audit_access ON public.audit_event
  USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
    AND public.vendorproof_is_active_workspace_member(workspace_id))
  WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
    AND actor_user_id IS NOT DISTINCT FROM nullif(current_setting('app.user_id', true), '')::uuid
    AND public.vendorproof_is_active_workspace_member(workspace_id));
