-- Messages between a shop and its customers (2026-10-18). One conversation per customer: each message is from
-- the customer or the owner, optionally about one of the customer's shop orders. read_at = when the other side
-- read it. customers.messages_archived_at = the owner archived the conversation (a new message brings it back).
-- Additive and safe to run before the new code goes live. Re-runnable.
-- Usage: node scripts/applySql.mjs scripts/messages.sql   (dev)
--        powershell -ExecutionPolicy Bypass -File scripts\applyLive.ps1 scripts\messages.sql   (live)

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  business_id text NOT NULL DEFAULT current_setting('app.business_id', true) REFERENCES businesses(id),
  customer_id text NOT NULL,
  sender text NOT NULL, -- 'customer' | 'owner'
  body text NOT NULL,
  shop_order_id text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (business_id, customer_id, created_at);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS messages_archived_at timestamptz;

-- Same isolation as every other business table (scripts/multi-business-2.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO peppal_app;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_isolation ON messages;
CREATE POLICY business_isolation ON messages
  USING (business_id = current_setting('app.business_id', true))
  WITH CHECK (business_id = current_setting('app.business_id', true));
