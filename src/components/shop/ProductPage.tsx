import React, { useEffect, useState } from "react";
import { ArrowLeft, Check, ShoppingCart } from "lucide-react";
import type { ShopProduct } from "../../../shared/shop";
import { money } from "../../lib/shopApi";
import type { Cart } from "../../hooks/useCart";
import { ProductImage, QtyStepper, StockBadge, priceRange, productStock, shopPrimary, shopSecondary } from "./parts";

export default function ProductPage({
  product,
  cart,
  onBack,
  onViewCart,
}: {
  product: ShopProduct;
  cart: Cart;
  onBack: () => void;
  onViewCart: () => void;
}) {
  const single = product.variants.length === 1;
  // "Size" for 5mg / 10mg / 3ml; "Option" for anything else, e.g. pen colours.
  const choiceLabel = product.variants.every((v) => /^\d/.test(v.label.trim())) ? "Size" : "Option";
  // Like most shops, a product with several sizes starts on "Choose an option".
  const [variantKey, setVariantKey] = useState<string>(single ? product.variants[0].key : "");
  const variant = product.variants.find((v) => v.key === variantKey) ?? null;
  const gallery = variant && variant.images.length > 0 ? variant.images : product.images;
  const [imageIndex, setImageIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setImageIndex(0);
    setQty(1);
    setAdded(false);
  }, [variantKey]);

  const inCart = variant ? cart.qtyOf(variant.key) : 0;
  const canAdd = variant ? Math.max(0, variant.maxQty - inCart) : 0;

  const add = () => {
    if (!variant || qty < 1 || qty > canAdd) return;
    cart.add(variant.key, qty);
    setAdded(true);
    setQty(1);
  };

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-gold-400 hover:text-gold-300 cursor-pointer"
      >
        <ArrowLeft size={13} /> Back to shop
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-start">
        <div className="space-y-3">
          <ProductImage src={gallery[imageIndex] ?? gallery[0]} alt={product.name} className="aspect-square border border-slate-800" />
          {gallery.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {gallery.map((url, i) => (
                <button
                  key={url}
                  onClick={() => setImageIndex(i)}
                  aria-label={`Show image ${i + 1}`}
                  className={`theme-keep-bg w-16 h-16 rounded-lg overflow-hidden border-2 cursor-pointer transition ${
                    i === imageIndex ? "border-gold-500" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  <ProductImage src={url} alt="" className="w-full h-full rounded-none" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          {product.categories.length > 0 && (
            <div className="text-[11px] font-black uppercase tracking-widest text-gold-400">{product.categories.join(" · ")}</div>
          )}
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">{product.name}</h1>
          <div className="text-2xl font-black text-white tabular-nums">
            {variant ? money(variant.priceNzd) : priceRange(product.variants)}
          </div>

          {product.description && (
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{product.description}</p>
          )}

          {product.contents && product.contents.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-white">What's included</div>
              <ul className="space-y-1">
                {product.contents.map((c) => (
                  <li key={c.name} className="text-sm text-slate-300">
                    <span className="text-slate-500 tabular-nums">{c.qty}×</span> {c.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-slate-800 pt-5 space-y-4">
            {!single && (
              <label className="flex items-center gap-4">
                <span className="text-sm text-slate-400 w-14">{choiceLabel}</span>
                <select
                  value={variantKey}
                  onChange={(e) => setVariantKey(e.target.value)}
                  className="bg-slate-950/70 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-gold-500/60 min-w-[12rem] cursor-pointer"
                >
                  <option value="">Choose an option</option>
                  {product.variants.map((v) => (
                    <option key={v.key} value={v.key} disabled={v.stock === "out"}>
                      {v.label}
                      {v.stock === "out" ? " - out of stock" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div>
              <StockBadge stock={variant ? variant.stock : productStock(product)} />
              {variant && inCart > 0 && (
                <span className="ml-2 text-xs text-slate-400">{inCart} already in your cart</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <QtyStepper value={qty} max={Math.max(1, canAdd)} onChange={setQty} disabled={!variant || canAdd === 0} />
              <button className={`${shopPrimary} h-10 px-6`} onClick={add} disabled={!variant || canAdd === 0}>
                {variant && variant.stock === "out" ? "Sold out" : "Add to cart"}
              </button>
            </div>
            {variant && variant.stock !== "out" && canAdd === 0 && (
              <p className="text-xs text-amber-300">You have all the available stock of this in your cart.</p>
            )}

            {added && (
              <div className="flex flex-wrap items-center gap-3 text-sm text-emerald-400">
                <span className="flex items-center gap-1.5">
                  <Check size={15} /> Added to your cart
                </span>
                <button className={shopSecondary} onClick={onViewCart}>
                  <ShoppingCart size={13} /> View cart
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 border-t border-slate-800 pt-4">
            Shipping is worked out for your order and confirmed by us before anything is sent. Nothing is charged when
            you send your order.
          </p>
        </div>
      </div>
    </div>
  );
}
