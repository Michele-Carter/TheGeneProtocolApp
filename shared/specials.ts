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

// What a line costs once its special is taken off.
export const lineTotal = (line: { qty: number; unitPriceNzd: number; special?: Special | null }) =>
  cents(line.qty * line.unitPriceNzd - specialDiscount(line.qty, line.unitPriceNzd, line.special));

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
