-- Multi-business, stage 2: the database itself keeps every business's data apart.
-- NOT safe while the single-business app is live - apply to the live database only at the switch-over,
-- together with deploying the multi-business code. Run scripts/multi-business.sql first.
-- Apply with: node scripts/applySql.mjs scripts/multi-business-2.sql
--
-- How it works: every API request runs in a transaction that sets app.business_id and switches to the
-- restricted peppal_app role (api/_lib/business.ts). Row-level security then only lets that request see,
-- change or add rows whose business_id matches, and new rows get that business_id automatically.
-- The database login itself (neondb_owner) bypasses this, so scripts run as the owner still see everything.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'peppal_app') THEN
    CREATE ROLE peppal_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT peppal_app TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;

GRANT USAGE ON SCHEMA public TO peppal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO peppal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO peppal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO peppal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO peppal_app;

-- Business-owned tables: only the current business's rows, and new rows belong to it.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_state_documents', 'protocols',
    'inv_items', 'purchase_orders', 'inventory_lots', 'stock_movements',
    'customers', 'sales', 'shop_orders', 'notifications',
    'bundles', 'expenses', 'app_settings', 'business_members'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN business_id SET DEFAULT current_setting(%L, true)', t, 'app.business_id');
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS business_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY business_isolation ON %I USING (business_id = current_setting(%L, true)) WITH CHECK (business_id = current_setting(%L, true))',
      t, 'app.business_id', 'app.business_id');
  END LOOP;
END $$;

-- A business can only read its own entry (the app never changes businesses as peppal_app).
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_isolation ON businesses;
CREATE POLICY business_isolation ON businesses FOR SELECT USING (id = current_setting('app.business_id', true));

-- Things that were unique across the whole app are now unique per business.

-- One customer record per login per business.
DROP INDEX IF EXISTS customers_clerk_user_idx;
CREATE UNIQUE INDEX IF NOT EXISTS customers_business_clerk_user_idx
  ON customers (business_id, clerk_user_id) WHERE clerk_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_clerk_user_idx ON customers (clerk_user_id);

-- Settings (e.g. payment details) per business.
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (business_id, key);

-- A login's saved protocol / tracking / reconstitution state, per business.
ALTER TABLE user_state_documents DROP CONSTRAINT IF EXISTS user_state_documents_pkey;
ALTER TABLE user_state_documents ADD CONSTRAINT user_state_documents_pkey PRIMARY KEY (business_id, id);

-- Catalogue items have fixed ids ("cat:<code>"), so two businesses can stock the same one.
ALTER TABLE inv_items DROP CONSTRAINT IF EXISTS inv_items_pkey;
ALTER TABLE inv_items ADD CONSTRAINT inv_items_pkey PRIMARY KEY (business_id, id);

-- Each business numbers its own shop orders from #1001 (the app picks the next number).
ALTER TABLE shop_orders ALTER COLUMN order_number DROP DEFAULT;
CREATE UNIQUE INDEX IF NOT EXISTS shop_orders_business_number_idx ON shop_orders (business_id, order_number);
