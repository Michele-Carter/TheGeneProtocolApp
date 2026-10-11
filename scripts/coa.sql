-- Certificates of analysis: each product size can have a COA - an uploaded image/PDF, or a link to the lab's page.
-- Additive and safe to re-run. Run it on the live database BEFORE deploying the code that uses it
-- (the app reads this column for every product, so without it the shop and Admin stop working).
-- Apply with: node scripts/applySql.mjs scripts/coa.sql
--   (live: powershell -ExecutionPolicy Bypass -File scripts/applyLive.ps1 scripts/coa.sql)

ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS coa_url text;
