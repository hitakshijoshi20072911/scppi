CREATE TABLE IF NOT EXISTS invoice_preview (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id),
  project_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  billing_run_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  content_hash varchar(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  status varchar(16) NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','approved','rejected')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_by uuid NOT NULL REFERENCES app_user(id),
  approved_by uuid REFERENCES app_user(id),
  approved_at timestamptz,
  approval_hash varchar(64) CHECK (approval_hash IS NULL OR approval_hash ~ '^[0-9a-f]{64}$'),
  rejection_reason varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES project(workspace_id, id),
  FOREIGN KEY (workspace_id, contract_id) REFERENCES contract(workspace_id, id),
  FOREIGN KEY (workspace_id, billing_run_id) REFERENCES billing_run(workspace_id, id),
  CHECK (period_end > period_start),
  CHECK ((status = 'approved') = (approved_by IS NOT NULL)),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CHECK ((status = 'approved') = (approval_hash IS NOT NULL)),
  CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_preview_one_open_per_run
  ON invoice_preview(workspace_id, billing_run_id) WHERE status IN ('preview','approved');

CREATE TABLE IF NOT EXISTS invoice_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id),
  invoice_id uuid NOT NULL,
  source_kind varchar(16) NOT NULL CHECK (source_kind IN ('time_entry','milestone')),
  source_id uuid NOT NULL,
  description text NOT NULL CHECK (length(description) <= 6000),
  service_date date NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor >= 0),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  source_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, invoice_id) REFERENCES invoice_preview(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoice_evidence_claim (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id),
  invoice_id uuid NOT NULL,
  source_kind varchar(16) NOT NULL CHECK (source_kind IN ('time_entry','milestone')),
  source_id uuid NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  FOREIGN KEY (workspace_id, invoice_id) REFERENCES invoice_preview(workspace_id, id),
  CHECK ((status = 'released') = (released_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_evidence_one_active_claim
  ON invoice_evidence_claim(workspace_id, source_kind, source_id) WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS invoice_preview_workspace_status_idx ON invoice_preview(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS invoice_line_invoice_idx ON invoice_line(workspace_id, invoice_id, service_date, id);

CREATE TABLE IF NOT EXISTS invoice_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id),
  invoice_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES app_user(id),
  decision varchar(8) NOT NULL CHECK (decision IN ('approve','reject')),
  content_hash varchar(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  reason varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, invoice_id) REFERENCES invoice_preview(workspace_id, id),
  UNIQUE (workspace_id, invoice_id),
  CHECK ((decision = 'reject') = (reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS invoice_review_history_idx ON invoice_review(workspace_id, invoice_id, created_at);

CREATE OR REPLACE FUNCTION protect_invoice_preview_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invoice previews cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'preview' OR NEW.status NOT IN ('approved','rejected') OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Invoice preview allows one terminal review transition only' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'approved' AND NEW.approval_hash IS DISTINCT FROM NEW.content_hash THEN
    RAISE EXCEPTION 'Approved invoice hash must match the immutable content hash' USING ERRCODE = '42501';
  END IF;
  IF ROW(NEW.id, NEW.workspace_id, NEW.project_id, NEW.contract_id, NEW.billing_run_id,
      NEW.period_start, NEW.period_end, NEW.currency, NEW.subtotal_minor, NEW.content_hash,
      NEW.snapshot, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.workspace_id, OLD.project_id, OLD.contract_id, OLD.billing_run_id,
      OLD.period_start, OLD.period_end, OLD.currency, OLD.subtotal_minor, OLD.content_hash,
      OLD.snapshot, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'Invoice preview snapshot fields are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_preview_immutable
  BEFORE UPDATE OR DELETE ON invoice_preview
  FOR EACH ROW EXECUTE FUNCTION protect_invoice_preview_record();

CREATE OR REPLACE FUNCTION protect_invoice_child_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Invoice evidence and review history are immutable' USING ERRCODE = '42501';
  RETURN OLD;
END $$;
CREATE TRIGGER invoice_line_immutable
  BEFORE UPDATE OR DELETE ON invoice_line
  FOR EACH ROW EXECUTE FUNCTION protect_invoice_child_record();
CREATE TRIGGER invoice_review_immutable
  BEFORE UPDATE OR DELETE ON invoice_review
  FOR EACH ROW EXECUTE FUNCTION protect_invoice_child_record();

DO $$
DECLARE tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY['invoice_preview','invoice_line','invoice_evidence_claim','invoice_review'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY workspace_isolation ON %I USING (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid)',
      tenant_table
    );
  END LOOP;
END $$;
