-- Original filename for a stored file. Client-record documents keep their name in
-- the client profile blob, but ticket attachments (images, voice notes, and now
-- PDFs / documents) have no such blob — so we store the name here to show it and
-- to serve downloads with a sensible filename. Nullable; ADDITIVE and re-runnable.

ALTER TABLE billing_client_docs
  ADD COLUMN IF NOT EXISTS name TEXT;
