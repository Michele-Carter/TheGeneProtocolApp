import React from "react";
import { CheckCircle2, Minus, Package, Plus } from "lucide-react";
import type { ShopProduct, ShopVariant, StockLevel } from "../../../shared/shop";
import { money } from "../../lib/shopApi";

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

// Product photos have white backgrounds, so they sit on a white panel.
// ribbon: a banner across the photo's top-right corner, e.g. "Coming soon".
export function ProductImage({
  src,
  alt,
  className = "",
  ribbon,
}: {
  src: string | undefined;
  alt: string;
  className?: string;
  ribbon?: string;
}) {
  return (
    <div className={`theme-keep-bg relative bg-white rounded-xl overflow-hidden flex items-center justify-center ${className}`}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" className="w-full h-full object-contain" />
      ) : (
        <Package size={32} className="text-slate-300" aria-hidden />
      )}
      {ribbon && (
        <div className="pointer-events-none absolute top-[45px] -right-[44px] w-[200px] rotate-45 bg-violet-600 py-1 text-center text-[10px] font-black uppercase tracking-widest text-white shadow-md">
          {ribbon}
        </div>
      )}
    </div>
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

export function priceRange(variants: ShopVariant[]): string {
  const prices = variants.map((v) => v.priceNzd);
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

export const variantName = (product: ShopProduct, variant: ShopVariant) =>
  [product.name, variant.label].filter(Boolean).join(" ");
