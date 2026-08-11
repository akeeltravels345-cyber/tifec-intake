-- Units per service code, so a clinician can bill the same CPT code more than
-- once on a visit (e.g. two extended assessment hours). Each row in
-- billing_session_cpt already carries one distinct code per session; this adds a
-- unit COUNT to that row. The money is unaffected (billing_sessions.total_cost is
-- the authoritative amount) — units keep the code list and duration honest.
--
-- ADDITIVE and safe to run more than once. Existing rows default to 1 unit.

ALTER TABLE billing_session_cpt
  ADD COLUMN IF NOT EXISTS units INTEGER NOT NULL DEFAULT 1;
