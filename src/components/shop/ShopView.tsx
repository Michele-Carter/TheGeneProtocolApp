import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { Check, Package, Search, ShoppingCart, X } from "lucide-react";
import type { AccountTab } from "../MyAccount";
import { SHOP_SECTIONS, type ShopOrder, type ShopProduct, type ShopSection } from "../../../shared/shop";
import { shopApi } from "../../lib/shopApi";
import { useCart } from "../../hooks/useCart";
import { ErrorNote } from "../admin/ui";
import LoadingSpinner from "../LoadingSpinner";
import ProductPage from "./ProductPage";
import CartPage from "./CartPage";
import OrderSent from "./OrderSent";
import { ProductImage, StockBadge, priceRange, productStock, cardPrimary, cardSecondary, shopSecondary } from "./parts";

type Page = { name: "list" } | { name: "product"; id: string } | { name: "cart" } | { name: "sent"; order: ShopOrder };

export default function ShopView({ onOpenAccount }: { onOpenAccount: (tab: AccountTab) => void }) {
  const { getToken } = useAuth();
  const cart = useCart();
  const [products, setProducts] = useState<ShopProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>({ name: "list" });
  const [section, setSection] = useState<ShopSection | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProducts(await shopApi.products(getToken));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const go = (next: Page) => {
    setPage(next);
    document.querySelector(".app-main-scroller")?.scrollTo({ top: 0 });
  };

  const inSection = useMemo(
    () => (products ?? []).filter((p) => section == null || p.section === section),
    [products, section]
  );
  // Only the categories used in the chosen tab.
  const categories = useMemo(
    () => Array.from(new Set(inSection.flatMap((p) => p.categories))).sort((a, b) => a.localeCompare(b)),
    [inSection]
  );
  const sectionCount = (id: ShopSection | null) => (products ?? []).filter((p) => id == null || p.section === id).length;
  // Tabs with nothing in them are left out.
  const sections = SHOP_SECTIONS.filter((s) => sectionCount(s.id) > 0);
  const chooseSection = (id: ShopSection | null) => {
    setSection(id);
    setCategory(null);
  };

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      inSection.filter((p) => {
        if (category && !p.categories.includes(category)) return false;
        if (!q) return true;
        return [p.name, p.description, ...p.categories, ...p.variants.map((v) => v.label)].join(" ").toLowerCase().includes(q);
      }),
    [inSection, category, q]
  );

  const quickAdd = (product: ShopProduct) => {
    const variant = product.variants[0];
    cart.add(variant.key, 1);
    setJustAdded(product.id);
    window.setTimeout(() => setJustAdded((id) => (id === product.id ? null : id)), 1800);
  };

  const header = (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-lg font-black text-white tracking-tight">Shop</h2>
        <p className="text-sm text-slate-400">Choose your products and send us your order - we'll confirm it and the shipping cost.</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
      <button className={shopSecondary} onClick={() => onOpenAccount("orders")}>
        <Package size={14} /> <span className="hidden sm:inline">My orders</span>
      </button>
      <button className={`${shopSecondary} relative`} onClick={() => go({ name: "cart" })}>
        <ShoppingCart size={14} /> Cart
        {cart.count > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[1.25rem] h-5 px-1 rounded-full bg-gold-500 text-slate-950 text-[10px] font-black flex items-center justify-center tabular-nums">
            {cart.count}
          </span>
        )}
      </button>
      </div>
    </div>
  );

  if (page.name === "product" && products) {
    const product = products.find((p) => p.id === page.id);
    if (product) {
      return (
        <div className="space-y-6">
          {header}
          <ProductPage product={product} cart={cart} onBack={() => go({ name: "list" })} onViewCart={() => go({ name: "cart" })} />
        </div>
      );
    }
  }

  if (page.name === "cart") {
    return (
      <div className="space-y-6">
        {header}
        <CartPage
          products={products ?? []}
          cart={cart}
          onBack={() => go({ name: "list" })}
          onOpenAccount={() => onOpenAccount("details")}
          onStockChanged={load}
          onSent={(order) => {
            cart.clear();
            void load();
            go({ name: "sent", order });
          }}
        />
      </div>
    );
  }

  if (page.name === "sent") {
    return (
      <div className="space-y-6">
        {header}
        <OrderSent order={page.order} onBack={() => go({ name: "list" })} onViewOrders={() => onOpenAccount("orders")} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {sections.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-slate-800" role="tablist" aria-label="Product type">
          {[{ id: null, label: "All" } as { id: ShopSection | null; label: string }, ...sections].map((s) => (
            <button
              key={s.id ?? "all"}
              role="tab"
              aria-selected={section === s.id}
              onClick={() => chooseSection(s.id)}
              className={`px-4 py-2.5 -mb-px text-sm font-black border-b-2 transition cursor-pointer ${
                section === s.id ? "border-gold-500 text-white" : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              {s.label}
              <span className="ml-1.5 text-[11px] font-bold text-slate-500 tabular-nums">{sectionCount(s.id)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {[null, ...categories].map((c) => (
          <button
            key={c ?? "all"}
            onClick={() => setCategory(c)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
              category === c
                ? "border-gold-500 bg-gold-500 text-slate-950"
                : "border-slate-800 text-slate-300 hover:text-white hover:border-slate-600"
            }`}
          >
            {c ?? "All"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[12rem] max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products..."
            className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-2.5 pl-10 pr-9 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-gold-500/60 transition"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {products && (
          <span className="text-xs text-slate-500 ml-auto">
            {visible.length} product{visible.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <ErrorNote message={error} />
      {products == null && !error && <LoadingSpinner label="Loading the shop..." />}

      {products && visible.length === 0 && (
        <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl text-sm text-slate-400">
          {products.length === 0 ? "Nothing in the shop yet - check back soon." : "No products match."}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {visible.map((product) => {
          const stock = productStock(product);
          const single = product.variants.length === 1;
          const sizes = product.variants.map((v) => v.label).filter(Boolean);
          return (
            <div
              key={product.id}
              className="group bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 hover:border-slate-700 transition"
            >
              <button
                onClick={() => go({ name: "product", id: product.id })}
                className="text-left cursor-pointer space-y-4"
                aria-label={`View ${product.name}`}
              >
                <ProductImage src={product.images[0]} alt={product.name} className="aspect-square" />
                <div className="space-y-1">
                  {product.categories[0] && (
                    <div className="text-[10px] font-black uppercase tracking-widest text-gold-400">{product.categories[0]}</div>
                  )}
                  <h3 className="text-base font-black text-white leading-snug group-hover:text-gold-300 transition">{product.name}</h3>
                  <p className="text-xs text-slate-500">
                    {product.kind === "bundle" ? "Bundle" : sizes.length > 0 ? sizes.join(" · ") : " "}
                  </p>
                </div>
              </button>
              <div className="mt-auto flex items-end justify-between gap-2">
                <div className="space-y-1.5">
                  <div className="text-[15px] leading-5 font-black text-white tabular-nums whitespace-nowrap">{priceRange(product.variants)}</div>
                  <StockBadge stock={stock} />
                </div>
                {stock === "out" ? (
                  <button className={cardSecondary} disabled>
                    Sold out
                  </button>
                ) : single ? (
                  <button
                    className={cardPrimary}
                    onClick={() => quickAdd(product)}
                    disabled={cart.qtyOf(product.variants[0].key) >= product.variants[0].maxQty}
                    title={
                      cart.qtyOf(product.variants[0].key) >= product.variants[0].maxQty
                        ? "You have all available stock of this in your cart"
                        : undefined
                    }
                  >
                    {justAdded === product.id ? (
                      <>
                        <Check size={13} /> Added
                      </>
                    ) : (
                      "Add to cart"
                    )}
                  </button>
                ) : (
                  <button className={cardPrimary} onClick={() => go({ name: "product", id: product.id })}>
                    Select options
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
