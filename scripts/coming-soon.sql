-- "Coming soon": a product shown in the shop that can't be ordered until its first stock arrives.
-- Additive and safe to re-run. Run it on the live database BEFORE deploying the code that uses it
-- (the app reads this column for every product, so without it the shop and Admin stop working).
-- Apply with: node scripts/applySql.mjs scripts/coming-soon.sql
--   (live: powershell -ExecutionPolicy Bypass -File scripts/applyLive.ps1 scripts/coming-soon.sql)

ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS coming_soon boolean NOT NULL DEFAULT false;
