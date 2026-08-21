-- When a co-pay actually came in. A co-pay taken at the visit gets the visit
-- date; one that was "didn't collect" and later recorded by the clinician gets
-- the date it was received, so the money books to the month it arrived (like
-- self-pay). Nullable = not collected yet. ADDITIVE and re-runnable.

ALTER TABLE billing_sessions
  ADD COLUMN IF NOT EXISTS copay_paid_date TEXT;
