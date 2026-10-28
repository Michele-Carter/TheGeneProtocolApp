import React from "react";
import { CheckCircle2, Minus, Package, Percent, Plus, Tag } from "lucide-react";
import type { ShopOrderLine, ShopProduct, ShopVariant, StockLevel } from "../../../shared/shop";
import {
  bestUnitPrice,
  dealText,
  ribbonText,
  storewideText,
  type OrderPricing,
  type Special,
  type StorewideDeal,
  type StorewideSale,
} from "../../../shared/specials";
import { money } from "../../lib/shopApi";
import { inkOn, isHexColour } from "../../lib/brandColour";
import { formatDate } from "../../lib/locale";

export const shopButton =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
// theme-keep-bg: opts out of the dark theme's rule that repaints rounded boxes (src/index.css).
export const shopPrimary = `${shopButton} theme-keep-bg border-gold-500 bg-gold-500 text-slate-950 hover:bg-gold-400 hover:border-gold-400`;
export const shopSecondary = `${shopButton} border-slate-700 text-slate-200 hover:text-white hover:border-slate-500`;

// Compact versions for the product cards in the shop grid.
const cardButton =
  "inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] leading-4 font-black border whitespace-nowrap transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
export const cardPrimary = `${cardButton} theme-keep-bg border-gold-500 bg-gold-500 text-slate-950 hover:bg-gold-400 hover:border-gold-400`;
export const cardSecondary = `${cardButton} border-slate-700 text-slate-300`;

export function StockBadge({ stock }: { stock: StockLevel }) {
  const style =
    stock === "in"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : stock === "low"
        ? "text-amber-300 bg-amber-500/10 border-amber-500/30"
        : stock === "soon"
          ? "text-violet-300 bg-violet-500/10 border-violet-500/30"
          : "text-sky-300 bg-sky-500/10 border-sky-500/30";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${style}`}>
      {stock === "in" ? "In stock" : stock === "low" ? "Low stock" : stock === "soon" ? "Coming soon" : "Pre-order"}
    </span>
  );
}

// Under a coming-soon product.
export const SOON_NOTE = "Coming soon - you'll be able to order this once it arrives.";

// Under a pre-order: what happens next.
export const PREORDER_NOTE = "Pre-order - we'll confirm your order once it arrives.";

// The certificate of analysis button that sits on a product photo. With a url it opens the COA (image, PDF or
// the lab's page) in a new tab; with onClick it does that instead (e.g. go to the product to pick a size).
const coaPill =
  "absolute z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-600 bg-slate-950/85 text-[10px] font-black uppercase tracking-wide text-white shadow-lg hover:border-gold-500/70 transition cursor-pointer";

export function CoaButton({ url, onClick, className = "top-2 left-2" }: { url?: string; onClick?: () => void; className?: string }) {
  const content = (
    <>
      <CheckCircle2 size={12} className="text-emerald-400" /> View COA
    </>
  );
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`${coaPill} ${className}`} onClick={(e) => e.stopPropagation()}>
      {content}
    </a>
  ) : (
    <button type="button" className={`${coaPill} ${className}`} onClick={onClick}>
      {content}
    </button>
  );
}

// The different COAs among a product's sizes.
export const productCoas = (product: ShopProduct) =>
  Array.from(new Set(product.variants.map((v) => v.coaUrl).filter((u): u is string => Boolean(u))));

// A banner across a product photo's corner: "Coming soon", or a special in the owner's colour ("" = brand colour).
export interface Ribbon {
  text: string;
  colour?: string; // left out: Coming soon's violet
}

export const SOON_RIBBON: Ribbon = { text: "Coming soon" };
export const specialRibbon = (special: Special): Ribbon => ({ text: ribbonText(special), colour: special.ribbonColour });

// The ribbon for a product photo: Coming soon wins, as it can't be ordered yet; otherwise the special, if any.
export function productRibbon(stock: StockLevel, special: Special | null | undefined): Ribbon | undefined {
  if (stock === "soon") return SOON_RIBBON;
  return special ? specialRibbon(special) : undefined;
}

// Product photos have white backgrounds, so they sit on a white panel.
export function ProductImage({
  src,
  alt,
  className = "",
  ribbon,
}: {
  src: string | undefined;
  alt: string;
  className?: string;
  ribbon?: Ribbon;
}) {
  return (
    <div className={`theme-keep-bg relative bg-white rounded-xl overflow-hidden flex items-center justify-center ${className}`}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" className="w-full h-full object-contain" />
      ) : (
        <Package size={32} className="text-slate-300" aria-hidden />
      )}
      {ribbon && <RibbonBanner ribbon={ribbon} />}
    </div>
  );
}

export function RibbonBanner({ ribbon }: { ribbon: Ribbon }) {
  const custom = ribbon.colour && isHexColour(ribbon.colour) ? ribbon.colour : null;
  // bg-gold-500 is the business's brand colour, with its own readable text colour (src/index.css).
  const colours = ribbon.colour == null ? "bg-violet-600 text-white" : custom ? "" : "bg-gold-500";
  // The strip is a fixed width and only about 130px of it shows across the corner: longer wording (up to
  // RIBBON_MAX) gets smaller, tighter text so it isn't cut off at the photo's edges.
  const size = ribbon.text.length > 14 ? "text-[9px] tracking-wider py-[5px]" : "text-[10px] tracking-widest py-1";
  return (
    <div
      className={`pointer-events-none absolute top-[45px] -right-[44px] w-[200px] rotate-45 text-center font-black uppercase whitespace-nowrap shadow-md ${size} ${colours}`}
      style={custom ? { backgroundColor: custom, color: inkOn(custom) } : undefined}
    >
      {ribbon.text}
    </div>
  );
}

// A special's deal, e.g. "Buy 2, get 1 free", as a small tag - with the size it's on, when a product has several.
export function SpecialTag({ special, size, className = "" }: { special: Special; size?: string; className?: string }) {
  return (
    <span className={`flex items-start gap-1 text-[11px] leading-4 font-black text-gold-400 ${className}`}>
      <Tag size={11} className="mt-0.5 flex-shrink-0" aria-hidden />
      <span>
        {size ? `${size}: ` : ""}
        {dealText(special)}
      </span>
    </span>
  );
}

// Under a sent order's line: the special or storewide sale it got and what it saved (nothing if it didn't qualify).
export function LineSaving({ line, saving }: { line: ShopOrderLine; saving: OrderPricing["lines"][number] }) {
  const deal =
    saving.storewideNzd > 0 && line.storewide
      ? `${line.storewide.percentOff}% off storewide sale`
      : saving.specialNzd > 0 && line.special
        ? dealText(line.special)
        : null;
  if (!deal) return null;
  return (
    <div className="text-[11px] font-bold text-gold-400">
      {deal} - you saved {money(saving.storewideNzd + saving.specialNzd)}
    </div>
  );
}

// Across the top of the shop while a storewide sale is on, in the owner's words and colour ("" = brand colour).
export function SaleBanner({ sale }: { sale: StorewideSale }) {
  const custom = isHexColour(sale.bannerColour) ? sale.bannerColour : null;
  const deal = storewideText(sale, money);
  const own = sale.bannerText.trim();
  // With their own wording, the deal itself still shows underneath.
  const details = [
    own ? deal : null,
    sale.endsOn ? `Ends ${formatDate(sale.endsOn, { weekday: "long", day: "numeric", month: "long" })}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      className={`theme-keep-bg rounded-2xl px-4 py-3 flex items-center gap-3 shadow-md ${custom ? "" : "bg-gold-500"}`}
      style={custom ? { backgroundColor: custom, color: inkOn(custom) } : undefined}
    >
      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-black/15 flex items-center justify-center" aria-hidden>
        <Percent size={16} />
      </span>
      <div className="min-w-0">
        <div className="text-sm md:text-base font-black leading-snug">{own || deal}</div>
        {details && <div className="text-xs font-semibold opacity-80">{details}</div>}
      </div>
    </div>
  );
}

