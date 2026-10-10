import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { ShopOrderLine } from "../../shared/shop.js";

// ---- Businesses (scripts/multi-business.sql) ----

// A business using the app. Everything it owns carries its id in business_id; nothing is shared between businesses.
export const businesses = pgTable("businesses", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(), // shop link: /shop/<slug>
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  status: text("status").notNull().default("active"), // "active" | "suspended" (by the platform owner)
  country: text("country").notNull().default("NZ"), // "NZ" pays in NZD, "INTL" (anywhere else) in USD
  ownerEmail: text("owner_email").notNull().default(""),
  // Subscription (scripts/multi-business-4.sql), kept in step with Stripe by api/_lib/billing.ts.
  billingExempt: boolean("billing_exempt").notNull().default(false),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"), // Stripe's: trialing, active, past_due, canceled...
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// People who run a business. Customers live in customers, not here.
export const businessMembers = pgTable(
  "business_members",
  {
    businessId: text("business_id").notNull().references(() => businesses.id),
    clerkUserId: text("clerk_user_id").notNull(),
    role: text("role").notNull().default("owner"), // "owner"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.clerkUserId] }), index("business_members_user_idx").on(t.clerkUserId)]
);

// The business a row belongs to. Set by the database from the request's business (api/_lib/business.ts),
// which also stops a request seeing or changing any other business's rows (scripts/multi-business-2.sql).
const businessId = () =>
  text("business_id")
    .notNull()
    .default(sql`current_setting('app.business_id', true)`)
    .references(() => businesses.id);

export const userStateScopeEnum = pgEnum("user_state_scope", [
  "protocol",
  "tracking",
  "reconstitution",
]);

export const userStateDocuments = pgTable("user_state_documents", {
  id: text("id").notNull(),
  businessId: businessId(),
  clerkUserId: text("clerk_user_id").notNull(),
  scope: userStateScopeEnum("scope").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.businessId, t.id] })]);

export const protocols = pgTable("protocols", {
  id: text("id").primaryKey(),
  businessId: businessId(),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- Admin: supply orders & inventory (owner-only, see api/admin/[resource].ts) ----

// Anything that can be stocked: catalogue peptides (id "cat:<code>") and supplies.
export const invItems = pgTable("inv_items", {
  id: text("id").notNull(),
  businessId: businessId(),
  kind: text("kind").notNull(), // "peptide" | "supply"
  name: text("name").notNull(),
  variant: text("variant").notNull().default(""),
  unit: text("unit").notNull().default("unit"),
  catalogCode: text("catalog_code"),
  reorderLevel: integer("reorder_level"),
  // Shop front. images: string[] of image URLs, the first is the main image.
  sellPriceNzd: numeric("sell_price_nzd", { precision: 14, scale: 2, mode: "number" }),
  shopVisible: boolean("shop_visible").notNull().default(false),
  shopCategories: jsonb("shop_categories").$type<string[]>().notNull().default([]),
  shopDescription: text("shop_description").notNull().default(""),
  shopSection: text("shop_section"), // "peptides" | "supplies"; null = by kind (shared/shop.ts itemSection)
  images: jsonb("images").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.businessId, t.id] })]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: text("id").primaryKey(),
  businessId: businessId(),
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
    businessId: businessId(),
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
    businessId: businessId(),
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

// A customer. clerkUserId links them to their app login (null until they first sign in);
// shippingAddress is a ShippingAddress (shared/customers.ts).
export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  businessId: businessId(),
  clerkUserId: text("clerk_user_id"),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  shippingAddress: jsonb("shipping_address").notNull().default({}),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Customer orders. Stock is taken out oldest-first when an order is completed;
