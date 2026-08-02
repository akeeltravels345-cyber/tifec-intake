-- Self-pay disposition: how a self-pay visit was settled.
--   NULL      = paid in full at the visit (the default; existing self-pay unchanged)
--   'owing'   = a running balance the client still owes (partial or nothing paid)
--   'waived'  = the fee was written off
-- Ignored for insured sessions. The app degrades gracefully if this hasn't run
-- yet (reads/writes fall back to a version without the column), but run it so the
-- biller's owed-by-clients tracking and the Waived state work.

ALTER TABLE billing_sessions ADD COLUMN IF NOT EXISTS self_pay_status text;
