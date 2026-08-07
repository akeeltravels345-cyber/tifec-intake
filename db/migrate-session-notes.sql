-- Clinical session notes (SOAP). The note body is encrypted at rest (PHI); only
-- clinicians linked to the client ever see the content. Optionally tied to a
-- logged visit (session_id).
CREATE TABLE IF NOT EXISTS session_notes (
  id           text PRIMARY KEY,
  client_id    text NOT NULL,
  clinician_id text NOT NULL,       -- author
  session_id   text,                -- optional link to a billing session (visit)
  note_date    text NOT NULL,       -- YYYY-MM-DD
  body_enc     text NOT NULL,       -- encrypted JSON { s, o, a, p }
  created_at   text NOT NULL,
  updated_at   text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_notes_client ON session_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_session_notes_clin   ON session_notes(clinician_id);
