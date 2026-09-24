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
