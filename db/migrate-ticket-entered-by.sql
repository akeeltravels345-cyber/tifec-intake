-- "On behalf of" tickets: when someone calls or messages about an issue and a
-- colleague (usually the admin) logs the ticket for them, the ticket is recorded
-- as RAISED BY the person it's from (so updates and the resolution reach them),
-- and entered_by records who actually typed it in. Nullable; null = the raiser
-- logged it themselves, as before.
--
-- ADDITIVE and safe to run more than once.

ALTER TABLE comms_tickets
  ADD COLUMN IF NOT EXISTS entered_by TEXT;
