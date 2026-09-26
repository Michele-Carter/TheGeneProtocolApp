import { index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userStateScopeEnum = pgEnum("user_state_scope", [
  "protocol",
  "tracking",
  "reconstitution",
]);

export const userStateDocuments = pgTable("user_state_documents", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  scope: userStateScopeEnum("scope").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const protocols = pgTable("protocols", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- Admin: supply orders & inventory (owner-only, see api/_lib/admin.ts) ----

// Anything that can be stocked: catalogue peptides (id "cat:<code>") and supplies.
export const invItems = pgTable("inv_items", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // "peptide" | "supply"
  name: text("name").notNull(),
  variant: text("variant").notNull().default(""),
  unit: text("unit").notNull().default("unit"),
  catalogCode: text("catalog_code"),
  reorderLevel: integer("reorder_level"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: text("id").primaryKey(),
  supplier: text("supplier").notNull(),
  orderDate: text("order_date").notNull(), // yyyy-mm-dd
  status: text("status").notNull().default("ordered"), // "ordered" | "received"
  data: jsonb("data").notNull(), // OrderInput (shared/landedCost.ts)
  receivedAt: timestamp("received_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// A batch of one item at one landed cost. Stock is used oldest-first (FIFO).
export const inventoryLots = pgTable(
  "inventory_lots",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull(),
    orderId: text("order_id"),
    orderLineId: text("order_line_id"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    qtyReceived: integer("qty_received").notNull(),
    qtyRemaining: integer("qty_remaining").notNull(),
    unitCostNzd: numeric("unit_cost_nzd", { precision: 14, scale: 4, mode: "number" }).notNull(),
    lotNumber: text("lot_number").notNull().default(""),
    expiryDate: text("expiry_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("inventory_lots_item_idx").on(t.itemId, t.receivedAt)]
);

// Every change to stock, so on-hand figures can always be traced.
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull(),
    lotId: text("lot_id"),
    type: text("type").notNull(), // "receive" | "sale" | "adjust"
    qty: integer("qty").notNull(), // + in, - out
    unitCostNzd: numeric("unit_cost_nzd", { precision: 14, scale: 4, mode: "number" }).notNull(),
    refId: text("ref_id"), // order / sale id
    reason: text("reason").notNull().default(""),
    note: text("note").notNull().default(""),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("stock_movements_item_idx").on(t.itemId, t.occurredAt)]
);

// Customer orders. Stock is taken out oldest-first when an order is completed;
// costDetail records the cost of each line at that moment ({ [lineId]: costNzd }).
export const sales = pgTable("sales", {
  id: text("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  orderDate: text("order_date").notNull(), // yyyy-mm-dd
  status: text("status").notNull().default("open"), // "open" | "completed"
  data: jsonb("data").notNull(), // SaleInput (shared/sales.ts)
  cogsNzd: numeric("cogs_nzd", { precision: 14, scale: 4, mode: "number" }),
  costDetail: jsonb("cost_detail"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Business costs that aren't stock (equipment, packaging, postage, software...).
export const expenses = pgTable("expenses", {
  id: text("id").primaryKey(),
  expenseDate: text("expense_date").notNull(), // yyyy-mm-dd
  supplier: text("supplier").notNull().default(""),
  description: text("description").notNull(),
  category: text("category").notNull(),
  amountNzd: numeric("amount_nzd", { precision: 14, scale: 2, mode: "number" }).notNull(),
  orderNumber: text("order_number").notNull().default(""),
  notes: text("notes").notNull().default(""),
  // ExpenseDetail (shared/expenses.ts). description and amount_nzd are derived from it on save.
  detail: jsonb("detail"),
  // Set when the expense was created from "expense" lines on a received supply order (edit it via the order).
  sourceOrderId: text("source_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserStateDocumentRow = typeof userStateDocuments.$inferSelect;
export type ProtocolRow = typeof protocols.$inferSelect;
export type InvItemRow = typeof invItems.$inferSelect;
export type PurchaseOrderRow = typeof purchaseOrders.$inferSelect;
export type InventoryLotRow = typeof inventoryLots.$inferSelect;
export type StockMovementRow = typeof stockMovements.$inferSelect;
