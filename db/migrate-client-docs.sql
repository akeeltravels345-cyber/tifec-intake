-- Stored document files for client records (referral letters, etc.).
-- Bytes are held encrypted (AES-256-GCM, same as all other PHI) as base64 in
-- content_enc. The lightweight metadata (name, kind, size) lives in the client's
-- profile blob; only this table carries the actual file, loaded on download.
CREATE TABLE IF NOT EXISTS billing_client_docs (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL,
  content_enc TEXT NOT NULL,
  mime        TEXT,
  size        INTEGER,
  name        TEXT,          -- original filename (for ticket attachments); nullable
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS billing_client_docs_client ON billing_client_docs (client_id);
