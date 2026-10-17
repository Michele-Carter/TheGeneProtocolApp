-- Step 2 of scripts/notifications.sql - run right AFTER the new code is live (the old code's saving of devices
-- needs this index). Until it runs, a browser that's already the owner's device can't also be a customer's.
-- Re-runnable.
-- Usage: node scripts/applySql.mjs scripts/notifications-2.sql   (dev)
--        powershell -ExecutionPolicy Bypass -File scripts\applyLive.ps1 scripts\notifications-2.sql   (live)

DROP INDEX IF EXISTS push_subscriptions_business_endpoint_idx;
