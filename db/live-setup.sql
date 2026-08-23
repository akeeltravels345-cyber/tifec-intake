-- =============================================================================
-- TIFEC live setup - run once in the Neon SQL Editor.
-- Safe to re-run: every statement is IF NOT EXISTS / ON CONFLICT.
-- Additive only: creates billing_* and comms_* tables and seeds reference data.
-- Nothing here touches the intake submissions.
-- =============================================================================

-- ---------- 1. Schema: billing ----------
-- TIFEC Billing System schema (ADDITIVE).
-- Run this once against Neon ONLY when the billing system is ready to go live.
-- It creates new `billing_*` tables and touches nothing in the intake system.

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
  other_deduction_fixed NUMERIC NOT NULL DEFAULT 0, -- flat deduction per payout
  biller_pct            NUMERIC,                   -- biller commission % on this clinician's insurance
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Existing installs: ALTER TABLE billing_clinician_settings ADD COLUMN IF NOT EXISTS biller_pct NUMERIC;

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
  copay_paid_date TEXT,                           -- when the co-pay actually came in (null = not collected yet)
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
  units      INTEGER NOT NULL DEFAULT 1,  -- how many of this code on the visit (e.g. extra assessment hours)
  PRIMARY KEY (session_id, code)
);


-- Existing installs: add columns that arrived later.
ALTER TABLE billing_cpt_codes ADD COLUMN IF NOT EXISTS fee NUMERIC;
ALTER TABLE billing_cpt_codes ADD COLUMN IF NOT EXISTS hrs NUMERIC;
ALTER TABLE billing_clinician_settings ADD COLUMN IF NOT EXISTS biller_pct NUMERIC;
ALTER TABLE billing_clinician_settings ADD COLUMN IF NOT EXISTS pension_pct NUMERIC NOT NULL DEFAULT 10;

-- ---------- 2. Schema: team comms ----------
-- TIFEC team comms schema (ADDITIVE).
-- Messages, tickets and notices. Creates new comms_* tables and touches
-- nothing in the intake or billing systems.

-- One row per message. thread_id is either:
--   'dm:<idA>|<idB>'  a direct message pair (ids sorted, so the pair is stable)
--   'ticket:<id>'     the discussion on a ticket
-- Bodies are AES-encrypted at rest, like intake answers.
CREATE TABLE IF NOT EXISTS comms_messages (
  id         TEXT PRIMARY KEY,
  thread_id  TEXT NOT NULL,
  sender_id  TEXT NOT NULL,          -- clinician id
  body_enc   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comms_messages_thread_idx ON comms_messages (thread_id, created_at);

-- How far each person has read in each thread; drives the unread badges.
CREATE TABLE IF NOT EXISTS comms_reads (
  thread_id    TEXT NOT NULL,
  clinician_id TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, clinician_id)
);

