-- A clinician's own private monthly expenses (running + one-off). Private to the
-- clinician; never shown on the company payout statement. One row per clinician
-- per month; the app carries running items forward when a new month has no row.
CREATE TABLE IF NOT EXISTS billing_clinician_expenses (
  clinician_id text NOT NULL,
  month        text NOT NULL,               -- "YYYY-MM"
  expenses     jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (clinician_id, month)
);
