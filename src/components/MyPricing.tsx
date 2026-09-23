/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import { Search, PackageCheck, Info } from "lucide-react";
import { MY_PRODUCTS } from "../data/myProducts";

export default function MyPricing() {
  const [query, setQuery] = useState("");

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return MY_PRODUCTS;

    return MY_PRODUCTS.filter((product) => {
      if (product.name.toLowerCase().includes(normalized)) return true;
      return product.options.some((option) => option.code?.toLowerCase().includes(normalized));
    });
  }, [query]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-black text-white tracking-tight">Pricing</h2>
        <p className="text-sm text-slate-400">Current product lineup and pricing, straight from us.</p>
      </div>

      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products or codes..."
          className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-gold-500/60 transition"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredProducts.map((product) => (
          <div
            key={product.id}
            className="p-5 bg-slate-900/40 rounded-2xl border border-slate-800 flex flex-col gap-4"
          >
            <div className="space-y-1">
              <h3 className="text-sm font-black text-white">{product.name}</h3>
              {product.note && (
                <div className="flex items-start gap-1.5 text-[11px] text-amber-400/90 leading-snug">
                  <Info size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{product.note}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              {product.options.map((option, index) => (
                <div
                  key={`${option.code ?? option.vialSize}-${index}`}
                  className="flex items-center justify-between text-xs bg-slate-950/60 border border-slate-900 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-semibold">{option.vialSize}</span>
                    {option.code && <span className="text-slate-600 font-mono">{option.code}</span>}
                    {option.inStock && (
                      <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-bold">
                        <PackageCheck size={11} />
                        In Stock
                      </span>
                    )}
                  </div>
                  <span className="text-gold-400 font-black">${option.priceUsd}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {filteredProducts.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-500 text-sm">
            No products match "{query}".
          </div>
        )}
      </div>
    </div>
  );
}
