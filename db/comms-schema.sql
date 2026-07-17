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
  assignee   TEXT NOT NULL,          -- clinician id
  area       TEXT NOT NULL,          -- subject area
  subject_enc TEXT NOT NULL,       -- encrypted: a subject line will name a client sooner or later
  body_enc   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open',  -- open | in_progress | resolved
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comms_tickets_assignee_idx ON comms_tickets (assignee, status);

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
