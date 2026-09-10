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
