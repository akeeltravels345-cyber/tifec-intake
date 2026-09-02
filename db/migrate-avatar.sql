-- Per-user profile photo (small square JPEG data URL). Null = no photo.
-- Safe to run more than once.
ALTER TABLE clinician_users ADD COLUMN IF NOT EXISTS avatar TEXT;
