// Specials on a shop product size, set by the owner on the Inventory page (inv_items.special, scripts/specials.sql):
// a percentage off (optionally only when buying at least so many), or buy some, get some free. Shown in the shop
// as a ribbon across the photo, with the owner's own wording and colour if they've chosen them.
// All money here is NZD (the business's own currency).

interface RibbonChoice {
  ribbonText: string; // "" = the deal itself, e.g. "20% off"
  ribbonColour: string; // "" = the business's brand colour, else #rrggbb
}

export type Special =
  | ({ kind: "percent"; percentOff: number; minQty: number } & RibbonChoice) // minQty 1 = any quantity
  | ({ kind: "free"; buy: number; free: number } & RibbonChoice);

export const RIBBON_MAX = 20; // characters - about what fits across the corner of a photo

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The deal in words, e.g. "Buy 2, get 1 free" or "20% off when you buy 4 or more".
export function dealText(special: Special): string {
  if (special.kind === "free") return `Buy ${special.buy}, get ${special.free} free`;
  return special.minQty > 1 ? `${special.percentOff}% off when you buy ${special.minQty} or more` : `${special.percentOff}% off`;
}

// What the ribbon says when the owner hasn't written their own - a shorter form if the long one wouldn't fit.
export function defaultRibbon(special: Special): string {
  const text =
    special.kind === "free"
      ? `Buy ${special.buy} get ${special.free} free`
      : special.minQty > 1
        ? `Buy ${special.minQty}+ save ${special.percentOff}%`
        : `${special.percentOff}% off`;
  if (text.length <= RIBBON_MAX) return text;
  return special.kind === "free" ? `${special.buy}+${special.free} free` : `${special.percentOff}% off`;
}

export const ribbonText = (special: Special) => special.ribbonText.trim() || defaultRibbon(special);

const cents = (n: number) => Math.round(n * 100) / 100;

// How much the special takes off qty units at this price. Buy X get Y free: in every X+Y, Y are free.
export function specialDiscount(qty: number, unitPriceNzd: number, special: Special | null | undefined): number {
  if (!special || qty <= 0) return 0;
  if (special.kind === "percent") {
    return qty >= special.minQty ? cents((qty * unitPriceNzd * special.percentOff) / 100) : 0;
  }
  const freeUnits = Math.floor(qty / (special.buy + special.free)) * special.free;
  return cents(freeUnits * unitPriceNzd);
}

// The price per unit straight away, for a percentage off with no minimum - the shop shows it next to the full price.
export const salePrice = (unitPriceNzd: number, special: Special | null | undefined) =>
  special?.kind === "percent" && special.minQty <= 1 ? cents(unitPriceNzd * (1 - special.percentOff / 100)) : unitPriceNzd;

// A nudge when a few more would get (more of) the deal, e.g. "Add 1 more - it's free".
export function specialNudge(qty: number, special: Special | null | undefined): string | null {
  if (!special) return null;
  if (special.kind === "percent") {
    const short = special.minQty - qty;
    return short > 0 ? `Add ${short} more to get ${special.percentOff}% off` : null;
  }
  const group = special.buy + special.free;
  const into = qty % group;
  if (into < special.buy) return null;
  const short = group - into;
  return `Add ${short} more - ${short === 1 ? "it's" : "they're"} free`;
}

// A special as saved by the API: checked and tidied, or null for none.
export function toSpecial(raw: unknown): Special | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const whole = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
  const ribbon: RibbonChoice = {
    ribbonText: typeof r.ribbonText === "string" ? r.ribbonText.trim().slice(0, RIBBON_MAX) : "",
    ribbonColour: typeof r.ribbonColour === "string" && /^#[0-9a-f]{6}$/i.test(r.ribbonColour) ? r.ribbonColour.toLowerCase() : "",
  };
  if (r.kind === "percent") {
    const percentOff = typeof r.percentOff === "number" && r.percentOff > 0 && r.percentOff < 100 ? cents(r.percentOff) : null;
    const minQty = r.minQty == null ? 1 : whole(r.minQty, 1, 99);
    return percentOff != null && minQty != null ? { kind: "percent", percentOff, minQty, ...ribbon } : null;
  }
  if (r.kind === "free") {
    const buy = whole(r.buy, 1, 99);
    const free = whole(r.free, 1, 99);
    return buy != null && free != null ? { kind: "free", buy, free, ...ribbon } : null;
  }
  return null;
}

// ---- Storewide sale (Admin -> Storewide Sale; saved in app_settings under STOREWIDE_KEY) ----
// A percentage off everything in the shop - optionally only on orders of at least a minimum spend, and until an end
// date if one's set - with a banner across the top of the shop. Where an item or bundle has its own special too, that
// line gets whichever saves the customer more: never both.

export interface StorewideSale {
  percentOff: number;
  minSpendNzd: number; // 0 = any order
  endsOn: string | null; // yyyy-mm-dd, its last day where the business is; null = until the owner ends it
  bannerText: string; // "" = the deal itself, e.g. "15% off everything"
  bannerColour: string; // "" = the business's brand colour, else #rrggbb
}