-- Tickets raised by a clinician and assigned to the owner, biller or admin.
CREATE TABLE IF NOT EXISTS comms_tickets (
  id         TEXT PRIMARY KEY,
  ref        INTEGER NOT NULL,       -- short human reference (#7)
  created_by TEXT NOT NULL,          -- who the ticket is FROM (the person with the issue)
  entered_by TEXT,                   -- who actually logged it, when different (raised on someone's behalf)
  assignees  JSONB NOT NULL DEFAULT '[]',  -- one or more clinician ids: a ticket can need the biller AND the admin
  area       TEXT NOT NULL,          -- subject area
  subject_enc TEXT NOT NULL,       -- encrypted: a subject line will name a client sooner or later
  body_enc   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open',  -- open | in_progress | resolved
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comms_tickets_status_idx ON comms_tickets (status);
-- Existing installs (if you ran an earlier version of this file):
--   ALTER TABLE comms_tickets ADD COLUMN IF NOT EXISTS assignees JSONB NOT NULL DEFAULT '[]';
--   UPDATE comms_tickets SET assignees = to_jsonb(ARRAY[assignee]) WHERE assignees = '[]'::jsonb AND assignee IS NOT NULL;
--   ALTER TABLE comms_tickets DROP COLUMN IF EXISTS assignee;
--   DROP INDEX IF EXISTS comms_tickets_assignee_idx;

-- Practice-wide notices (meetings, announcements). Everyone sees these.
CREATE TABLE IF NOT EXISTS comms_notices (
  id         TEXT PRIMARY KEY,
  author_id  TEXT NOT NULL,
  title_enc  TEXT NOT NULL,        -- encrypted, like the body
  body_enc   TEXT NOT NULL,
  event_at   TIMESTAMPTZ,            -- set when the notice is a meeting
  pinned     BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- If an earlier version of the comms schema was run, move single -> multiple assignees.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'comms_tickets' AND column_name = 'assignee') THEN
    ALTER TABLE comms_tickets ADD COLUMN IF NOT EXISTS assignees JSONB NOT NULL DEFAULT '[]';
    UPDATE comms_tickets SET assignees = to_jsonb(ARRAY[assignee]) WHERE assignees = '[]'::jsonb;
    ALTER TABLE comms_tickets DROP COLUMN assignee;
  END IF;
END $$;

-- ---------- 3. The seven insurers + baseline co-pays ----------
INSERT INTO billing_insurers (id, name, copay_type, copay_rate, active) VALUES ('ins-aetna', 'Aetna', 'percentage', 20, true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, copay_type = EXCLUDED.copay_type, copay_rate = EXCLUDED.copay_rate, active = EXCLUDED.active;
INSERT INTO billing_insurers (id, name, copay_type, copay_rate, active) VALUES ('ins-britcay', 'BritCay', 'percentage', 20, true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, copay_type = EXCLUDED.copay_type, copay_rate = EXCLUDED.copay_rate, active = EXCLUDED.active;
INSERT INTO billing_insurers (id, name, copay_type, copay_rate, active) VALUES ('ins-caymanfirst', 'Cayman First', 'percentage', 20, true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, copay_type = EXCLUDED.copay_type, copay_rate = EXCLUDED.copay_rate, active = EXCLUDED.active;
INSERT INTO billing_insurers (id, name, copay_type, copay_rate, active) VALUES ('ins-baf', 'BAF', 'percentage', 20, true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, copay_type = EXCLUDED.copay_type, copay_rate = EXCLUDED.copay_rate, active = EXCLUDED.active;
INSERT INTO billing_insurers (id, name, copay_type, copay_rate, active) VALUES ('ins-cinico', 'CINICO', 'none', 0, true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, copay_type = EXCLUDED.copay_type, copay_rate = EXCLUDED.copay_rate, active = EXCLUDED.active;
INSERT INTO billing_insurers (id, name, copay_type, copay_rate, active) VALUES ('ins-onehealth', 'One Health', 'percentage', 20, true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, copay_type = EXCLUDED.copay_type, copay_rate = EXCLUDED.copay_rate, active = EXCLUDED.active;
INSERT INTO billing_insurers (id, name, copay_type, copay_rate, active) VALUES ('ins-vanguard', 'Vanguard', 'percentage', 20, true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, copay_type = EXCLUDED.copay_type, copay_rate = EXCLUDED.copay_rate, active = EXCLUDED.active;

-- ---------- 4. Fee-bearing service codes (39) ----------
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90785', 'Psychotherapy, complex interactive', true, 87.4, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90791', 'Psychiatric diagnostic evaluation', true, 276.51, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90792', 'Psychiatric diagnostic eval, with medical', true, 222.74, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90807', 'Individual psychotherapy 45-50 min, with eval', true, 100, 0.75)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90832', 'Psychotherapy, 30 min', true, 114.22, 0.5)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90837', 'Psychotherapy, 60 min', true, 211.77, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90839', 'Psychotherapy for crisis, first 60 min', true, 250, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90845', 'Psychoanalysis', true, 195.68, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90846', 'Family psychotherapy (without patient)', true, 250, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90847', 'Family psychotherapy (with patient)', true, 250, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90849', 'Multiple-family group psychotherapy', true, 129.6, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90853', 'Group psychotherapy', true, 87.3, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90885', 'Psychiatric eval of hospital records', true, 120.97, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90887', 'Interpretation of results to family', true, 159.3, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90889', 'Report prep, psychiatric status', true, 171, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('90901', 'Biofeedback training, any modality', true, 123.3, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96101', 'Psychological testing, per hr with patient', true, 191.25, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96102', 'Neuropsych/psych test administration', true, 93.33, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96118', 'Neuropsychological testing & reporting', true, 234.56, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96120', 'Neuropsychological testing (computer)', true, 115.84, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96121', 'Neurobehavioral status exam', true, 75.91, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96127', 'Behavioral assessment (standardized)', true, 7.65, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96130', 'Psychological testing & evaluation, 1st hr', true, 120.3, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96131', 'Psychological testing & evaluation, addl hr', true, 86.75, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96132', 'Neuropsychological testing eval (physician)', true, 234.56, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96133', 'Neuropsychological testing eval, addl hr', true, 156.24, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96136', 'Psych/neuropsych test, ADHD 1', true, 250, 0.5)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96137', 'Psych/neuropsych test, ADHD 2', true, 250, 0.5)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96138', 'Psych/neuropsych test, ADHD 3', true, 250, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96145', 'Single automated psych/neuropsych test', true, 1.84, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('96151', 'Reassessment', true, 27.87, 0.25)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('98968', 'Telephone assessment (non-face-to-face)', true, 57.11, 0.25)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('99354', 'Prolonged service, office, 1st hr', true, 186.25, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('99355', 'Prolonged service, office, ea 30 min', true, 90.8, 0.5)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('99367', 'Multi-disciplinary team', true, 64, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('CYBERPSYCH', 'Cyberpsychology presentation', true, 45, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('EMO-INT', 'Emotional intelligence', true, 200, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('PEERS', 'PEERS social skills group', true, 160, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;
INSERT INTO billing_cpt_codes (code, description, active, fee, hrs) VALUES ('TRAVEL', 'Travel', true, 175, 1)
  ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = EXCLUDED.active, fee = EXCLUDED.fee, hrs = EXCLUDED.hrs;

-- ---------- 5. Per-clinician splits + biller commission ----------
-- Only biller_pct is overwritten, so any retention you've tuned in Setup survives.
INSERT INTO billing_clinician_settings (clinician_id, retention_pct, other_deduction_pct, other_deduction_fixed, biller_pct) VALUES ('shion-oconnor', 40, 0, 0, 10)
  ON CONFLICT (clinician_id) DO UPDATE SET biller_pct = EXCLUDED.biller_pct;
INSERT INTO billing_clinician_settings (clinician_id, retention_pct, other_deduction_pct, other_deduction_fixed, biller_pct) VALUES ('donnet-oconnor', 40, 0, 250, 10)
  ON CONFLICT (clinician_id) DO UPDATE SET biller_pct = EXCLUDED.biller_pct;
INSERT INTO billing_clinician_settings (clinician_id, retention_pct, other_deduction_pct, other_deduction_fixed, biller_pct) VALUES ('joan-latty', 40, 0, 0, 7)
  ON CONFLICT (clinician_id) DO UPDATE SET biller_pct = EXCLUDED.biller_pct;
INSERT INTO billing_clinician_settings (clinician_id, retention_pct, other_deduction_pct, other_deduction_fixed, biller_pct) VALUES ('sofia-hamilton', 40, 0, 0, 7)
  ON CONFLICT (clinician_id) DO UPDATE SET biller_pct = EXCLUDED.biller_pct;
INSERT INTO billing_clinician_settings (clinician_id, retention_pct, other_deduction_pct, other_deduction_fixed, biller_pct) VALUES ('nick-oconnor', 0, 0, 0, 0)
  ON CONFLICT (clinician_id) DO UPDATE SET biller_pct = EXCLUDED.biller_pct;
INSERT INTO billing_clinician_settings (clinician_id, retention_pct, other_deduction_pct, other_deduction_fixed, biller_pct) VALUES ('akeel-test', 40, 0, 0, 0)
  ON CONFLICT (clinician_id) DO UPDATE SET biller_pct = EXCLUDED.biller_pct;

-- ---------- 6. Check it worked ----------
SELECT 'insurers' AS thing, count(*) AS rows FROM billing_insurers
UNION ALL SELECT 'cpt codes', count(*) FROM billing_cpt_codes
UNION ALL SELECT 'outside clinicians', count(*) FROM billing_external_clinicians
UNION ALL SELECT 'clinicians with a biller %', count(*) FROM billing_clinician_settings WHERE biller_pct > 0
UNION ALL SELECT 'comms tables ready', count(*) FROM information_schema.tables
  WHERE table_name IN ('comms_messages','comms_reads','comms_tickets','comms_notices');
