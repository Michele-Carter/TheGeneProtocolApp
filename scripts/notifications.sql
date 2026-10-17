-- Notifications for every step of a shop order (2026-10-17). One browser can now be both the owner's device and
-- a customer's (an owner trying their own shop): a device row per person instead of one per browser.
-- Step 1, safe BEFORE the new code goes live: adds the new unique index (the old code doesn't use it).
-- Step 2, right AFTER the new code is live: scripts/notifications-2.sql drops the old one-per-browser index.
-- Re-runnable.
-- Usage: node scripts/applySql.mjs scripts/notifications.sql   (dev)
--        powershell -ExecutionPolicy Bypass -File scripts\applyLive.ps1 scripts\notifications.sql   (live)

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_business_endpoint_who_idx
  ON push_subscriptions (business_id, endpoint, customer_id) NULLS NOT DISTINCT;
