-- =============================================================================
-- demo-setup.sql  ·  ONE-PASTE database setup for a fresh (demo or new) instance.
-- Base schemas, table-creating migrations, column migrations, scheduling base +
-- catch-up, the self-created tables, and the sample config seed. Paste once into
-- a NEW, EMPTY database (Neon SQL Editor). Do not run against a DB with data.
-- =============================================================================

-- >>>>>>>>>> db/schema.sql

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
  tour_seen     BOOLEAN NOT NULL DEFAULT false, -- first-login walkthrough shown once
  idle_minutes  INTEGER,                         -- per-user auto-logout window; null = default (15)
  avatar        TEXT                             -- profile photo as a small square JPEG data URL; null = none
);
-- Existing installs: ALTER TABLE clinician_users ADD COLUMN IF NOT EXISTS tour_seen BOOLEAN NOT NULL DEFAULT false;
-- Existing installs: ALTER TABLE clinician_users ADD COLUMN IF NOT EXISTS idle_minutes INTEGER;
-- Existing installs: ALTER TABLE clinician_users ADD COLUMN IF NOT EXISTS avatar TEXT;

-- Clinician-submitted issue reports ("Report an issue").
CREATE TABLE IF NOT EXISTS feedback (
  id            TEXT PRIMARY KEY,
  clinician_id  TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'Issue',
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);

-- >>>>>>>>>> db/billing-schema.sql

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
  pension               NUMERIC NOT NULL DEFAULT 0, -- legacy flat pension (unused)
  pension_pct           NUMERIC NOT NULL DEFAULT 10, -- pension rate: % of the after-retention share
  biller_pct            NUMERIC,                   -- biller commission % on this clinician's insurance
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Existing installs: ALTER TABLE billing_clinician_settings ADD COLUMN IF NOT EXISTS biller_pct NUMERIC, ADD COLUMN IF NOT EXISTS pension NUMERIC NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS pension_pct NUMERIC NOT NULL DEFAULT 10;

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

-- >>>>>>>>>> db/comms-schema.sql

-- =============================================================================
-- TIFEC team comms schema (ADDITIVE).
-- Messages, tickets and notices. Creates new comms_* tables and touches
-- nothing in the intake or billing systems.
--   psql "$DATABASE_URL" -f db/comms-schema.sql   (or paste into Neon SQL editor)
-- =============================================================================

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
  created_by TEXT NOT NULL,
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

-- In-app notifications: new message, ticket raised, reply, status change, notice.
-- `body` is written by the server and deliberately carries NO ticket subject,
-- notice title or message text — those can name a client, and a notification is
-- the thing people glance at with someone stood beside them.
CREATE TABLE IF NOT EXISTS comms_notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,          -- who should see it
  kind       TEXT NOT NULL,          -- message | ticket_new | ticket_reply | ticket_status | notice
  body       TEXT NOT NULL,
  href       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS comms_notifications_user_idx ON comms_notifications (user_id, read_at, created_at DESC);

