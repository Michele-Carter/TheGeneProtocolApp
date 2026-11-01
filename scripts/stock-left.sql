-- "Show how many are left": at or below its low-stock level, the shop says "Only 3 left" instead of "Low stock".
-- Additive and safe to re-run. Run it on the live database BEFORE deploying the code that uses it
-- (the app reads this column for every product, so without it the shop and Admin stop working).
-- Apply with: node scripts/applySql.mjs scripts/stock-left.sql
--   (live: powershell -ExecutionPolicy Bypass -File scripts/applyLive.ps1 scripts/stock-left.sql)

ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS show_stock_left boolean NOT NULL DEFAULT false;
