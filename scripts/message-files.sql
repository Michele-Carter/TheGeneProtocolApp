-- Photos and PDFs in messages (2026-10-29). A message can carry one file, kept in the PRIVATE Blob store
-- (MESSAGE_FILES_READ_WRITE_TOKEN) and only ever served through the app to the shop and that customer.
-- attachment_url = where it's stored; the rest describe it. The text of a message with a file can be empty.
-- Additive and safe to re-run. Run it on the live database BEFORE deploying the code that uses it
-- (the app reads these columns for every conversation, so without them Messages stops working).
-- Apply with: node scripts/applySql.mjs scripts/message-files.sql
--   (live: powershell -ExecutionPolicy Bypass -File scripts/applyLive.ps1 scripts/message-files.sql)

ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_size integer;
