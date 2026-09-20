-- How a payer is billed. NULL/'claim' = the standard CMS-1500 claim form.
-- 'invoice' = a self-pay-style invoice billed to the payer, with its own
-- sequential invoice number (e.g. Ponciana Rehabilitation / PRC). The claim
-- workflow is otherwise unchanged. ADDITIVE and re-runnable.

ALTER TABLE billing_insurers
  ADD COLUMN IF NOT EXISTS bill_style TEXT;
