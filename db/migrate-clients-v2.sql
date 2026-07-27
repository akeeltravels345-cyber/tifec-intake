-- =============================================================================
-- Migration: practice-level client records + billed/paid split.
-- Safe to run once on the live Neon database.
--
-- billing_clients is replaced (it was created empty and never written to on
-- live). The billing_sessions changes are additive (existing rows keep working).
-- =============================================================================

-- 1) Rebuild billing_clients as a practice-level, CMS-1500-ready record.
DROP INDEX IF EXISTS billing_clients_uniq;
DROP TABLE IF EXISTS billing_clients;

CREATE TABLE billing_clients (
  id           TEXT PRIMARY KEY,
  name_enc     TEXT NOT NULL,
  name_key     TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  insurer_id   TEXT,
  profile_enc  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX billing_clients_identity ON billing_clients (identity_key);
CREATE INDEX billing_clients_namekey ON billing_clients (name_key);

-- 2) Link table: which clinicians see each client (practice-level, still isolated).
CREATE TABLE IF NOT EXISTS billing_client_clinicians (
  client_id    TEXT NOT NULL,
  clinician_id TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, clinician_id)
);
CREATE INDEX IF NOT EXISTS billing_client_clinicians_clin ON billing_client_clinicians (clinician_id);

-- 3) Sessions: link to the client record + a real "submitted to insurer" date.
ALTER TABLE billing_sessions
  ADD COLUMN IF NOT EXISTS client_id   TEXT,
  ADD COLUMN IF NOT EXISTS billed_date DATE;
CREATE INDEX IF NOT EXISTS billing_sessions_client_idx ON billing_sessions (client_id);
