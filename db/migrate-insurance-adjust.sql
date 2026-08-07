-- Let the biller settle an insurance claim with a contractual write-off or a
-- write-down. `insurance_disposition` names the bucket ('writeoff' | 'writedown');
-- `insurance_collected` is the cash actually collected on that claim (0 for a
-- full write-off, the allowed amount for a partial). The rest of the billed
-- amount is the adjustment and lands in its own bucket — never with waived co-pays.
ALTER TABLE billing_sessions ADD COLUMN IF NOT EXISTS insurance_disposition text;
ALTER TABLE billing_sessions ADD COLUMN IF NOT EXISTS insurance_collected numeric;
