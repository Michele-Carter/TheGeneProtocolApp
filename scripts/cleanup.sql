-- Deleting ended businesses (2026-10-17): when a business's last subscription ended, so its data can be deleted
-- 30 days later as the Privacy Policy promises (api/_lib/cleanup.ts). Filled in from Stripe by syncFromStripe.
-- Additive and safe to run before the new code goes live (the live API selects every column, so run it FIRST).
-- Re-runnable.
-- Usage: node scripts/applySql.mjs scripts/cleanup.sql   (dev)
--        powershell -ExecutionPolicy Bypass -File scripts\applyLive.ps1 scripts\cleanup.sql   (live)

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS subscription_ended_at timestamptz;
