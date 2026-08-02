-- Notice acknowledgements + "ask for acknowledgement" state, kept in a separate
-- table so the notices table is untouched. Reads degrade to "no acks" if this
-- hasn't been run yet (the app never 500s on a missing table).
CREATE TABLE IF NOT EXISTS comms_notice_meta (
  notice_id text PRIMARY KEY,
  ask_ack   boolean NOT NULL DEFAULT false,
  acks      jsonb   NOT NULL DEFAULT '[]'::jsonb
);
