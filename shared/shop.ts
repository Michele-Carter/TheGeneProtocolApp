// Customer shop front: categories offered when setting up a product (admin can also add their own).
// Matches the Peptide Database's category tags so the two read the same.
export const DEFAULT_SHOP_CATEGORIES = [
  "Anabolic",
  "Cardiovascular",
  "Cognitive",
  "Growth Hormone",
  "Healing",
  "Hormonal",
  "Immune",
  "Longevity",
  "Metabolic",
  "Performance",
  "Sexual Health",
  "Skin",
  "Sleep",
  "Weight Loss",
  "Supplies",
];

// "weight-loss" (Peptide Database tag) -> "Weight Loss"
export function categoryLabel(tag: string): string {
  return tag
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Cleans a category list: trimmed, no blanks, no duplicates (ignoring case).
export function normalizeCategories(categories: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of categories) {
    const category = raw.trim();
    if (!category || seen.has(category.toLowerCase())) continue;
    seen.add(category.toLowerCase());
    result.push(category);
  }
  return result;
}

// ---- What customers see in the shop ----

// The shop's tabs. Bundles always go under Bundles; items under Peptides or Supplies.
export type ShopSection = "peptides" | "bundles" | "supplies";
export type ItemShopSection = Exclude<ShopSection, "bundles">;

export const SHOP_SECTIONS: { id: ShopSection; label: string }[] = [
  { id: "peptides", label: "Peptides" },
  { id: "bundles", label: "Bundles" },
  { id: "supplies", label: "Supplies" },
];

// Where an item shows: as set in admin, otherwise by whether it's stocked as a peptide or a supply.
export function itemSection(item: { kind: string; shopSection: string | null }): ItemShopSection {
  if (item.shopSection === "peptides" || item.shopSection === "supplies") return item.shopSection;
  return item.kind === "supply" ? "supplies" : "peptides";
}

// Customers see a label, not the exact count.
export type StockLevel = "in" | "low" | "out";

// One buyable option: a size of a peptide (an inventory item) or a bundle.
export interface ShopVariant {
  key: string; // "item:<itemId>" or "bundle:<bundleId>" - what goes in the cart
  label: string; // size, e.g. "10mg" ("" for a bundle or single-size item)
  priceNzd: number;
  stock: StockLevel;
  maxQty: number; // most that can be ordered right now
  images: string[];
}

export interface ShopProduct {
  id: string;
  kind: "product" | "bundle";
  section: ShopSection;
  name: string;
  categories: string[];
  description: string;
  images: string[]; // shown when the chosen size has none of its own
  contents?: { name: string; qty: number }[]; // bundles: what's in the kit
  variants: ShopVariant[]; // sorted smallest size first
}

export interface CartLine {
  key: string; // ShopVariant.key
  qty: number;
}

// Above this many available, the shop just says "In stock"; at or below it, "Low stock".
export const LOW_STOCK_DEFAULT = 3;

export function stockLevel(available: number, reorderLevel: number | null): StockLevel {
  if (available <= 0) return "out";
  return available <= (reorderLevel ?? LOW_STOCK_DEFAULT) ? "low" : "in";
}

// "5mg" < "10mg" < "1000mg"; sizes without a number go last, alphabetically.
export function compareSizes(a: string, b: string): number {
  const na = parseFloat(a.replace(/,/g, ""));
  const nb = parseFloat(b.replace(/,/g, ""));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1;
  return a.localeCompare(b);
}

// ---- Orders sent from the shop ----

export type ShopOrderStatus = "submitted" | "confirmed" | "declined" | "cancelled";

export interface ShopOrderLine {
  key: string; // ShopVariant.key it was ordered as
  kind: "item" | "bundle";
  refId: string; // inventory item id or bundle id
  name: string;
  variant: string;
  qty: number;
  unitPriceNzd: number; // fixed when the order was sent
  components?: { itemId: string; qty: number }[]; // bundles: per one bundle, as it was when ordered
}

export interface ShopOrder {
  id: string;
  orderNumber: number;
  status: ShopOrderStatus;
  lines: ShopOrderLine[];
  subtotalNzd: number;
  shippingNzd: number | null;
  notes: string;
  adminMessage: string;
  createdAt: string;
  decidedAt: string | null;
  paymentReportedAt: string | null; // when the customer said they'd paid
  paymentReference: string;
  cancelledBy: "customer" | "owner" | null;
  paymentDetails: PaymentDetails | null; // how to pay - only while confirmed and not yet paid
  // Once confirmed: how the order is going, from the customer order it became.
  progress: {
    totalNzd: number; // items + shipping, less any discount
    paymentStatus: "unpaid" | "part-paid" | "paid";
    balanceNzd: number;
    shippingStatus: "not-sent" | "sent" | "delivered" | "collected";
    courier: string;
    tracking: string;
    sentDate: string | null;
    completed: boolean;
  } | null;
}

export type NotificationKind = "confirmed" | "declined" | "sent" | "paid" | "cancelled";

// ---- How customers pay ----

// The owner's bank details. Only ever sent to a customer as part of one of their confirmed, unpaid orders.
export interface PaymentDetails {
  bankName: string;
  accountName: string;
  accountNumber: string; // NZ format, e.g. 12-3456-7890123-00
  instructions: string; // anything extra, optional
}

export const PAYMENT_DETAILS_KEY = "payment_details";

export function toPaymentDetails(value: unknown): PaymentDetails {
  const v = (value ?? {}) as Partial<Record<keyof PaymentDetails, unknown>>;
  const text = (x: unknown) => (typeof x === "string" ? x : "");
  return {
    bankName: text(v.bankName),
    accountName: text(v.accountName),
    accountNumber: text(v.accountNumber),
    instructions: text(v.instructions),
  };
}

// Enough for a customer to pay.
export function hasPaymentDetails(d: PaymentDetails): boolean {
  return Boolean(d.accountName.trim() && d.accountNumber.trim());
}

// NZ bank account numbers are bank (2) - branch (4) - account (7) - suffix (2 or 3) digits.
// Returns the number with dashes, or null if it isn't one.
export function formatNzAccountNumber(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 15 && digits.length !== 16) return null;
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 13)}-${digits.slice(13)}`;
}

export interface CustomerNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  shopOrderId: string | null;
  read: boolean;
  createdAt: string;
}

// Product images are resized in the browser before upload, so this is a generous ceiling.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 8;

// ---- New-order notifications for the business owner (Admin -> Business) ----

export interface OrderAlertDevice {
  id: string;
  endpoint: string;
  device: string;
  createdAt: string;
}

export interface OrderAlertsInfo {
  pushKey: string | null; // null until phone notifications are set up on the server
  devices: OrderAlertDevice[];
}
