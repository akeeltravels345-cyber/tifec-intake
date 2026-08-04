-- Staging table for records imported from an external report (e.g. the PRC
-- "Unpaid Services Report") so the biller can review, edit and accept them one
-- by one before they become real billing sessions. Nothing here is live until
-- the biller accepts it.
CREATE TABLE IF NOT EXISTS billing_import_staging (
  id              text PRIMARY KEY,
  batch           text NOT NULL,
  clinician_id    text NOT NULL,
  client_first    text,
  client_last     text,
  dob             text,
  insurer_name    text,
  cpt             text,
  fee             numeric,
  duration_hours  numeric,
  date_of_service text,
  billed_date     text,
  inv_no          text,
  status          text NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  created_at      text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_import_staging_status ON billing_import_staging(status);
CREATE INDEX IF NOT EXISTS idx_import_staging_batch  ON billing_import_staging(batch);
