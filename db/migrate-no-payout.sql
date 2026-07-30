-- The clinician-settings code writes an optional "no payout" flag, so the column
-- must exist. It stays OFF by default. The owner (Dr. Shion) is calculated as a
-- normal clinician with 40% retention, so the biller commission and the whole
-- company/net math compute correctly on his collections.
ALTER TABLE billing_clinician_settings
  ADD COLUMN IF NOT EXISTS no_payout BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE billing_clinician_settings
  SET no_payout = FALSE, retention_pct = 40, updated_at = now()
  WHERE clinician_id = 'shion-oconnor';
