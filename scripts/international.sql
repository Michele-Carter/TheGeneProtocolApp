-- Businesses outside New Zealand: each business has a country (now an ISO code: NZ, AU, US, CA, GB), a currency
-- and a time zone (shared/countries.ts). Additive and safe to run before the new code goes live - the old code
-- simply ignores the new columns. Re-runnable.
-- Usage: node scripts/applySql.mjs scripts/international.sql   (dev)
--        powershell -ExecutionPolicy Bypass -File scripts\applyLive.ps1 scripts\international.sql   (live)

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NZD';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'Pacific/Auckland';
-- The owner's name, asked for when they register their business.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_name text NOT NULL DEFAULT '';

-- Businesses that signed up as "outside New Zealand" before countries existed paid in US dollars.
UPDATE businesses SET country = 'US', currency = 'USD', time_zone = 'America/New_York' WHERE country = 'INTL';
