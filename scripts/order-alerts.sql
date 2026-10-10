-- New-order alerts: the phones/computers a business owner has turned phone notifications on for.
-- Additive (safe to run on the live database before the code that uses it is deployed).
-- Apply with: node scripts/applySql.mjs scripts/order-alerts.sql
-- (The email side needs no table - its on/off and address live in app_settings, key 'order-alerts'.)

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id text PRIMARY KEY,
  business_id text NOT NULL DEFAULT current_setting('app.business_id', true) REFERENCES businesses(id),
  clerk_user_id text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_business_endpoint_idx ON push_subscriptions (business_id, endpoint);

-- Same isolation as every other business table (scripts/multi-business-2.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO peppal_app;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_isolation ON push_subscriptions;
CREATE POLICY business_isolation ON push_subscriptions
  USING (business_id = current_setting('app.business_id', true))
  WITH CHECK (business_id = current_setting('app.business_id', true));
