-- Migration: per-insurer claims email, where the biller sends this payer's
-- CMS-1500 claim for processing. Safe, additive. Run once on the live Neon database.
ALTER TABLE billing_insurers ADD COLUMN IF NOT EXISTS email TEXT;
