-- Migration: per-insurer payer code for CMS-1500 (box 10d / header, e.g. "362").
-- Safe, additive. Run once on the live Neon database.
ALTER TABLE billing_insurers ADD COLUMN IF NOT EXISTS claim_code TEXT;
