-- Per-user auto-logout window (minutes). Null / absent = default (15).
-- Safe to run more than once.
ALTER TABLE clinician_users ADD COLUMN IF NOT EXISTS idle_minutes INTEGER;
