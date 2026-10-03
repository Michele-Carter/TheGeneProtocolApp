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

export type NotificationKind = "confirmed" | "declined" | "sent";

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
