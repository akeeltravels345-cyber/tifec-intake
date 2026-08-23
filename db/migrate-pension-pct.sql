-- Migration: pension is now a % of the clinician's after-retention share (the
-- legacy `pension` flat column is no longer used). Editable per clinician by the
-- owner/admin in Setup. Safe, additive, defaults to 10. Run once on live.
ALTER TABLE billing_clinician_settings ADD COLUMN IF NOT EXISTS pension_pct NUMERIC NOT NULL DEFAULT 10;
