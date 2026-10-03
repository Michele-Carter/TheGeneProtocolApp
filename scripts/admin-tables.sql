-- Owner-only admin area: supply orders & inventory.
-- Additive only: creates the new tables if they don't exist, never touches existing ones.
-- Apply with: node scripts/applySql.mjs scripts/admin-tables.sql

CREATE TABLE IF NOT EXISTS inv_items (
  id text PRIMARY KEY,
  kind text NOT NULL,
  name text NOT NULL,
  variant text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'unit',
  catalog_code text,
  reorder_level integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id text PRIMARY KEY,
  supplier text NOT NULL,
  order_date text NOT NULL,
  status text NOT NULL DEFAULT 'ordered',
  data jsonb NOT NULL,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_lots (
  id text PRIMARY KEY,
  item_id text NOT NULL,
  order_id text,
  order_line_id text,
  received_at timestamptz NOT NULL,
  qty_received integer NOT NULL,
  qty_remaining integer NOT NULL,
  unit_cost_nzd numeric(14, 4) NOT NULL,
  lot_number text NOT NULL DEFAULT '',
  expiry_date text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_lots_item_idx ON inventory_lots (item_id, received_at);

CREATE TABLE IF NOT EXISTS stock_movements (
  id text PRIMARY KEY,
  item_id text NOT NULL,
  lot_id text,
  type text NOT NULL,
  qty integer NOT NULL,
  unit_cost_nzd numeric(14, 4) NOT NULL,
  ref_id text,
  reason text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_item_idx ON stock_movements (item_id, occurred_at);

-- Customer orders (sales). Stock is taken out (FIFO) when an order is completed.
CREATE TABLE IF NOT EXISTS sales (
  id text PRIMARY KEY,
  customer_name text NOT NULL,
  order_date text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  data jsonb NOT NULL,
  cogs_nzd numeric(14, 4),
  cost_detail jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Business expenses that aren't stock (equipment, packaging, postage, software...).
CREATE TABLE IF NOT EXISTS expenses (
  id text PRIMARY KEY,
  expense_date text NOT NULL,
  supplier text NOT NULL DEFAULT '',
  description text NOT NULL,
  category text NOT NULL,
  amount_nzd numeric(14, 2) NOT NULL,
  order_number text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Expenses can list several items plus shipping/tax/discounts: { items: [...], shippingNzd, taxNzd, discountNzd }.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS detail jsonb;

-- Expenses created automatically from "expense" lines on a supply order when it's received.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_order_id text;

-- Shop front: what each item and bundle sells for and how it appears in the customer shop.
-- images is a list of image URLs (Vercel Blob); the first one is the main image.
ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS sell_price_nzd numeric(14, 2);
ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS shop_visible boolean NOT NULL DEFAULT false;
ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS shop_categories jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS shop_description text NOT NULL DEFAULT '';
ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE bundles ADD COLUMN IF NOT EXISTS shop_visible boolean NOT NULL DEFAULT false;
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS shop_categories jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Customers. clerk_user_id links the customer to their app login (null until they sign in);
-- shipping_address is { line1, line2, suburb, city, postcode, country } (shared/customers.ts).
CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  clerk_user_id text,
  name text NOT NULL,
  email text NOT NULL DEFAULT '',
  shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_clerk_user_idx ON customers (clerk_user_id) WHERE clerk_user_id IS NOT NULL;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id text;
CREATE INDEX IF NOT EXISTS sales_customer_idx ON sales (customer_id);

-- Existing orders only had a typed name: give each distinct name a customer record and link its orders.
-- (Duplicates such as "Owen" / "Owen G" can then be merged in the admin Customers screen.)
INSERT INTO customers (id, name)
SELECT gen_random_uuid()::text, n.name
FROM (SELECT DISTINCT ON (lower(trim(customer_name))) trim(customer_name) AS name
      FROM sales WHERE customer_id IS NULL AND trim(customer_name) <> '') n
WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE lower(c.name) = lower(n.name));

UPDATE sales s SET customer_id = c.id
FROM customers c
WHERE s.customer_id IS NULL AND lower(c.name) = lower(trim(s.customer_name));

-- Orders customers send from the shop. They wait as "submitted" until the owner confirms them
-- (which turns them into a normal customer order in `sales`) or declines them. Stock only moves via the sale.
-- lines: ShopOrderLine[] with prices fixed at the time of ordering (shared/shop.ts).
CREATE SEQUENCE IF NOT EXISTS shop_order_number_seq START 1001;
CREATE TABLE IF NOT EXISTS shop_orders (
  id text PRIMARY KEY,
  order_number integer NOT NULL DEFAULT nextval('shop_order_number_seq'),
  customer_id text NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  lines jsonb NOT NULL,
  subtotal_nzd numeric(14, 2) NOT NULL,
  shipping_nzd numeric(14, 2),
  notes text NOT NULL DEFAULT '',
  shipping_address jsonb NOT NULL,
  admin_message text NOT NULL DEFAULT '',
  sale_id text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_orders_customer_idx ON shop_orders (customer_id, created_at);
CREATE INDEX IF NOT EXISTS shop_orders_status_idx ON shop_orders (status);

-- Products can be in several categories: carry over the single shop_category briefly used before, then drop it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inv_items' AND column_name = 'shop_category') THEN
    UPDATE inv_items SET shop_categories = jsonb_build_array(shop_category) WHERE shop_category <> '' AND shop_categories = '[]'::jsonb;
    ALTER TABLE inv_items DROP COLUMN shop_category;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bundles' AND column_name = 'shop_category') THEN
    UPDATE bundles SET shop_categories = jsonb_build_array(shop_category) WHERE shop_category <> '' AND shop_categories = '[]'::jsonb;
    ALTER TABLE bundles DROP COLUMN shop_category;
  END IF;
END $$;
