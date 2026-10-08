-- Multi-business, stage 1: every business-owned row records which business it belongs to.
-- Additive only, safe to run while the current (single-business) app is live: business_id defaults to
-- 'tgp' (The Gene Protocol, business #1), so rows the live app writes without one still land in TGP.
-- The default is dropped at the switch-over, once every write sets business_id itself.
-- Apply with: node scripts/applySql.mjs scripts/multi-business.sql
-- Then add the owners: node scripts/seedBusinessOwners.mjs

CREATE TABLE IF NOT EXISTS businesses (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE, -- shop link: /shop/<slug>
  name text NOT NULL,
  logo_url text,
  status text NOT NULL DEFAULT 'active', -- "active" | "paused" (subscription stopped)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO businesses (id, slug, name)
VALUES ('tgp', 'the-gene-protocol', 'The Gene Protocol')
ON CONFLICT (id) DO NOTHING;

-- People who run a business (customers are in customers, not here).
CREATE TABLE IF NOT EXISTS business_members (
  business_id text NOT NULL REFERENCES businesses (id),
  clerk_user_id text NOT NULL,
  role text NOT NULL DEFAULT 'owner', -- "owner"
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, clerk_user_id)
);
CREATE INDEX IF NOT EXISTS business_members_user_idx ON business_members (clerk_user_id);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_state_documents', 'protocols',
    'inv_items', 'purchase_orders', 'inventory_lots', 'stock_movements',
    'customers', 'sales', 'shop_orders', 'notifications',
    'bundles', 'expenses', 'app_settings'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS business_id text NOT NULL DEFAULT %L REFERENCES businesses (id)',
      t, 'tgp');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (business_id)', t || '_business_idx', t);
  END LOOP;
END $$;
