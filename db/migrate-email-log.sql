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
