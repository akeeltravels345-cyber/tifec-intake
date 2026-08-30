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
