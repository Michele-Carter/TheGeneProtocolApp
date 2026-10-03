import React from "react";
import { Minus, Package, Plus } from "lucide-react";
import type { ShopProduct, ShopVariant, StockLevel } from "../../../shared/shop";
import { money } from "../../lib/shopApi";

export const shopButton =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
// theme-keep-bg: opts out of the dark theme's rule that repaints rounded boxes (src/index.css).
export const shopPrimary = `${shopButton} theme-keep-bg border-gold-500 bg-gold-500 text-slate-950 hover:bg-gold-400 hover:border-gold-400`;
export const shopSecondary = `${shopButton} border-slate-700 text-slate-200 hover:text-white hover:border-slate-500`;

export function StockBadge({ stock }: { stock: StockLevel }) {
  const style =
    stock === "in"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : stock === "low"
        ? "text-amber-300 bg-amber-500/10 border-amber-500/30"
        : "text-slate-400 bg-slate-800/60 border-slate-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${style}`}>
      {stock === "in" ? "In stock" : stock === "low" ? "Low stock" : "Out of stock"}
    </span>
  );
}

// Product photos have white backgrounds, so they sit on a white panel.
export function ProductImage({ src, alt, className = "" }: { src: string | undefined; alt: string; className?: string }) {
  return (
    <div className={`theme-keep-bg bg-white rounded-xl overflow-hidden flex items-center justify-center ${className}`}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" className="w-full h-full object-contain" />
      ) : (
        <Package size={32} className="text-slate-300" aria-hidden />
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
  return "out";
}

export const variantName = (product: ShopProduct, variant: ShopVariant) =>
  [product.name, variant.label].filter(Boolean).join(" ");
