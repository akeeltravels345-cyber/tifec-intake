-- =============================================================================
-- TIFEC Billing System schema (ADDITIVE).
-- Run this once against Neon ONLY when the billing system is ready to go live.
-- It creates new `billing_*` tables and touches nothing in the intake system.
--   psql "$DATABASE_URL" -f db/billing-schema.sql   (or paste into Neon SQL editor)
-- =============================================================================

-- Insurers the practice bills (CINICO, BritCay, ...) + their co-pay rule.
CREATE TABLE IF NOT EXISTS billing_insurers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  copay_type  TEXT NOT NULL DEFAULT 'none',   -- 'none' | 'fixed' | 'percentage'
  copay_rate  NUMERIC NOT NULL DEFAULT 0,     -- fixed amount (KYD) or percent (0-100)
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CPT / service codes (multi-select per session).
CREATE TABLE IF NOT EXISTS billing_cpt_codes (
  code        TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT true
);

-- Per-clinician payout configuration (stacks to compute net payout).
CREATE TABLE IF NOT EXISTS billing_clinician_settings (
  clinician_id          TEXT PRIMARY KEY,          -- matches an id in lib/clinicians.ts
  retention_pct         NUMERIC NOT NULL DEFAULT 0, -- % of revenue the company keeps
  other_deduction_pct   NUMERIC NOT NULL DEFAULT 0, -- additional % deduction
  other_deduction_fixed NUMERIC NOT NULL DEFAULT 0, -- flat deduction per payout
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per visit. 6 visits = 6 rows, each flips to paid independently.
-- Client name is AES-encrypted at rest (client_enc = ciphertext of {first,last}).
CREATE TABLE IF NOT EXISTS billing_sessions (
  id              TEXT PRIMARY KEY,
  clinician_id    TEXT NOT NULL,
  client_enc      TEXT NOT NULL,                 -- AES of JSON {first,last}
  insurer_id      TEXT,                          -- billing_insurers.id (null = self-pay)
  date_of_service DATE NOT NULL,
  duration_hours  NUMERIC NOT NULL DEFAULT 0,
  total_cost      NUMERIC NOT NULL DEFAULT 0,
  copay_collected NUMERIC NOT NULL DEFAULT 0,
  insurance_paid  BOOLEAN NOT NULL DEFAULT false,
  paid_date       DATE,                          -- when insurance payment confirmed
  notes           TEXT,
  created_by      TEXT NOT NULL,                 -- clinician_id who logged it
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_sessions_clinician_idx ON billing_sessions (clinician_id);
CREATE INDEX IF NOT EXISTS billing_sessions_paid_idx      ON billing_sessions (insurance_paid, paid_date);
CREATE INDEX IF NOT EXISTS billing_sessions_dos_idx       ON billing_sessions (date_of_service);

-- Session <-> CPT codes (a session can carry several codes).
CREATE TABLE IF NOT EXISTS billing_session_cpt (
  session_id TEXT NOT NULL,
  code       TEXT NOT NULL,
  PRIMARY KEY (session_id, code)
);
