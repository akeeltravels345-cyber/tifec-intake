-- Migration: archiving for worklists. A finished heading can be archived (tucked
-- into an "Archived" section) without deleting it; individual finished tasks are
-- archived inside the subs JSON, so only the heading-level flag needs a column.
-- ADDITIVE and safe to run more than once.
ALTER TABLE builder_tasks ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
