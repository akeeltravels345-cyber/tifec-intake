-- Let a service code hold multiple time/value options (e.g. 90834 at 45 min and
-- a 15-min slot at $57.11). Stored as a JSON array of {label, minutes, fee};
-- the code's base fee/hrs mirror the first (default) variant for back-compat.
ALTER TABLE billing_cpt_codes ADD COLUMN IF NOT EXISTS variants jsonb;
