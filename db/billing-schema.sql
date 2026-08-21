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
  claim_code  TEXT,                           -- payer code on CMS-1500 box 10d / header
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Existing installs: ALTER TABLE billing_insurers ADD COLUMN IF NOT EXISTS claim_code TEXT;

-- CPT / service codes (multi-select per session).
CREATE TABLE IF NOT EXISTS billing_cpt_codes (
  code        TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT true,
  fee         NUMERIC,   -- default service fee (KYD)
  hrs         NUMERIC    -- duration in hours
);
-- Existing installs: ALTER TABLE billing_cpt_codes ADD COLUMN IF NOT EXISTS fee NUMERIC, ADD COLUMN IF NOT EXISTS hrs NUMERIC;

-- Practice-wide money rules (biller commission %, running expenses) as one JSON blob.
CREATE TABLE IF NOT EXISTS billing_config (
  key   TEXT PRIMARY KEY,   -- 'practice'
  value JSONB NOT NULL
);

-- Per-clinician payout configuration (stacks to compute net payout).
CREATE TABLE IF NOT EXISTS billing_clinician_settings (
  clinician_id          TEXT PRIMARY KEY,          -- matches an id in lib/clinicians.ts
  retention_pct         NUMERIC NOT NULL DEFAULT 0, -- % of revenue the company keeps
  other_deduction_pct   NUMERIC NOT NULL DEFAULT 0, -- additional % deduction
  other_deduction_fixed NUMERIC NOT NULL DEFAULT 0, -- flat deduction per payout (health)
  pension               NUMERIC NOT NULL DEFAULT 0, -- flat pension deduction per payout
  biller_pct            NUMERIC,                   -- biller commission % on this clinician's insurance
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Existing installs: ALTER TABLE billing_clinician_settings ADD COLUMN IF NOT EXISTS biller_pct NUMERIC, ADD COLUMN IF NOT EXISTS pension NUMERIC NOT NULL DEFAULT 0;

-- Clinicians OUTSIDE the practice whose billing the biller handles privately.
-- No intake login, and deliberately NOT part of TIFEC's revenue or payouts:
-- the owner's pages map over the lib/clinicians.ts roster, so these are skipped.
-- The only money they drive is the biller's own commission. Ids are 'ext-...'.
CREATE TABLE IF NOT EXISTS billing_external_clinicians (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  biller_pct NUMERIC NOT NULL DEFAULT 0,  -- biller's % on this clinician's insurance
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per visit. 6 visits = 6 rows, each moves through the lifecycle
-- independently:  logged  ->  billed (submitted to insurer, billed_date)  ->
-- paid (insurer settled, insurance_paid + paid_date). Only PAID money feeds a
-- clinician's payout. Client name is AES-encrypted at rest; client_id links the
-- visit to the practice-level client record (billing_clients).
CREATE TABLE IF NOT EXISTS billing_sessions (
  id              TEXT PRIMARY KEY,
  clinician_id    TEXT NOT NULL,
  client_enc      TEXT NOT NULL,                 -- AES of JSON {first,last}
  client_id       TEXT,                          -- billing_clients.id (practice-level record)
  insurer_id      TEXT,                          -- billing_insurers.id (null = self-pay)
  date_of_service DATE NOT NULL,
  duration_hours  NUMERIC NOT NULL DEFAULT 0,
  total_cost      NUMERIC NOT NULL DEFAULT 0,
  copay_collected NUMERIC NOT NULL DEFAULT 0,
  copay_due       NUMERIC,                        -- co-pay that SHOULD have been collected (uncollected = due - collected)
  copay_paid_date TEXT,                           -- when the co-pay actually came in (null = not collected yet)
  billed_date     DATE,                          -- when the claim was submitted to the insurer
  insurance_paid  BOOLEAN NOT NULL DEFAULT false,
  paid_date       DATE,                          -- when insurance payment confirmed (= collected)
  notes           TEXT,
  created_by      TEXT NOT NULL,                 -- clinician_id who logged it
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_sessions_clinician_idx ON billing_sessions (clinician_id);
CREATE INDEX IF NOT EXISTS billing_sessions_paid_idx      ON billing_sessions (insurance_paid, paid_date);
CREATE INDEX IF NOT EXISTS billing_sessions_dos_idx       ON billing_sessions (date_of_service);
CREATE INDEX IF NOT EXISTS billing_sessions_client_idx    ON billing_sessions (client_id);
-- Existing installs: ALTER TABLE billing_sessions
--   ADD COLUMN IF NOT EXISTS client_id TEXT,
--   ADD COLUMN IF NOT EXISTS billed_date DATE;

-- Session <-> CPT codes (a session can carry several codes).
CREATE TABLE IF NOT EXISTS billing_session_cpt (
  session_id TEXT NOT NULL,
  code       TEXT NOT NULL,
  units      INTEGER NOT NULL DEFAULT 1,  -- how many of this code on the visit (e.g. extra assessment hours)
  PRIMARY KEY (session_id, code)
);

-- Practice-level client record (ADDITIVE). One row per real person, shared
-- across the whole practice — the SAME client can be seen by several clinicians
-- (see billing_client_clinicians). Holds everything a CMS-1500 claim needs
-- (demographics, insurance, diagnosis), all PHI AES-encrypted in profile_enc.
--   • identity_key = blind index of "first last | dob" — the practice-wide
--     identity, so name + DOB dedups one person into one record (never plaintext).
--   • name_key     = blind index of "first last" — for name-only lookups/merge.
CREATE TABLE IF NOT EXISTS billing_clients (
  id           TEXT PRIMARY KEY,
  name_enc     TEXT NOT NULL,              -- AES of {first,last}
  name_key     TEXT NOT NULL,              -- blind index of name (name-only match)
  identity_key TEXT NOT NULL,              -- blind index of name + DOB (practice identity)
  insurer_id   TEXT,                       -- usual insurer (null = self-pay)
  profile_enc  TEXT,                       -- AES JSON: dob, sex, address, phone, insurance, diagnosis
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_clients_identity ON billing_clients (identity_key);
CREATE INDEX IF NOT EXISTS billing_clients_namekey ON billing_clients (name_key);

-- Which clinicians see a given client. A client seen by two clinicians has two
-- rows here; each clinician's roster is the set of clients linked to them, while
-- the biller/owner sees every client. This is what makes clients practice-level
-- without breaking per-clinician isolation.
CREATE TABLE IF NOT EXISTS billing_client_clinicians (
  client_id    TEXT NOT NULL,             -- billing_clients.id
  clinician_id TEXT NOT NULL,             -- lib/clinicians.ts id (or ext-... )
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, clinician_id)
);
CREATE INDEX IF NOT EXISTS billing_client_clinicians_clin ON billing_client_clinicians (clinician_id);
