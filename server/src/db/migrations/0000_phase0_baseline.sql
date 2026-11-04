CREATE TABLE IF NOT EXISTS "_vendorproof_phase0" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "_vendorproof_phase0_singleton" CHECK ("id" = 1)
);

INSERT INTO "_vendorproof_phase0" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
