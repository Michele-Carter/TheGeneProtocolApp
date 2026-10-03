import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { MessageSquare, Package, Truck } from "lucide-react";
import type { ShopOrder } from "../../../shared/shop";
import { money, shopApi } from "../../lib/shopApi";
import { ErrorNote } from "../admin/ui";
import LoadingSpinner, { Spinner } from "../LoadingSpinner";
import { shopPrimary, shopSecondary } from "./parts";

type Tone = "good" | "warn" | "muted" | "bad";

const TONES: Record<Tone, string> = {
  good: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  warn: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  muted: "text-slate-400 bg-slate-800/60 border-slate-700",
  bad: "text-red-300 bg-red-500/10 border-red-500/30",
};

function statusOf(order: ShopOrder): { label: string; tone: Tone; detail: string } {
  if (order.status === "submitted") {
    return { label: "Waiting for confirmation", tone: "warn", detail: "We're checking your order and will confirm it with the shipping cost." };
  }
  if (order.status === "declined") return { label: "Declined", tone: "bad", detail: "" };
  if (order.status === "cancelled") return { label: "Cancelled", tone: "muted", detail: "You cancelled this order." };
  const p = order.progress;
  if (!p) return { label: "Confirmed", tone: "good", detail: "" };
  if (p.shippingStatus === "delivered") return { label: "Delivered", tone: "good", detail: "" };
  if (p.shippingStatus === "collected") return { label: "Collected", tone: "good", detail: "" };
  if (p.shippingStatus === "sent") return { label: "On its way", tone: "good", detail: "" };
  return { label: "Confirmed", tone: "good", detail: "We're getting your order ready to send." };
}

const date = (iso: string) => new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });

export default function MyOrders({ onShop }: { onShop: () => void }) {
  const { getToken } = useAuth();
  const [orders, setOrders] = useState<ShopOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await shopApi.orders(getToken));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (order: ShopOrder) => {
    if (!window.confirm(`Cancel order #${order.orderNumber}?`)) return;
    setCancelling(order.id);
    setError(null);
    try {
      await shopApi.cancelOrder(order.id, getToken);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCancelling(null);
      await load();
    }
  };

  if (orders == null) return error ? <ErrorNote message={error} /> : <LoadingSpinner label="Loading your orders..." />;

  if (orders.length === 0) {
    return (
      <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl space-y-4">
        <Package size={28} className="mx-auto text-slate-600" />
        <p className="text-sm text-slate-400">You haven't placed any orders yet.</p>
        <button className={shopPrimary} onClick={onShop}>
          Go to the shop
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      {orders.map((order) => {
        const status = statusOf(order);
        const p = order.progress;
        return (
          <section key={order.id} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white">Order #{order.orderNumber}</h3>
                <p className="text-xs text-slate-500">Sent {date(order.createdAt)}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold ${TONES[status.tone]}`}>
                {status.label}
              </span>
            </div>
            {status.detail && <p className="text-xs text-slate-400 -mt-2">{status.detail}</p>}

            {order.adminMessage && (
              <div className="flex gap-2.5 text-sm text-slate-200 bg-gold-500/5 border border-gold-500/20 rounded-2xl px-4 py-3">
                <MessageSquare size={15} className="text-gold-400 flex-shrink-0 mt-0.5" />
                <p className="whitespace-pre-line">{order.adminMessage}</p>
              </div>
            )}

            {p && (p.shippingStatus === "sent" || p.shippingStatus === "delivered") && (p.tracking || p.courier) && (
              <div className="flex items-center gap-2.5 text-sm text-slate-300">
                <Truck size={15} className="text-gold-400 flex-shrink-0" />
                <span>
                  {p.courier && <span className="font-bold text-white">{p.courier}</span>}
                  {p.courier && p.tracking && " · "}
                  {p.tracking && (
                    <>
                      Tracking <span className="font-mono text-white select-all">{p.tracking}</span>
                    </>
                  )}
                </span>
              </div>
            )}

            <div className="border-t border-slate-800 pt-3 space-y-1.5">
              {order.lines.map((line) => (
                <div key={line.key} className="flex justify-between gap-3 text-sm">
                  <span className="text-slate-300">
                    <span className="text-slate-500 tabular-nums">{line.qty}×</span> {[line.name, line.variant].filter(Boolean).join(" ")}
                  </span>
                  <span className="text-slate-200 tabular-nums">{money(line.qty * line.unitPriceNzd)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-800 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Shipping</span>
                <span className="tabular-nums">
                  {order.shippingNzd != null ? money(order.shippingNzd) : order.status === "submitted" ? "To be confirmed" : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-white">Total</span>
                <span className="font-black text-white tabular-nums">
                  {p ? money(p.totalNzd) : money(order.subtotalNzd + (order.shippingNzd ?? 0))}
                  {order.status === "submitted" && <span className="text-slate-500 font-normal"> + shipping</span>}
                </span>
              </div>
              {p && (
                <div className="flex justify-between text-xs pt-1">
                  <span className="text-slate-400">Payment</span>
                  <span className={p.paymentStatus === "paid" ? "text-emerald-400 font-bold" : "text-amber-300 font-bold"}>
                    {p.paymentStatus === "paid"
                      ? "Paid - thank you"
                      : p.paymentStatus === "part-paid"
                        ? `Part paid - ${money(p.balanceNzd)} to go`
                        : `${money(p.balanceNzd)} to pay`}
                  </span>
                </div>
              )}
            </div>

            {order.notes && <p className="text-xs text-slate-500">Your note: {order.notes}</p>}

            {order.status === "submitted" && (
              <button className={shopSecondary} onClick={() => void cancel(order)} disabled={cancelling != null}>
                {cancelling === order.id && <Spinner size={13} />} Cancel order
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
