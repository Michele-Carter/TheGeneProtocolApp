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
