ALTER TABLE work_item
  ADD COLUMN IF NOT EXISTS related_external_id varchar(200),
  ADD COLUMN IF NOT EXISTS repository_external_id varchar(200);

CREATE INDEX IF NOT EXISTS work_item_related_external_idx
  ON work_item(workspace_id, source_connection_id, related_external_id);
