-- Run this once against your Neon Postgres database to create the tables.
-- (Neon SQL Editor, or: psql "$DATABASE_URL" -f db/schema.sql)

CREATE TABLE IF NOT EXISTS submissions (
  id                TEXT PRIMARY KEY,
  clinician_id      TEXT NOT NULL,
  token             TEXT NOT NULL UNIQUE,
  form_key          TEXT NOT NULL DEFAULT 'individual', -- which intake form was used
  answers_encrypted TEXT NOT NULL,         -- AES-256-GCM ciphertext (no plaintext PHI)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            TEXT NOT NULL DEFAULT 'new',  -- 'new' | 'reviewed' | 'archived'
  notes_encrypted   TEXT,                         -- AES-256-GCM ciphertext of clinician notes (nullable)
  couple_id         TEXT                          -- links the two partners of a couple (nullable)
);

CREATE INDEX IF NOT EXISTS submissions_clinician_idx ON submissions (clinician_id);
CREATE INDEX IF NOT EXISTS submissions_created_idx   ON submissions (created_at DESC);

-- If you created the submissions table before adding these columns, run:
--   ALTER TABLE submissions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
--   ALTER TABLE submissions ADD COLUMN IF NOT EXISTS notes_encrypted TEXT;
--   ALTER TABLE submissions ADD COLUMN IF NOT EXISTS form_key TEXT NOT NULL DEFAULT 'individual';
--   ALTER TABLE submissions ADD COLUMN IF NOT EXISTS couple_id TEXT;

CREATE INDEX IF NOT EXISTS submissions_couple_idx ON submissions (couple_id);

-- Access audit log (HIPAA): who viewed/changed which submission. No PHI here.
CREATE TABLE IF NOT EXISTS access_log (
  id               TEXT PRIMARY KEY,
  clinician_id     TEXT NOT NULL,
  submission_token TEXT NOT NULL,
  action           TEXT NOT NULL,          -- 'view' | 'status' | 'notes' | 'delete'
  detail           TEXT NOT NULL DEFAULT '',
  at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_log_token_idx ON access_log (submission_token);
CREATE INDEX IF NOT EXISTS access_log_clinician_idx ON access_log (clinician_id);

-- Clinician login credentials (password hashes only — set via the admin page).
CREATE TABLE IF NOT EXISTS clinician_users (
  clinician_id  TEXT PRIMARY KEY,          -- matches an id in lib/clinicians.ts
  password_hash TEXT NOT NULL,             -- scrypt "salt:hash" (see lib/auth.ts)
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  tour_seen     BOOLEAN NOT NULL DEFAULT false  -- first-login walkthrough shown once
);
-- Existing installs: ALTER TABLE clinician_users ADD COLUMN IF NOT EXISTS tour_seen BOOLEAN NOT NULL DEFAULT false;

-- Clinician-submitted issue reports ("Report an issue").
CREATE TABLE IF NOT EXISTS feedback (
  id            TEXT PRIMARY KEY,
  clinician_id  TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'Issue',
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);
