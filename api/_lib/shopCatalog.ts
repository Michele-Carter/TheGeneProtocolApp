import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { bundles, invItems, inventoryLots, sales, shopOrders } from "./schema.js";
import type { SaleInput } from "../../shared/sales.js";
import {
  compareSizes,
  normalizeCategories,
  stockLevel,
  type ShopOrderLine,
  type ShopProduct,
} from "../../shared/shop.js";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const MAX_PER_LINE = 99;

// What can still be promised to new orders, per inventory item: stock on hand, minus what open customer
// orders will take when they're completed, minus what's in shop orders still waiting for confirmation.
export async function availableStock(db: Db | Tx): Promise<Map<string, number>> {
  const [onHandRows, openSales, pendingOrders] = await Promise.all([
    db
      .select({ itemId: inventoryLots.itemId, qty: sql<number>`sum(${inventoryLots.qtyRemaining})::int` })
      .from(inventoryLots)
      .where(gt(inventoryLots.qtyRemaining, 0))
      .groupBy(inventoryLots.itemId),
    db.select({ data: sales.data }).from(sales).where(eq(sales.status, "open")),
    db.select({ lines: shopOrders.lines }).from(shopOrders).where(eq(shopOrders.status, "submitted")),
  ]);

  const available = new Map<string, number>();
  for (const row of onHandRows) available.set(row.itemId, row.qty);
  const take = (itemId: string, qty: number) => available.set(itemId, (available.get(itemId) ?? 0) - qty);

  for (const sale of openSales) for (const line of (sale.data as SaleInput).lines) take(line.itemId, line.qty);
  for (const order of pendingOrders) for (const [itemId, qty] of orderDemand(order.lines)) take(itemId, qty);
  return available;
}

// Units of each inventory item an order's lines need (bundles broken into their components).
export function orderDemand(lines: Pick<ShopOrderLine, "kind" | "refId" | "qty" | "components">[]): Map<string, number> {
  const demand = new Map<string, number>();
  const add = (itemId: string, qty: number) => demand.set(itemId, (demand.get(itemId) ?? 0) + qty);
  for (const line of lines) {
    if (line.kind === "item") add(line.refId, line.qty);
    else for (const c of line.components ?? []) add(c.itemId, c.qty * line.qty);
  }
  return demand;
}

// How an order line is priced and stocked, for checking a cart when it's sent.
export interface OrderableVariant {
  kind: "item" | "bundle";
  refId: string;
  name: string;
  variant: string;
  priceNzd: number;
  components?: { itemId: string; qty: number }[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Everything in the shop, grouped into products (e.g. Retatrutide with its 5mg and 10mg sizes).
// Only items and bundles marked "Show in shop" that have a price are included.
export async function loadCatalog(db: Db | Tx) {
  const [items, bundleRows, available] = await Promise.all([
    db.select().from(invItems),
    db.select().from(bundles).where(and(eq(bundles.shopVisible, true), isNotNull(bundles.priceNzd))),
    availableStock(db),
  ]);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const orderable = new Map<string, OrderableVariant>();
  const avail = (itemId: string) => Math.max(0, available.get(itemId) ?? 0);

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    if (!item.shopVisible || item.sellPriceNzd == null) continue;
    const groupKey = `${item.kind}|${item.name.toLowerCase()}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), item]);
  }

  const products: ShopProduct[] = [];
  for (const group of groups.values()) {
    const sizes = [...group].sort((a, b) => compareSizes(a.variant, b.variant));
    const first = sizes[0];
    products.push({
      id: `p-${slug(first.kind === "supply" ? `supply ${first.name}` : first.name)}`,
      kind: "product",
      name: first.name,
      categories: normalizeCategories(sizes.flatMap((s) => s.shopCategories)),
      description: sizes.find((s) => s.shopDescription.trim())?.shopDescription ?? "",
      images: sizes.find((s) => s.images.length > 0)?.images ?? [],
      variants: sizes.map((item) => {
        const key = `item:${item.id}`;
        orderable.set(key, { kind: "item", refId: item.id, name: item.name, variant: item.variant, priceNzd: item.sellPriceNzd! });
        const units = avail(item.id);
        return {
          key,
          label: item.variant,
          priceNzd: item.sellPriceNzd!,
          stock: stockLevel(units, item.reorderLevel),
          maxQty: Math.min(units, MAX_PER_LINE),
          images: item.images,
        };
      }),
    });
  }

  for (const bundle of bundleRows) {
    const components = bundle.components as { itemId: string; qty: number }[];
    // As many kits as the scarcest component allows.
    const units = components.length
      ? Math.min(...components.map((c) => Math.floor(avail(c.itemId) / Math.max(1, c.qty))))
      : 0;
    const key = `bundle:${bundle.id}`;
    orderable.set(key, { kind: "bundle", refId: bundle.id, name: bundle.name, variant: "", priceNzd: bundle.priceNzd!, components });
    products.push({
      id: `b-${bundle.id}`,
      kind: "bundle",
      name: bundle.name,
      categories: bundle.shopCategories,
      description: bundle.description,
      images: bundle.images,
      contents: components.map((c) => {
        const item = itemsById.get(c.itemId);
        return { name: item ? [item.name, item.variant].filter(Boolean).join(" ") : "Item", qty: c.qty };
      }),
      variants: [
        {
          key,
          label: "",
          priceNzd: bundle.priceNzd!,
          stock: stockLevel(units, null),
          maxQty: Math.min(units, MAX_PER_LINE),
          images: bundle.images,
        },
      ],
    });
  }

  products.sort((a, b) => a.name.localeCompare(b.name));
  return { products, orderable, available };
}
