-- Migration: track the co-pay that SHOULD have been collected, so uncollected
-- co-pays (write-offs) can be surfaced. Safe, additive. Run once on live.
ALTER TABLE billing_sessions ADD COLUMN IF NOT EXISTS copay_due NUMERIC;
