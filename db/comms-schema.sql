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