// A price with any immediate saving - a special's straight % off, or a storewide sale with no minimum spend,
// whichever is more: the full price struck through beside the sale price.
export function SpecialPrice({
  priceNzd,
  special,
  sale,
}: {
  priceNzd: number;
  special: Special | null | undefined;
  sale?: StorewideDeal | null;
}) {
  const now = bestUnitPrice(priceNzd, special, sale);
  if (now === priceNzd) return <>{money(priceNzd)}</>;
  return (
    <>
      <span className="text-slate-500 line-through font-semibold mr-1.5">{money(priceNzd)}</span>
      {money(now)}
    </>
  );
}

export function QtyStepper({
  value,
  max,
  onChange,
  disabled,
}: {
  value: number;
  max: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
}) {
  const btn =
    "w-9 h-full flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition";
  return (
    <div className="inline-flex items-center h-10 border border-slate-700 rounded-xl overflow-hidden bg-slate-950/60">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={disabled || value <= 1} aria-label="Fewer">
        <Minus size={13} />
      </button>
      <span className="w-9 text-center text-sm font-bold text-white tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label="More">
        <Plus size={13} />
      </button>
    </div>
  );
}

// Lowest to highest, after any straight percentage off (a special's, or a storewide sale with no minimum spend).
export function priceRange(variants: ShopVariant[], sale?: StorewideDeal | null): string {
  const prices = variants.map((v) => bestUnitPrice(v.priceNzd, v.special, sale));
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? money(low) : `${money(low)} – ${money(high)}`;
}

// The product's overall stock label: in stock if any size is.
export function productStock(product: ShopProduct): StockLevel {
  const levels = product.variants.map((v) => v.stock);
  if (levels.includes("in")) return "in";
  if (levels.includes("low")) return "low";
  if (levels.includes("preorder")) return "preorder";
  return "soon";
}

// The special to show on a product's card and photo: the first size that can be ordered with one.
export const productSpecial = (product: ShopProduct): ShopVariant | undefined =>
  product.variants.find((v) => v.special && v.stock !== "soon");

// Every size or option has the same special (always so for a bundle), so it's shown once, without naming a size.
export const sameSpecialForAll = (product: ShopProduct) =>
  product.variants.every((v) => JSON.stringify(v.special) === JSON.stringify(product.variants[0].special));

export const variantName = (product: ShopProduct, variant: ShopVariant) =>
  [product.name, variant.label].filter(Boolean).join(" ");
