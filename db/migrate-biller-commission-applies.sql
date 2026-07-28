-- The practice-wide biller commission (3% of company retention) is only agreed
-- for select clinicians. This flag opts a clinician in; default off for everyone,
-- pre-enabled for Sofia Hamilton and Joan Latty (the two it currently applies to).
ALTER TABLE billing_clinician_settings
  ADD COLUMN IF NOT EXISTS biller_commission_applies BOOLEAN NOT NULL DEFAULT FALSE;

-- Pre-enable the two clinicians it applies to today. If they don't have a
-- settings row yet, create one with the practice defaults.
INSERT INTO billing_clinician_settings (clinician_id, retention_pct, other_deduction_pct, other_deduction_fixed, pension, biller_commission_applies, updated_at)
VALUES
  ('sofia-hamilton', 40, 0, 0, 0, TRUE, now()),
  ('joan-latty',     40, 0, 0, 0, TRUE, now())
ON CONFLICT (clinician_id) DO UPDATE SET biller_commission_applies = TRUE, updated_at = now();