// costDetail records the cost of each line at that moment ({ [lineId]: costNzd }).
// customerName is kept in step with the linked customer's name.
export const sales = pgTable("sales", {
  id: text("id").primaryKey(),
  businessId: businessId(),
  customerId: text("customer_id"),
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

// An order a customer sent from the shop: "submitted" until the owner confirms it (creating the sale in
// saleId) or declines it. Prices are fixed when it's sent; shippingNzd is set by the owner when confirming.
export const shopOrders = pgTable(
  "shop_orders",
  {
    id: text("id").primaryKey(),
    businessId: businessId(),
    orderNumber: integer("order_number").notNull(),
    customerId: text("customer_id").notNull(),
    status: text("status").notNull().default("submitted"), // ShopOrderStatus (shared/shop.ts)
    lines: jsonb("lines").$type<ShopOrderLine[]>().notNull(),
    subtotalNzd: numeric("subtotal_nzd", { precision: 14, scale: 2, mode: "number" }).notNull(),
    shippingNzd: numeric("shipping_nzd", { precision: 14, scale: 2, mode: "number" }),
    notes: text("notes").notNull().default(""),
    shippingAddress: jsonb("shipping_address").notNull(),
    adminMessage: text("admin_message").notNull().default(""),
    saleId: text("sale_id"),
    // Set when the customer says they've paid; the owner then checks and marks the order paid.
    paymentReportedAt: timestamp("payment_reported_at", { withTimezone: true }),
    paymentReference: text("payment_reference").notNull().default(""),
    cancelledBy: text("cancelled_by"), // "customer" | "owner" when status is "cancelled"
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("shop_orders_customer_idx").on(t.customerId, t.createdAt),
    uniqueIndex("shop_orders_business_number_idx").on(t.businessId, t.orderNumber),
  ]
);

// Owner settings by key, e.g. "payment_instructions" -> string.
export const appSettings = pgTable("app_settings", {
  key: text("key").notNull(),
  businessId: businessId(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.businessId, t.key] })]);

// A message for a customer about one of their shop orders, shown under the bell in the app.
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    businessId: businessId(),
    customerId: text("customer_id").notNull(),
    shopOrderId: text("shop_order_id"),
    kind: text("kind").notNull(), // NotificationKind (shared/shop.ts)
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notifications_customer_idx").on(t.customerId, t.createdAt)]
);

// A phone or computer the business owner turned new-order notifications on for (scripts/order-alerts.sql).
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    businessId: businessId(),
    clerkUserId: text("clerk_user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    device: text("device").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("push_subscriptions_business_endpoint_idx").on(t.businessId, t.endpoint)]
);

// A reusable kit of inventory items sold together (e.g. "Pen Starter Bundle"). Holds no stock
// of its own — selling one expands it into a SaleLine per component (shared/bundles.ts).
export const bundles = pgTable("bundles", {
  id: text("id").primaryKey(),
  businessId: businessId(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  components: jsonb("components").notNull(), // BundleComponent[] (shared/bundles.ts)
  priceNzd: numeric("price_nzd", { precision: 14, scale: 2, mode: "number" }),
  shopVisible: boolean("shop_visible").notNull().default(false),
  shopCategories: jsonb("shop_categories").$type<string[]>().notNull().default([]),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Business costs that aren't stock (equipment, packaging, postage, software...).
export const expenses = pgTable("expenses", {
  id: text("id").primaryKey(),
  businessId: businessId(),
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

// ---- Peptide library & supplier price list (scripts/multi-business-3.sql) ----

// Everything the Peptide Database, Protocol Builder and My Stack show, one row per record (shared/library.ts).
export const peptideLibrary = pgTable(
  "peptide_library",
  {
    businessId: businessId(),
    kind: text("kind").notNull(), // LibraryKind (shared/library.ts)
    key: text("key").notNull(),
    sort: integer("sort").notNull().default(0),
    data: jsonb("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.kind, t.key] })]
);

// The supplier's products a business picks from on supplier orders. options: SupplierOption[] (shared/library.ts).
export const supplierCatalog = pgTable(
  "supplier_catalog",
  {
    businessId: businessId(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    note: text("note").notNull().default(""),
    options: jsonb("options").notNull().default([]),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.id] })]
);
