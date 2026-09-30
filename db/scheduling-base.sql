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
