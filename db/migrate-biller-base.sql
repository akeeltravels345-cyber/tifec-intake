-- The biller's per-clinician % is charged on only a SHARE of that clinician's
-- insurance billed (default 100% = all of it). A lower base leaves more of their
-- billed income free of the biller's cut. Nick bills Joan on 70% of hers right now
-- (normally 75%), so the extra 5% is Joan's.
ALTER TABLE billing_clinician_settings
  ADD COLUMN IF NOT EXISTS biller_base_pct NUMERIC NOT NULL DEFAULT 100;

UPDATE billing_clinician_settings
  SET biller_base_pct = 70, updated_at = now()
  WHERE clinician_id = 'joan-latty';