// What an order line keeps of the sale it was sent under (ShopOrderLine.storewide).
export type StorewideDeal = Pick<StorewideSale, "percentOff" | "minSpendNzd">;

export const STOREWIDE_KEY = "storewide_sale";
export const BANNER_MAX = 60;

// On today (yyyy-mm-dd where the business is): it runs to the end of its last day.
export const saleIsOn = (sale: StorewideSale | null, today: string): sale is StorewideSale =>
  sale != null && (sale.endsOn == null || sale.endsOn >= today);

// The deal in words, e.g. "15% off everything" or "15% off orders of $200.00 or more".
export const storewideText = (deal: StorewideDeal, money: (n: number) => string) =>
  deal.minSpendNzd > 0 ? `${deal.percentOff}% off orders of ${money(deal.minSpendNzd)} or more` : `${deal.percentOff}% off everything`;

export const toDeal = (sale: StorewideSale): StorewideDeal => ({ percentOff: sale.percentOff, minSpendNzd: sale.minSpendNzd });

// A sale as saved: checked and tidied, or null if it isn't a complete one.
export function toStorewideSale(raw: unknown): StorewideSale | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const percentOff = typeof r.percentOff === "number" && r.percentOff > 0 && r.percentOff < 100 ? cents(r.percentOff) : null;
  const minSpendNzd = r.minSpendNzd == null ? 0 : typeof r.minSpendNzd === "number" && r.minSpendNzd >= 0 ? cents(r.minSpendNzd) : null;
  const endsOn = r.endsOn == null || r.endsOn === "" ? null : typeof r.endsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.endsOn) ? r.endsOn : undefined;
  if (percentOff == null || minSpendNzd == null || endsOn === undefined) return null;
  return {
    percentOff,
    minSpendNzd,
    endsOn,
    bannerText: typeof r.bannerText === "string" ? r.bannerText.trim().slice(0, BANNER_MAX) : "",
    bannerColour: typeof r.bannerColour === "string" && /^#[0-9a-f]{6}$/i.test(r.bannerColour) ? r.bannerColour.toLowerCase() : "",
  };
}

// The price per unit straight away: the better of a special's straight percentage off and a sale with no minimum spend.
export function bestUnitPrice(unitPriceNzd: number, special: Special | null | undefined, sale: StorewideDeal | null | undefined) {
  const withSpecial = salePrice(unitPriceNzd, special);
  if (!sale || sale.minSpendNzd > 0) return withSpecial;
  return Math.min(withSpecial, cents(unitPriceNzd * (1 - sale.percentOff / 100)));
}

export interface PricedLine {
  qty: number;
  unitPriceNzd: number;
  special?: Special | null;
  storewide?: StorewideDeal | null; // the sale it's under (every line of an order has the same one)
}

export interface OrderPricing {
  fullNzd: number; // at full price
  specialsNzd: number; // taken off by specials
  storewideNzd: number; // taken off by the sale
  subtotalNzd: number; // what the items cost after both
  // Per line, what it saved - by its special or by the sale, whichever is more (one of the two is always 0).
  lines: { specialNzd: number; storewideNzd: number; totalNzd: number }[];
  deal: StorewideDeal | null;
  spendMoreNzd: number; // how much more gets the sale, when it has a minimum spend not yet reached (else 0)
}

// An order's (or a cart's) prices. The sale's minimum spend counts what the items cost after their specials.
export function priceOrder(lines: PricedLine[]): OrderPricing {
  const deal = lines.find((l) => l.storewide)?.storewide ?? null;
  const fullNzd = cents(lines.reduce((t, l) => t + l.qty * l.unitPriceNzd, 0));
  const specialOf = lines.map((l) => specialDiscount(l.qty, l.unitPriceNzd, l.special)); // a line's own special
  const afterSpecials = cents(fullNzd - specialOf.reduce((t, s) => t + s, 0));
  const saleOn = deal != null && afterSpecials >= deal.minSpendNzd;
  const perLine = lines.map((l, i) => {
    const sale = saleOn ? cents((l.qty * l.unitPriceNzd * deal!.percentOff) / 100) : 0;
    const [specialNzd, storewideNzd] = sale > specialOf[i] ? [0, sale] : [specialOf[i], 0];
    return { specialNzd, storewideNzd, totalNzd: cents(l.qty * l.unitPriceNzd - specialNzd - storewideNzd) };
  });
  const specialsNzd = cents(perLine.reduce((t, l) => t + l.specialNzd, 0));
  const storewideNzd = cents(perLine.reduce((t, l) => t + l.storewideNzd, 0));
  return {
    fullNzd,
    specialsNzd,
    storewideNzd,
    subtotalNzd: cents(fullNzd - specialsNzd - storewideNzd),
    lines: perLine,
    deal,
    spendMoreNzd: deal && !saleOn ? cents(deal.minSpendNzd - afterSpecials) : 0,
  };
}
