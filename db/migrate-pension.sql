-- Migration: per-clinician pension deduction. Safe, additive. Run once on live.
ALTER TABLE billing_clinician_settings ADD COLUMN IF NOT EXISTS pension NUMERIC NOT NULL DEFAULT 0;
