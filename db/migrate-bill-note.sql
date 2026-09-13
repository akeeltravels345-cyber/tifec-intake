-- A biller's short note on a claim in the billing queue (e.g. why it isn't
-- billed yet, like "waiting on auth"). Operational, not clinical — it shows in
-- the To-bill queue and, read-only, to the clinician on their payout page and
-- the client record, so a claim sitting for days reads as "in hand", not
-- forgotten. Capped to 40 chars in the app. ADDITIVE and re-runnable.

ALTER TABLE billing_sessions
  ADD COLUMN IF NOT EXISTS bill_note TEXT;
