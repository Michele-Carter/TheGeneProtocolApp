import React from "react";
import { CheckCircle2 } from "lucide-react";
import type { ShopOrder } from "../../../shared/shop";
import { money } from "../../lib/shopApi";
import { shopPrimary } from "./parts";

export default function OrderSent({ order, onBack }: { order: ShopOrder; onBack: () => void }) {
  return (
    <div className="max-w-xl mx-auto bg-slate-900/40 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
      <div className="text-center space-y-2">
        <CheckCircle2 size={36} className="mx-auto text-emerald-400" />
        <h3 className="text-xl font-black text-white">Order #{order.orderNumber} sent</h3>
        <p className="text-sm text-slate-400">
          Thanks! We'll check everything is in stock and confirm your order along with the shipping cost. Nothing has been
          charged.
        </p>
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-2">
        {order.lines.map((line) => (
          <div key={line.key} className="flex justify-between gap-3 text-sm">
            <span className="text-slate-300">
              <span className="text-slate-500 tabular-nums">{line.qty}×</span> {[line.name, line.variant].filter(Boolean).join(" ")}
            </span>
            <span className="text-white font-semibold tabular-nums">{money(line.qty * line.unitPriceNzd)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-3 text-sm border-t border-slate-800 pt-2">
          <span className="text-slate-300">Subtotal</span>
          <span className="text-white font-black tabular-nums">{money(order.subtotalNzd)}</span>
        </div>
        <div className="flex justify-between gap-3 text-sm">
          <span className="text-slate-300">Shipping</span>
          <span className="text-slate-400">To be confirmed</span>
        </div>
      </div>

      <div className="text-center">
        <button className={shopPrimary} onClick={onBack}>
          Back to shop
        </button>
      </div>
    </div>
  );
}
