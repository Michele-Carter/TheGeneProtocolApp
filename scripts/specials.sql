-- Specials (2026-10-26): a deal on one product size or on a bundle - a percentage off (optionally from a minimum
-- quantity) or buy X get Y free - with the ribbon wording and colour the owner chooses (shared/specials.ts).
-- null = no special. Additive and safe to re-run. Run it on the live database BEFORE deploying the code that uses it
-- (the app reads these columns for every product, so without them the shop and Admin stop working).
-- Apply with: node scripts/applySql.mjs scripts/specials.sql
--   (live: powershell -ExecutionPolicy Bypass -File scripts/applyLive.ps1 scripts/specials.sql)

ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS special jsonb;
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS special jsonb;
