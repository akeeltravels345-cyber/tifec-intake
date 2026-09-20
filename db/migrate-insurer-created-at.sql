-- billing_insurers.created_at was added to db/billing-schema.sql after some
-- databases had already created the table (CREATE TABLE IF NOT EXISTS no-ops on
-- an existing table), so those tables never gained the column. This backfills
-- it. Idempotent and safe to re-run. No application code depends on the column.
ALTER TABLE billing_insurers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