-- Email delivery log: one row per team email we ATTEMPTED, with its outcome, so
-- "did the notice email go out?" is answerable. No PHI (only the kind, the staff
-- recipient, and sent/failed/skipped).
CREATE TABLE IF NOT EXISTS comms_email_log (
  id              TEXT PRIMARY KEY,
  recipient_id    TEXT,
  recipient_email TEXT,
  kind            TEXT,                    -- notice | ticket_new | ticket_reply | ticket_resolved
  status          TEXT NOT NULL,           -- sent | failed | skipped
  detail          TEXT,                    -- error / reason
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comms_email_log_at ON comms_email_log (created_at DESC);

-- Custom group chats: named, member-picked conversations. Messages live in
-- comms_messages under thread_id 'group:<id>'.
CREATE TABLE IF NOT EXISTS comms_groups (
  id          TEXT PRIMARY KEY,
  name_enc    TEXT NOT NULL,
  member_ids  JSONB NOT NULL DEFAULT '[]',
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- >>>>>>>>>> db/migrate-builder-tasks.sql

-- Migration: per-user worklists (the "My worklist" panel on Today, the business
-- overview, and the biller dashboard). Each row is one heading, with its tasks
-- stored in the `subs` JSON array. Scoped by owner_id so every user only ever
-- reads and writes their own list. ADDITIVE and safe to run more than once.
CREATE TABLE IF NOT EXISTS builder_tasks (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  blurb       TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  subs        JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS builder_tasks_owner_idx ON builder_tasks (owner_id);

-- >>>>>>>>>> db/migrate-client-docs.sql

-- Stored document files for client records (referral letters, etc.).
-- Bytes are held encrypted (AES-256-GCM, same as all other PHI) as base64 in
-- content_enc. The lightweight metadata (name, kind, size) lives in the client's
-- profile blob; only this table carries the actual file, loaded on download.
CREATE TABLE IF NOT EXISTS billing_client_docs (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL,
  content_enc TEXT NOT NULL,
  mime        TEXT,
  size        INTEGER,
  name        TEXT,          -- original filename (for ticket attachments); nullable
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS billing_client_docs_client ON billing_client_docs (client_id);

-- >>>>>>>>>> db/migrate-client-seen.sql

-- Per-user "seen" marks for the client list's "New" tag: a recently added client
-- (intake / booking auto-create) shows as New to each user until THAT user opens
-- the record. The app also creates this table lazily on first write (markClient
-- Seen), so production self-migrates; this file documents the schema. Re-runnable.

CREATE TABLE IF NOT EXISTS billing_client_seen (
  client_id    text NOT NULL,
  clinician_id text NOT NULL,
  seen_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, clinician_id)
);

-- >>>>>>>>>> db/migrate-clients-v2.sql

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

-- >>>>>>>>>> db/migrate-clinician-expenses.sql

-- A clinician's own private monthly expenses (running + one-off). Private to the
-- clinician; never shown on the company payout statement. One row per clinician
-- per month; the app carries running items forward when a new month has no row.
CREATE TABLE IF NOT EXISTS billing_clinician_expenses (
  clinician_id text NOT NULL,
  month        text NOT NULL,               -- "YYYY-MM"
  expenses     jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (clinician_id, month)
);

-- >>>>>>>>>> db/migrate-comms-groups.sql

-- Migration: custom group chats. A group is a named, member-picked conversation;
-- its messages live in comms_messages under thread_id 'group:<id>'. Additive and
-- safe. Run once on live.
CREATE TABLE IF NOT EXISTS comms_groups (
  id          TEXT PRIMARY KEY,
  name_enc    TEXT NOT NULL,                 -- encrypted group name
  member_ids  JSONB NOT NULL DEFAULT '[]',   -- clinician ids in the group (incl. creator)
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- >>>>>>>>>> db/migrate-email-log.sql

-- Migration: email delivery log. Safe, additive. Run once on live.
CREATE TABLE IF NOT EXISTS comms_email_log (
  id              TEXT PRIMARY KEY,
  recipient_id    TEXT,
  recipient_email TEXT,
  kind            TEXT,
  status          TEXT NOT NULL,
  detail          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comms_email_log_at ON comms_email_log (created_at DESC);

-- >>>>>>>>>> db/migrate-import-staging.sql

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

-- >>>>>>>>>> db/migrate-insurer-created-at.sql

-- billing_insurers.created_at was added to db/billing-schema.sql after some
-- databases had already created the table (CREATE TABLE IF NOT EXISTS no-ops on
-- an existing table), so those tables never gained the column. This backfills
-- it. Idempotent and safe to re-run. No application code depends on the column.
ALTER TABLE billing_insurers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- >>>>>>>>>> db/migrate-notice-acks.sql

-- Notice acknowledgements + "ask for acknowledgement" state, kept in a separate
-- table so the notices table is untouched. Reads degrade to "no acks" if this
-- hasn't been run yet (the app never 500s on a missing table).
CREATE TABLE IF NOT EXISTS comms_notice_meta (
  notice_id text PRIMARY KEY,
  ask_ack   boolean NOT NULL DEFAULT false,
  acks      jsonb   NOT NULL DEFAULT '[]'::jsonb
);

-- >>>>>>>>>> db/migrate-session-notes.sql

-- Clinical session notes (SOAP). The note body is encrypted at rest (PHI); only
-- clinicians linked to the client ever see the content. Optionally tied to a
-- logged visit (session_id).
CREATE TABLE IF NOT EXISTS session_notes (
  id           text PRIMARY KEY,
  client_id    text NOT NULL,
  clinician_id text NOT NULL,       -- author
  session_id   text,                -- optional link to a billing session (visit)
  note_date    text NOT NULL,       -- YYYY-MM-DD
  body_enc     text NOT NULL,       -- encrypted JSON { s, o, a, p }
  created_at   text NOT NULL,
  updated_at   text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_notes_client ON session_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_session_notes_clin   ON session_notes(clinician_id);

-- >>>>>>>>>> db/migrate-avatar.sql

-- Per-user profile photo (small square JPEG data URL). Null = no photo.
-- Safe to run more than once.
ALTER TABLE clinician_users ADD COLUMN IF NOT EXISTS avatar TEXT;

-- >>>>>>>>>> db/migrate-bill-note.sql

-- A biller's short note on a claim in the billing queue (e.g. why it isn't
-- billed yet, like "waiting on auth"). Operational, not clinical — it shows in
-- the To-bill queue and, read-only, to the clinician on their payout page and
-- the client record, so a claim sitting for days reads as "in hand", not
-- forgotten. Capped to 40 chars in the app. ADDITIVE and re-runnable.

ALTER TABLE billing_sessions
  ADD COLUMN IF NOT EXISTS bill_note TEXT;

-- >>>>>>>>>> db/migrate-biller-base.sql

-- The biller's per-clinician % is charged on what the clinician RECEIVES AFTER
-- the company retention (their after-retention share), not the gross insurance
-- billed. That's the default (stored as 0 = "auto"). A non-zero value is an
-- explicit override for a special deal — Nick bills Joan on 70% of hers right now.
ALTER TABLE billing_clinician_settings
  ADD COLUMN IF NOT EXISTS biller_base_pct NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE billing_clinician_settings
  ALTER COLUMN biller_base_pct SET DEFAULT 0;

-- If an earlier version defaulted this to 100 (charge on the full billed amount),
-- reset those to 0 so they use the correct after-retention base.
UPDATE billing_clinician_settings SET biller_base_pct = 0 WHERE biller_base_pct = 100;

-- Joan's special arrangement with Nick.
UPDATE billing_clinician_settings
  SET biller_base_pct = 70, updated_at = now()
  WHERE clinician_id = 'joan-latty';

-- >>>>>>>>>> db/migrate-biller-commission-applies.sql

-- The practice-wide biller commission (3% of company retention) is only agreed
-- for select clinicians. This flag opts a clinician in; default off for everyone,
-- pre-enabled for Sofia Hamilton and Joan Latty (the two it currently applies to).
ALTER TABLE billing_clinician_settings
  ADD COLUMN IF NOT EXISTS biller_commission_applies BOOLEAN NOT NULL DEFAULT FALSE;

-- Pre-enable the two clinicians it applies to today. If they don't have a
-- settings row yet, create one with the practice defaults.
INSERT INTO billing_clinician_settings (clinician_id, retention_pct, other_deduction_pct, other_deduction_fixed, pension, biller_commission_applies, updated_at)
VALUES
  ('sofia-hamilton', 40, 0, 0, 0, TRUE, now()),
  ('joan-latty',     40, 0, 0, 0, TRUE, now())
ON CONFLICT (clinician_id) DO UPDATE SET biller_commission_applies = TRUE, updated_at = now();

-- >>>>>>>>>> db/migrate-builder-tasks-archived.sql

-- Migration: archiving for worklists. A finished heading can be archived (tucked
-- into an "Archived" section) without deleting it; individual finished tasks are
-- archived inside the subs JSON, so only the heading-level flag needs a column.
-- ADDITIVE and safe to run more than once.
ALTER TABLE builder_tasks ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- >>>>>>>>>> db/migrate-copay-due.sql

-- Migration: track the co-pay that SHOULD have been collected, so uncollected
-- co-pays (write-offs) can be surfaced. Safe, additive. Run once on live.
ALTER TABLE billing_sessions ADD COLUMN IF NOT EXISTS copay_due NUMERIC;

-- >>>>>>>>>> db/migrate-copay-paid-date.sql

-- When a co-pay actually came in. A co-pay taken at the visit gets the visit
-- date; one that was "didn't collect" and later recorded by the clinician gets
-- the date it was received, so the money books to the month it arrived (like
-- self-pay). Nullable = not collected yet. ADDITIVE and re-runnable.

ALTER TABLE billing_sessions
  ADD COLUMN IF NOT EXISTS copay_paid_date TEXT;

-- >>>>>>>>>> db/migrate-cpt-units.sql

-- Units per service code, so a clinician can bill the same CPT code more than
-- once on a visit (e.g. two extended assessment hours). Each row in
-- billing_session_cpt already carries one distinct code per session; this adds a
-- unit COUNT to that row. The money is unaffected (billing_sessions.total_cost is
-- the authoritative amount) — units keep the code list and duration honest.
--
-- ADDITIVE and safe to run more than once. Existing rows default to 1 unit.

ALTER TABLE billing_session_cpt
  ADD COLUMN IF NOT EXISTS units INTEGER NOT NULL DEFAULT 1;

-- >>>>>>>>>> db/migrate-cpt-variants.sql

-- Let a service code hold multiple time/value options (e.g. 90834 at 45 min and
-- a 15-min slot at $57.11). Stored as a JSON array of {label, minutes, fee};
-- the code's base fee/hrs mirror the first (default) variant for back-compat.
ALTER TABLE billing_cpt_codes ADD COLUMN IF NOT EXISTS variants jsonb;

-- >>>>>>>>>> db/migrate-doc-name.sql

-- Original filename for a stored file. Client-record documents keep their name in
-- the client profile blob, but ticket attachments (images, voice notes, and now
-- PDFs / documents) have no such blob — so we store the name here to show it and
-- to serve downloads with a sensible filename. Nullable; ADDITIVE and re-runnable.

ALTER TABLE billing_client_docs
  ADD COLUMN IF NOT EXISTS name TEXT;

-- >>>>>>>>>> db/migrate-idle-minutes.sql

-- Per-user auto-logout window (minutes). Null / absent = default (15).
-- Safe to run more than once.
ALTER TABLE clinician_users ADD COLUMN IF NOT EXISTS idle_minutes INTEGER;

-- >>>>>>>>>> db/migrate-insurance-adjust.sql

-- Let the biller settle an insurance claim with a contractual write-off or a
-- write-down. `insurance_disposition` names the bucket ('writeoff' | 'writedown');
-- `insurance_collected` is the cash actually collected on that claim (0 for a
-- full write-off, the allowed amount for a partial). The rest of the billed
-- amount is the adjustment and lands in its own bucket — never with waived co-pays.
ALTER TABLE billing_sessions ADD COLUMN IF NOT EXISTS insurance_disposition text;
ALTER TABLE billing_sessions ADD COLUMN IF NOT EXISTS insurance_collected numeric;

-- >>>>>>>>>> db/migrate-insurer-bill-style.sql

-- How a payer is billed. NULL/'claim' = the standard CMS-1500 claim form.
-- 'invoice' = a self-pay-style invoice billed to the payer, with its own
-- sequential invoice number (e.g. Ponciana Rehabilitation / PRC). The claim
-- workflow is otherwise unchanged. ADDITIVE and re-runnable.

ALTER TABLE billing_insurers
  ADD COLUMN IF NOT EXISTS bill_style TEXT;

-- >>>>>>>>>> db/migrate-insurer-claimcode.sql

-- Migration: per-insurer payer code for CMS-1500 (box 10d / header, e.g. "362").
-- Safe, additive. Run once on the live Neon database.
ALTER TABLE billing_insurers ADD COLUMN IF NOT EXISTS claim_code TEXT;

-- >>>>>>>>>> db/migrate-insurer-email.sql

-- Migration: per-insurer claims email, where the biller sends this payer's
-- CMS-1500 claim for processing. Safe, additive. Run once on the live Neon database.
ALTER TABLE billing_insurers ADD COLUMN IF NOT EXISTS email TEXT;

-- >>>>>>>>>> db/migrate-invoice-no.sql

-- Sequential invoice number stamped on sessions billed to an invoice-style payer
-- (bill_style = 'invoice', e.g. Ponciana Rehabilitation). One number is shared by
-- all sessions on the same invoice; the series starts at 5003. NULL for every
-- normal (CMS-1500) claim. ADDITIVE and re-runnable.

ALTER TABLE billing_sessions
  ADD COLUMN IF NOT EXISTS invoice_no INTEGER;

-- >>>>>>>>>> db/migrate-no-payout.sql

-- The clinician-settings code writes an optional "no payout" flag, so the column
-- must exist. It stays OFF by default. The owner (Dr. Shion) is calculated as a
-- normal clinician with 40% retention, so the biller commission and the whole
-- company/net math compute correctly on his collections.
ALTER TABLE billing_clinician_settings
  ADD COLUMN IF NOT EXISTS no_payout BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE billing_clinician_settings
  SET no_payout = FALSE, retention_pct = 40, updated_at = now()
  WHERE clinician_id = 'shion-oconnor';

-- >>>>>>>>>> db/migrate-pension-pct.sql

-- Migration: pension is now a % of the clinician's after-retention share (the
-- legacy `pension` flat column is no longer used). Editable per clinician by the
-- owner/admin in Setup. Safe, additive, defaults to 10. Run once on live.
ALTER TABLE billing_clinician_settings ADD COLUMN IF NOT EXISTS pension_pct NUMERIC NOT NULL DEFAULT 10;

-- >>>>>>>>>> db/migrate-pension.sql

-- Migration: per-clinician pension deduction. Safe, additive. Run once on live.
ALTER TABLE billing_clinician_settings ADD COLUMN IF NOT EXISTS pension NUMERIC NOT NULL DEFAULT 0;

-- >>>>>>>>>> db/migrate-self-pay-status.sql

-- Self-pay disposition: how a self-pay visit was settled.
--   NULL      = paid in full at the visit (the default; existing self-pay unchanged)
--   'owing'   = a running balance the client still owes (partial or nothing paid)
--   'waived'  = the fee was written off
-- Ignored for insured sessions. The app degrades gracefully if this hasn't run
-- yet (reads/writes fall back to a version without the column), but run it so the
-- biller's owed-by-clients tracking and the Waived state work.

ALTER TABLE billing_sessions ADD COLUMN IF NOT EXISTS self_pay_status text;

-- >>>>>>>>>> db/migrate-ticket-entered-by.sql

-- "On behalf of" tickets: when someone calls or messages about an issue and a
-- colleague (usually the admin) logs the ticket for them, the ticket is recorded
-- as RAISED BY the person it's from (so updates and the resolution reach them),
-- and entered_by records who actually typed it in. Nullable; null = the raiser
-- logged it themselves, as before.
--
-- ADDITIVE and safe to run more than once.

ALTER TABLE comms_tickets
  ADD COLUMN IF NOT EXISTS entered_by TEXT;

-- >>>>>>>>>> db/scheduling-base.sql

-- =============================================================================
-- Scheduling base tables. These three were originally created by hand on prod
-- and never committed as SQL; reconstructed from lib/scheduling.ts so a fresh
-- database (demo or new instance) can be stood up. The catch-up columns and the
-- waitlist/settings/video/offers tables are added by scheduling-migrations.sql,
-- which must run AFTER this file. Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS scheduling_appointment_types (
  id                      text PRIMARY KEY,
  name                    text,
  category                text,
  duration_min            integer DEFAULT 60,
  buffer_before_min       integer DEFAULT 0,
  buffer_after_min        integer DEFAULT 0,
  price                   numeric DEFAULT 0,
  color                   text,
  mode                    text,
  baseline_cpt_codes      jsonb DEFAULT '[]'::jsonb,
  intake_form_key         text,
  new_client_intake_only  boolean DEFAULT false,
  active                  boolean DEFAULT true,
  sort_order              integer DEFAULT 0,
  created_at              text,
  updated_at              text
);

CREATE TABLE IF NOT EXISTS scheduling_availability (
  clinician_id      text PRIMARY KEY,
  weekly            jsonb DEFAULT '[]'::jsonb,
  overrides         jsonb DEFAULT '[]'::jsonb,
  min_notice_hours  integer DEFAULT 0,
  book_ahead_days   integer DEFAULT 60,
  max_per_day       integer,
  slot_interval_min integer DEFAULT 15,
  updated_at        text
);

CREATE TABLE IF NOT EXISTS scheduling_appointments (
  id                 text PRIMARY KEY,
  kind               text,
  client_id          text,
  client_name        text,
  client_email       text,
  clinician_id       text,
  type_id            text,
  title              text,
  start_at           timestamptz,
  end_at             timestamptz,
  mode               text,
  location_or_link   text,
  status             text,
  insurance_path     text,
  insurer_id         text,
  policy_no          text,
  intake_status      text,
  billing_session_id text,
  notes              text,
  created_by         text,
  source             text,
  created_at         text,
  updated_at         text
);
CREATE INDEX IF NOT EXISTS scheduling_appointments_start_idx ON scheduling_appointments (start_at);

-- >>>>>>>>>> scheduling-migrations.sql

-- ============================================================================
-- TIFEC scheduling — catch-up migrations (idempotent, safe to re-run)
-- Run this once against the Neon (production) database. Every new column uses
-- ADD COLUMN IF NOT EXISTS, and the app writes them through guarded try/catch,
-- so nothing here can break the live app whether or not it has run yet.
-- ============================================================================

-- Appointment types: group capacity, client-facing description, custom questions
ALTER TABLE scheduling_appointment_types ADD COLUMN IF NOT EXISTS capacity     integer NOT NULL DEFAULT 1;
ALTER TABLE scheduling_appointment_types ADD COLUMN IF NOT EXISTS description  text    NOT NULL DEFAULT '';
ALTER TABLE scheduling_appointment_types ADD COLUMN IF NOT EXISTS questions    jsonb   NOT NULL DEFAULT '[]'::jsonb;

-- Appointments: recurring link, group seats + roster, custom-question answers
ALTER TABLE scheduling_appointments ADD COLUMN IF NOT EXISTS series_id  text;
ALTER TABLE scheduling_appointments ADD COLUMN IF NOT EXISTS capacity   integer NOT NULL DEFAULT 1;
ALTER TABLE scheduling_appointments ADD COLUMN IF NOT EXISTS attendees  jsonb   NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE scheduling_appointments ADD COLUMN IF NOT EXISTS answers    jsonb   NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE scheduling_appointments ADD COLUMN IF NOT EXISTS video_event_id text;
ALTER TABLE scheduling_appointments ADD COLUMN IF NOT EXISTS intake_reminder_at text;
ALTER TABLE scheduling_appointments ADD COLUMN IF NOT EXISTS couple_id text;

-- Availability: external iCal feeds whose events block bookings
ALTER TABLE scheduling_availability ADD COLUMN IF NOT EXISTS busy_feeds jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Waitlist
CREATE TABLE IF NOT EXISTS scheduling_waitlist (
  id           text PRIMARY KEY,
  type_id      text,
  clinician_id text,
  name         text NOT NULL DEFAULT '',
  email        text NOT NULL DEFAULT '',
  phone        text NOT NULL DEFAULT '',
  note         text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'waiting',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Settings (single JSON blob keyed 'default' — booking page, notifications,
-- billing bridge)
CREATE TABLE IF NOT EXISTS scheduling_settings (
  id   text PRIMARY KEY,
  data jsonb NOT NULL
);

-- Per-clinician video connections (each clinician connects their OWN Zoom /
-- Google Meet via OAuth; tokens stored here, one row per clinician+provider)
CREATE TABLE IF NOT EXISTS scheduling_video_connections (
  clinician_id  text NOT NULL,
  provider      text NOT NULL,                 -- 'zoom' | 'google'
  access_token  text NOT NULL DEFAULT '',
  refresh_token text NOT NULL DEFAULT '',
  expires_at    bigint NOT NULL DEFAULT 0,     -- epoch ms
  account_email text NOT NULL DEFAULT '',
  preferred     boolean NOT NULL DEFAULT false,
  connected_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinician_id, provider)
);

-- Series link for recurring appointments (created earlier; ensure present)
ALTER TABLE scheduling_appointments ADD COLUMN IF NOT EXISTS series_id text;

-- Waitlist auto-fill: one row per freed slot that was offered to the waitlist.
-- First matching client to claim it wins (status flips open -> claimed atomically).
CREATE TABLE IF NOT EXISTS scheduling_offers (
  id                 text PRIMARY KEY,
  clinician_id       text NOT NULL,
  type_id            text,
  start_at           timestamptz NOT NULL,
  end_at             timestamptz NOT NULL,
  mode               text NOT NULL DEFAULT 'in_person',
  location_hint      text NOT NULL DEFAULT '',
  status             text NOT NULL DEFAULT 'open',   -- 'open' | 'claimed' | 'expired'
  claimed_entry_id   text,
  claimed_appt_id    text,
  notified_entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS scheduling_offers_status_idx ON scheduling_offers (status);

-- Per-clinician preferences (daily agenda email opt-out; defaults ON)
CREATE TABLE IF NOT EXISTS scheduling_clinician_prefs (
  clinician_id text PRIMARY KEY,
  daily_agenda boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- >>>>>>>>>> tables the app otherwise self-creates on first use

CREATE TABLE IF NOT EXISTS billing_client_seen (client_id text NOT NULL, clinician_id text NOT NULL, seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (client_id, clinician_id));
CREATE TABLE IF NOT EXISTS hipaa_task_state (task_id text PRIMARY KEY, status text NOT NULL DEFAULT 'todo', comments jsonb NOT NULL DEFAULT '[]', updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint text PRIMARY KEY, clinician_id text NOT NULL, p256dh text NOT NULL, auth text NOT NULL, created_at timestamptz DEFAULT now());

-- >>>>>>>>>> db/live-setup.sql  (sample insurers / CPT / config seed; idempotent)

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

-- Custom group chats: named, member-picked conversations (messages live in
-- comms_messages under thread_id 'group:<id>').
CREATE TABLE IF NOT EXISTS comms_groups (
  id          TEXT PRIMARY KEY,
  name_enc    TEXT NOT NULL,
  member_ids  JSONB NOT NULL DEFAULT '[]',
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
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
