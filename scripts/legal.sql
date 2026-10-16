-- Privacy and Terms (2026-10-16): the email each shop's customers can contact it on, shown on the shop's
-- privacy notice (/shop/<link>/privacy). Empty = the owner's sign-in email is shown instead.
-- Additive and safe to run before the new code goes live. Re-runnable.
-- Usage: node scripts/applySql.mjs scripts/legal.sql   (dev)
--        powershell -ExecutionPolicy Bypass -File scripts\applyLive.ps1 scripts\legal.sql   (live)

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS contact_email text NOT NULL DEFAULT '';
