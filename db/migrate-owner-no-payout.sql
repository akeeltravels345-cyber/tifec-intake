-- An owner-operator draws no payout: their collections stay with the practice,
-- with no retention split or deductions applied — but their production numbers
-- still show. Default off; enabled for Dr. Shion O'Connor (the owner).
ALTER TABLE billing_clinician_settings
  ADD COLUMN IF NOT EXISTS no_payout BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO billing_clinician_settings (clinician_id, retention_pct, other_deduction_pct, other_deduction_fixed, pension, no_payout, updated_at)
VALUES ('shion-oconnor', 0, 0, 0, 0, TRUE, now())
ON CONFLICT (clinician_id) DO UPDATE SET no_payout = TRUE, updated_at = now();
