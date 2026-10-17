-- Brand colour (2026-10-17): each business can replace the app's gold with its own colour (Business page);
-- empty = PepBiz gold. Additive and safe to run before the new code goes live. Re-runnable.
-- Usage: node scripts/applySql.mjs scripts/brand-colour.sql   (dev)
--        powershell -ExecutionPolicy Bypass -File scripts\applyLive.ps1 scripts\brand-colour.sql   (live)

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS brand_color text NOT NULL DEFAULT '';
