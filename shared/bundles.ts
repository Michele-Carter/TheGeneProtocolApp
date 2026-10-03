// Reusable "kit" definitions (e.g. a pen starter bundle = 1 pen + 4 cartridges + 4 needle tips).
// A bundle holds no stock of its own — adding one to a sale expands it into one SaleLine per
// component, pulled from that item's own FIFO batches like any other sale.

export interface BundleComponent {
  itemId: string;
  qty: number; // per one bundle
}

export interface BundleInput {
  name: string;
  description: string;
  components: BundleComponent[];
  // What the whole bundle sells for. Null = no package price — components go on the
  // order at their normal individual prices with no automatic discount.
  priceNzd: number | null;
  // Customer shop. Images are uploaded separately (they need the bundle saved first).
  shopVisible: boolean;
  shopCategories: string[];
}

export function emptyBundle(): BundleInput {
  return { name: "", description: "", components: [], priceNzd: null, shopVisible: false, shopCategories: [] };
}
