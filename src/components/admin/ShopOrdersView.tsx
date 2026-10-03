import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { addressLines } from "../../../shared/customers";
import type { ShopOrderStatus } from "../../../shared/shop";
import { adminApi, nzd, type ShopOrderDetail, type ShopOrderSummary } from "../../lib/adminApi";
import { Card, ErrorNote, Field, NumberField, StatRow, StatusDot, dangerButton, inputClass, primaryButton, secondaryButton } from "./ui";
import LoadingSpinner, { Spinner } from "../LoadingSpinner";

type Tab = "submitted" | "confirmed" | "declined" | "all";

const TABS: { id: Tab; label: string }[] = [
  { id: "submitted", label: "Waiting" },
  { id: "confirmed", label: "Confirmed" },
  { id: "declined", label: "Declined" },
  { id: "all", label: "All" },
];

const STATUS: Record<ShopOrderStatus, { label: string; tone: "good" | "warn" | "muted" }> = {
  submitted: { label: "Waiting", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "good" },
  declined: { label: "Declined", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function ShopOrdersView({
  onOpenSale,
  onChanged,
}: {
  onOpenSale: (saleId: string) => void;
  onChanged: () => void;
}) {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<ShopOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("submitted");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await adminApi.listShopOrders(getToken));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { submitted: 0, confirmed: 0, declined: 0, all: 0 };
    for (const r of rows ?? []) {
      c.all++;
      if (r.status === "submitted" || r.status === "confirmed" || r.status === "declined") c[r.status]++;
    }
    return c;
  }, [rows]);

  const filtered = (rows ?? []).filter((r) => tab === "all" || r.status === tab);

  if (selectedId) {
    return (
      <OrderReview
        id={selectedId}
        onOpenSale={onOpenSale}
        onBack={() => {
          setSelectedId(null);
          void load();
        }}
        onDecided={() => {
          onChanged();
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
              tab === t.id ? "border-gold-500/60 text-gold-400 bg-gold-500/10" : "border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {t.label}
            {rows && <span className="ml-1.5 tabular-nums opacity-70">{counts[t.id]}</span>}
          </button>
        ))}
        <button className={`${secondaryButton} ml-auto`} onClick={() => void load()} aria-label="Refresh">
          <RefreshCw size={13} />
        </button>
      </div>

      <ErrorNote message={error} />
      {rows == null && !error && <LoadingSpinner label="Loading orders..." />}

      {rows && filtered.length === 0 && (
        <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl">
          <p className="text-sm text-slate-400">
            {tab === "submitted" ? "No orders waiting - you're all caught up." : "No orders here."}
          </p>
          {rows.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">Orders customers send from the shop appear here for you to confirm.</p>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80">
          {filtered.map((order) => (
            <button
              key={order.id}
              onClick={() => setSelectedId(order.id)}
              className="w-full text-left px-4 py-3 bg-slate-900/30 hover:bg-slate-900/70 transition cursor-pointer flex items-center gap-3"
            >
              <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-[4.5rem_8rem_minmax(0,1fr)_5rem_6rem_6.5rem] gap-x-4 gap-y-1 items-center">
                <span className="text-sm font-black text-white tabular-nums">#{order.orderNumber}</span>
                <span className="text-xs text-slate-400">{when(order.createdAt)}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white truncate">{order.customerName}</span>
                  <span className="block text-[10px] text-slate-500 truncate">{order.customerEmail || "No email"}</span>
                </span>
                <span className="text-xs text-slate-400 tabular-nums">{order.units} units</span>
                <span className="text-xs tabular-nums text-slate-200 font-semibold">{nzd(order.subtotalNzd)}</span>
                <StatusDot tone={STATUS[order.status].tone}>{STATUS[order.status].label}</StatusDot>
              </div>
              <ChevronRight size={15} className="text-slate-600 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderReview({
  id,
  onOpenSale,
  onBack,
  onDecided,
}: {
  id: string;
  onOpenSale: (saleId: string) => void;
  onBack: () => void;
  onDecided: () => void;
}) {
  const { getToken } = useAuth();
  const [order, setOrder] = useState<ShopOrderDetail | null>(null);
  const [qty, setQty] = useState<Record<string, number | null>>({});
  const [shipping, setShipping] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "confirm" | "decline">(null);

  const load = useCallback(async () => {
    try {
      const o = await adminApi.getShopOrder(id, getToken);
      setOrder(o);
      setQty(Object.fromEntries(o.lines.map((l) => [l.key, l.qty])));
      setShipping(o.shippingNzd);
      setMessage(o.adminMessage);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable = order?.status === "submitted";
  const qtyOf = (key: string) => qty[key] ?? 0;
  const subtotal = order ? order.lines.reduce((t, l) => t + qtyOf(l.key) * l.unitPriceNzd, 0) : 0;
  const short = order ? order.lines.filter((l) => qtyOf(l.key) > l.available) : [];
  const changed = order ? order.lines.some((l) => qtyOf(l.key) !== l.qty) : false;
  const anyLeft = order ? order.lines.some((l) => qtyOf(l.key) > 0) : false;

  const confirm = async () => {
    if (!order) return;
    if (shipping == null) {
      setError("Enter the shipping charge for this order (0 if there isn't one).");
      return;
    }
    setBusy("confirm");
    setError(null);
    try {
      await adminApi.confirmShopOrder(
        order.id,
        { lines: order.lines.map((l) => ({ key: l.key, qty: qtyOf(l.key) })), shippingNzd: shipping, message },
        getToken
      );
      onDecided();
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    if (!order || !window.confirm(`Decline order #${order.orderNumber}? Its stock is released for other customers.`)) return;
    setBusy("decline");
    setError(null);
    try {
      await adminApi.declineShopOrder(order.id, message, getToken);
      onDecided();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className={secondaryButton} aria-label="Back to orders">
          <ArrowLeft size={14} />
        </button>
        <div>
          <h3 className="text-base font-black text-white flex items-center gap-3">
            {order ? `Order #${order.orderNumber}` : "Loading…"}
            {order && <StatusDot tone={STATUS[order.status].tone}>{STATUS[order.status].label}</StatusDot>}
          </h3>
          {order && (
            <p className="text-[11px] text-slate-500">
              Sent {when(order.createdAt)}
              {order.decidedAt ? ` · ${STATUS[order.status].label.toLowerCase()} ${when(order.decidedAt)}` : ""}
            </p>
          )}
        </div>
      </div>

      <ErrorNote message={error} />
      {!order && !error && <LoadingSpinner label="Loading order..." />}

      {order && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_21rem] gap-5 items-start">
          <div className="space-y-5 min-w-0">
            <Card title="Items">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[34rem]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-white">
                      <th className="py-1.5 pr-3 font-bold">Item</th>
                      <th className="py-1.5 pr-3 font-bold text-right">Price</th>
                      <th className="py-1.5 pr-3 font-bold text-right">{editable ? "Available" : ""}</th>
                      <th className="py-1.5 pr-3 font-bold text-right w-24">Qty</th>
                      <th className="py-1.5 font-bold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {order.lines.map((line) => {
                      const q = qtyOf(line.key);
                      const over = editable && q > line.available;
                      return (
                        <tr key={line.key} className={q === 0 ? "opacity-40" : ""}>
                          <td className="py-2 pr-3">
                            <div className="font-bold text-slate-100">
                              {line.name} <span className="text-slate-400 font-semibold">{line.variant}</span>
                            </div>
                            {line.kind === "bundle" && <div className="text-[10px] text-slate-500">Bundle</div>}
                            {editable && q !== line.qty && (
                              <div className="text-[10px] text-amber-400">Customer asked for {line.qty}</div>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{nzd(line.unitPriceNzd)}</td>
                          <td className={`py-2 pr-3 text-right tabular-nums font-bold ${over ? "text-red-400" : "text-slate-400"}`}>
                            {editable ? line.available : ""}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {editable ? (
                              <NumberField
                                integer
                                ariaLabel={`Quantity of ${line.name}`}
                                value={qty[line.key] ?? null}
                                onChange={(v) => setQty((m) => ({ ...m, [line.key]: v }))}
                                className={over ? "border-red-500/70" : ""}
                              />
                            ) : (
                              <span className="tabular-nums text-slate-200 font-semibold">{line.qty}</span>
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums text-slate-100 font-bold">{nzd(q * line.unitPriceNzd)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {editable && (
                <p className="text-[11px] text-slate-500 mt-3">
                  Available = stock on hand less what other open and waiting orders need. Set a quantity to 0 to remove an
                  item.
                </p>
              )}
              {short.length > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-red-300 mt-2">
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  Not enough stock for {short.map((l) => [l.name, l.variant].filter(Boolean).join(" ")).join(", ")}. Reduce the
                  quantity to confirm.
                </p>
              )}
            </Card>

            {order.notes && (
              <Card title="Customer's note">
                <p className="text-sm text-slate-300 whitespace-pre-line">{order.notes}</p>
              </Card>
            )}
          </div>

          <div className="space-y-5">
            <Card title="Customer">
              <div className="text-sm text-slate-300 leading-relaxed">
                <div className="font-bold text-white">{order.customerName}</div>
                {order.customerEmail && <div className="text-slate-400">{order.customerEmail}</div>}
                <div className="mt-2 text-[10px] uppercase tracking-wider font-bold text-slate-500">Ship to</div>
                {addressLines(order.shippingAddress).map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
            </Card>

            {editable ? (
              <Card title="Confirm">
                <div className="space-y-3">
                  <Field label="Shipping charge (NZD)" hint="What the customer pays for shipping. Enter 0 if none.">
                    <NumberField value={shipping} onChange={setShipping} placeholder="0.00" />
                  </Field>
                  <Field label="Message to customer (optional)" hint="Shown to the customer with the confirmation or decline.">
                    <textarea
                      className={`${inputClass} min-h-[4.5rem] resize-y`}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={changed ? "e.g. We only had 2 left, so we've adjusted your order." : ""}
                    />
                  </Field>
                  <div>
                    <StatRow label="Items" value={nzd(subtotal)} />
                    <StatRow label="Shipping" value={shipping == null ? "—" : nzd(shipping)} />
                    <StatRow label="Total" value={nzd(subtotal + (shipping ?? 0))} strong />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={primaryButton}
                      onClick={confirm}
                      disabled={busy != null || short.length > 0 || !anyLeft || shipping == null}
                    >
                      {busy === "confirm" ? <Spinner size={13} /> : <CheckCircle2 size={13} />} Confirm order
                    </button>
                    <button className={`${dangerButton} ml-auto`} onClick={decline} disabled={busy != null}>
                      {busy === "decline" ? <Spinner size={13} /> : <XCircle size={13} />} Decline
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Confirming adds it to Customer Orders, where you record payment and shipping and complete it as usual.
                  </p>
                </div>
              </Card>
            ) : (
              <Card title={STATUS[order.status].label}>
                <StatRow label="Items" value={nzd(order.subtotalNzd)} />
                {order.shippingNzd != null && <StatRow label="Shipping" value={nzd(order.shippingNzd)} />}
                {order.status === "confirmed" && (
                  <StatRow label="Total" value={nzd(order.subtotalNzd + (order.shippingNzd ?? 0))} strong />
                )}
                {order.adminMessage && (
                  <div className="mt-3">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Your message</div>
                    <p className="text-xs text-slate-300 whitespace-pre-line mt-1">{order.adminMessage}</p>
                  </div>
                )}
                {order.saleId && (
                  <button className={`${primaryButton} mt-4`} onClick={() => onOpenSale(order.saleId!)}>
                    <ExternalLink size={13} /> Open customer order
                  </button>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
