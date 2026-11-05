ALTER TABLE project
  ADD COLUMN IF NOT EXISTS time_zone varchar(64) NOT NULL DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS source_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id),
  project_id uuid NOT NULL,
  provider varchar(24) NOT NULL CHECK (provider = 'github'),
  repository_owner varchar(100) NOT NULL CHECK (repository_owner ~ '^[A-Za-z0-9_.-]+$'),
  repository_name varchar(100) NOT NULL CHECK (repository_name ~ '^[A-Za-z0-9_.-]+$'),
  repository_url text NOT NULL,
  connection_status varchar(24) NOT NULL DEFAULT 'not_connected' CHECK (connection_status IN ('not_connected','connected','disabled')),
  created_by uuid NOT NULL REFERENCES app_user(id),
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, project_id, provider, repository_owner, repository_name),
  FOREIGN KEY (workspace_id, project_id) REFERENCES project(workspace_id, id),
  CHECK (connection_status <> 'connected' OR connected_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS scope_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id),
  project_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  category varchar(64) NOT NULL CHECK (category ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'),
  keywords jsonb NOT NULL CHECK (jsonb_typeof(keywords) = 'array' AND jsonb_array_length(keywords) BETWEEN 1 AND 32),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES project(workspace_id, id),
  FOREIGN KEY (workspace_id, contract_id) REFERENCES contract(workspace_id, id)
);

CREATE TABLE IF NOT EXISTS work_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id),
  project_id uuid NOT NULL,
  source_connection_id uuid NOT NULL,
  provider varchar(24) NOT NULL CHECK (provider = 'github'),
  external_id varchar(200) NOT NULL,
  item_type varchar(32) NOT NULL CHECK (item_type IN ('pull_request','commit','issue')),
  title varchar(500) NOT NULL,
  state varchar(40) NOT NULL,
  author varchar(100) NOT NULL,
  source_url text NOT NULL,
  provider_created_at timestamptz NOT NULL,
  provider_updated_at timestamptz NOT NULL,
  content_hash varchar(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, source_connection_id, provider, external_id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES project(workspace_id, id),
  FOREIGN KEY (workspace_id, source_connection_id) REFERENCES source_connection(workspace_id, id)
);

CREATE TABLE IF NOT EXISTS billing_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id),
  project_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  time_zone varchar(64) NOT NULL,
  scope_rules_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(scope_rules_snapshot) = 'array'),
  status varchar(32) NOT NULL DEFAULT 'created' CHECK (status IN ('created','ingesting','ingested','ingested_partial','matching','classifying','needs_review','ready_for_approval','cancelled')),
  completeness varchar(16) NOT NULL DEFAULT 'unknown' CHECK (completeness IN ('unknown','complete','partial')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  outstanding_decisions integer NOT NULL DEFAULT 0 CHECK (outstanding_decisions >= 0),
  accepted_partial_at timestamptz,
  accepted_partial_by uuid REFERENCES app_user(id),
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES project(workspace_id, id),
  FOREIGN KEY (workspace_id, contract_id) REFERENCES contract(workspace_id, id),
  CHECK (period_end > period_start),
  CHECK ((status = 'needs_review') = (outstanding_decisions > 0)),
  CHECK ((accepted_partial_at IS NULL) = (accepted_partial_by IS NULL))
);

CREATE TABLE IF NOT EXISTS run_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id),
  run_id uuid NOT NULL,
  source_connection_id uuid NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  items_received integer NOT NULL DEFAULT 0 CHECK (items_received >= 0),
  error_code varchar(64),
  correlation_id varchar(128),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, run_id, source_connection_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES billing_run(workspace_id, id),
  FOREIGN KEY (workspace_id, source_connection_id) REFERENCES source_connection(workspace_id, id),
  CHECK ((status = 'failed') = (error_code IS NOT NULL)),
  CHECK ((status = 'pending') = (completed_at IS NULL))
);

CREATE TABLE IF NOT EXISTS run_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id),
  run_id uuid NOT NULL,
  work_item_id uuid NOT NULL,
  classification_status varchar(24) NOT NULL CHECK (classification_status IN ('rule_matched','needs_review','approved','rejected')),
  category varchar(64),
  client_description varchar(500),
  matched_rule_id uuid,
  reason varchar(64) NOT NULL,
  human_decision_by uuid REFERENCES app_user(id),
  human_decision_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, run_id, work_item_id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES billing_run(workspace_id, id),
  FOREIGN KEY (workspace_id, work_item_id) REFERENCES work_item(workspace_id, id),
  FOREIGN KEY (workspace_id, matched_rule_id) REFERENCES scope_rule(workspace_id, id),
  CHECK ((human_decision_by IS NULL) = (human_decision_at IS NULL)),
  CHECK (classification_status NOT IN ('approved','rejected') OR human_decision_by IS NOT NULL),
  CHECK (classification_status NOT IN ('needs_review','rule_matched') OR human_decision_by IS NULL),
  CHECK (classification_status <> 'approved' OR (category IS NOT NULL AND client_description IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS provider_execution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id),
  source_connection_id uuid,
  provider varchar(24) NOT NULL CHECK (provider = 'github'),
  canonical_method_id varchar(100) NOT NULL CHECK (canonical_method_id IN ('github.pull.get','github.pull.get1','github.pull.commits.get','github.commit.get2')),
  status varchar(16) NOT NULL CHECK (status IN ('pending','succeeded','failed','unknown')),
  request_hash varchar(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response_summary jsonb,
  correlation_id varchar(128) NOT NULL,
  error_code varchar(64),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, source_connection_id) REFERENCES source_connection(workspace_id, id),
  CHECK ((status = 'pending') = (completed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS source_connection_project_idx ON source_connection(workspace_id, project_id, created_at);
CREATE INDEX IF NOT EXISTS work_item_project_provider_date_idx ON work_item(workspace_id, project_id, provider_created_at);
CREATE INDEX IF NOT EXISTS billing_run_project_period_idx ON billing_run(workspace_id, project_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS run_source_status_idx ON run_source(workspace_id, run_id, status);
CREATE INDEX IF NOT EXISTS run_item_status_idx ON run_item(workspace_id, run_id, classification_status);
CREATE INDEX IF NOT EXISTS provider_execution_workspace_created_idx ON provider_execution(workspace_id, created_at);

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'source_connection',
    'scope_rule',
    'work_item',
    'billing_run',
    'run_source',
    'run_item',
    'provider_execution'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = current_schema()
        AND tablename = tenant_table
        AND policyname = 'workspace_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY workspace_isolation ON %I USING (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid)',
        tenant_table
      );
    END IF;
  END LOOP;
END $$;
