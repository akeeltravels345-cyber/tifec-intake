-- The biller's per-clinician % is charged on what the clinician RECEIVES AFTER
-- the company retention (their after-retention share), not the gross insurance
-- billed. That's the default (stored as 0 = "auto"). A non-zero value is an
-- explicit override for a special deal — Nick bills Joan on 70% of hers right now.
ALTER TABLE billing_clinician_settings
  ADD COLUMN IF NOT EXISTS biller_base_pct NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE billing_clinician_settings
  ALTER COLUMN biller_base_pct SET DEFAULT 0;

-- If an earlier version defaulted this to 100 (charge on the full billed amount),
-- reset those to 0 so they use the correct after-retention base.
UPDATE billing_clinician_settings SET biller_base_pct = 0 WHERE biller_base_pct = 100;

-- Joan's special arrangement with Nick.
UPDATE billing_clinician_settings
  SET biller_base_pct = 70, updated_at = now()
  WHERE clinician_id = 'joan-latty';
