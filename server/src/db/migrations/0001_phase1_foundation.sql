CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  password_hash text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  slug varchar(80) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  owner_id uuid NOT NULL REFERENCES app_user(id),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id)
);

CREATE TABLE IF NOT EXISTS membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id),
  user_id uuid NOT NULL REFERENCES app_user(id),
  role varchar(20) NOT NULL CHECK (role IN ('owner','admin','member')),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id),
  UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  csrf_token varchar(64) NOT NULL,
  last_authenticated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspace(id),
  name varchar(160) NOT NULL, contact_email varchar(320), notes text,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspace(id),
  client_id uuid NOT NULL, name varchar(160) NOT NULL, description text,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','completed')),
  start_date date, target_end_date date, created_by uuid NOT NULL REFERENCES app_user(id), updated_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id), FOREIGN KEY (workspace_id, client_id) REFERENCES client(workspace_id, id), CHECK (target_end_date IS NULL OR start_date IS NULL OR target_end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS contract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspace(id), client_id uuid NOT NULL, project_id uuid,
  reference varchar(120) NOT NULL, title varchar(160) NOT NULL, description text,
  billing_model varchar(20) NOT NULL CHECK (billing_model IN ('hourly','fixed_milestone')),
  currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'), hourly_rate_minor bigint, contract_value_minor bigint,
  effective_date date NOT NULL, end_date date, status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed','ended','archived')),
  created_by uuid NOT NULL REFERENCES app_user(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id), FOREIGN KEY (workspace_id, client_id) REFERENCES client(workspace_id, id), FOREIGN KEY (workspace_id, project_id) REFERENCES project(workspace_id, id),
  CHECK (end_date IS NULL OR end_date >= effective_date), CHECK (hourly_rate_minor IS NULL OR hourly_rate_minor >= 0), CHECK (contract_value_minor IS NULL OR contract_value_minor >= 0),
  CHECK ((billing_model = 'hourly' AND hourly_rate_minor IS NOT NULL) OR (billing_model = 'fixed_milestone' AND contract_value_minor IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS time_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspace(id), project_id uuid NOT NULL, contract_id uuid, user_id uuid NOT NULL REFERENCES app_user(id),
  work_date date NOT NULL, duration_minutes integer NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440), description varchar(2000) NOT NULL CHECK (length(trim(description)) >= 3),
  billable boolean NOT NULL DEFAULT true, status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at timestamptz, reviewed_at timestamptz, reviewer_id uuid REFERENCES app_user(id), rejection_reason varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES project(workspace_id, id), FOREIGN KEY (workspace_id, contract_id) REFERENCES contract(workspace_id, id)
);

CREATE TABLE IF NOT EXISTS milestone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspace(id), project_id uuid NOT NULL, contract_id uuid NOT NULL,
  title varchar(160) NOT NULL, description text, amount_minor bigint NOT NULL CHECK (amount_minor >= 0), currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'), due_date date,
  status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','completed','accepted','archived')),
  completed_at timestamptz, completed_by uuid REFERENCES app_user(id), accepted_at timestamptz, accepted_by uuid REFERENCES app_user(id),
  created_by uuid NOT NULL REFERENCES app_user(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES project(workspace_id, id), FOREIGN KEY (workspace_id, contract_id) REFERENCES contract(workspace_id, id)
);

CREATE TABLE IF NOT EXISTS audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid REFERENCES workspace(id), actor_user_id uuid REFERENCES app_user(id), action varchar(100) NOT NULL,
  entity_type varchar(60) NOT NULL, entity_id uuid, before_data jsonb, after_data jsonb, request_id varchar(100), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS membership_user_idx ON membership(user_id, status);
CREATE INDEX IF NOT EXISTS project_workspace_idx ON project(workspace_id, status);
CREATE INDEX IF NOT EXISTS contract_workspace_idx ON contract(workspace_id, status);
CREATE INDEX IF NOT EXISTS time_entry_workspace_idx ON time_entry(workspace_id, work_date, status);
CREATE INDEX IF NOT EXISTS milestone_workspace_idx ON milestone(workspace_id, status);
CREATE INDEX IF NOT EXISTS audit_workspace_idx ON audit_event(workspace_id, created_at);
