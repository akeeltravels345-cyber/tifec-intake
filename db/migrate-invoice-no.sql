-- Sequential invoice number stamped on sessions billed to an invoice-style payer
-- (bill_style = 'invoice', e.g. Ponciana Rehabilitation). One number is shared by
-- all sessions on the same invoice; the series starts at 5003. NULL for every
-- normal (CMS-1500) claim. ADDITIVE and re-runnable.

ALTER TABLE billing_sessions
  ADD COLUMN IF NOT EXISTS invoice_no INTEGER;
