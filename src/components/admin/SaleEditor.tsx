import React, { useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { fifoEstimate, saleProfit, saleTotals, type SaleInput, type SaleLine, type ShippingStatus } from "../../../shared/sales";
import { MY_PRODUCTS } from "../../data/myProducts";
import { adminApi, nzd, todayIso, type InventorySummaryRow, type SaleRecord } from "../../lib/adminApi";
import {
  Card,
  ErrorNote,
  Field,
  NumberField,
  StatRow,
  dangerButton,
  inputClass,
  newId,
  primaryButton,
  secondaryButton,
} from "./ui";

// Selling prices from the customer Pricing page (NZD per vial; the data field is named priceUsd).
const PRICE_LIST: Record<string, number> = Object.fromEntries(
  MY_PRODUCTS.flatMap((product) =>
    product.options.filter((o) => o.code).map((o) => [`cat:${o.code}`, o.priceUsd] as const)
  )
);

const SHIPPING_STATUSES: { id: ShippingStatus; label: string }[] = [
  { id: "not-sent", label: "Not sent" },
  { id: "sent", label: "Sent" },
  { id: "delivered", label: "Delivered" },
  { id: "collected", label: "Collected" },
];

interface Props {
  record: SaleRecord | null;
  initialData: SaleInput;
  inventory: InventorySummaryRow[];
  customers: string[];
  lastPrices: Record<string, number>;
  onBack: () => void;
  onChanged: (record: SaleRecord) => void;
  onDeleted: () => void;
}

export default function SaleEditor({ record, initialData, inventory, customers, lastPrices, onBack, onChanged, onDeleted }: Props) {
  const { getToken } = useAuth();
  const [data, setData] = useState<SaleInput>(initialData);
  const [savedJson, setSavedJson] = useState(JSON.stringify(initialData));
  const [current, setCurrent] = useState<SaleRecord | null>(record);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completed = current?.status === "completed";
  const dirty = JSON.stringify(data) !== savedJson;
  const totals = useMemo(() => saleTotals(data), [data]);

  const stockById = useMemo(() => Object.fromEntries(inventory.map((row) => [row.item.id, row])), [inventory]);
  const estimate = useMemo(
    () => fifoEstimate(data.lines, Object.fromEntries(inventory.map((row) => [row.item.id, row.fifo]))),
    [data.lines, inventory]
  );
  // Before completion the cost is estimated from the oldest batches; after, it's what was actually taken.
  const lineCost = (lineId: string) => (completed ? current?.costDetail?.[lineId] ?? null : estimate.byLine[lineId] ?? null);
  const cogs = completed ? current?.cogsNzd ?? null : estimate.total;
  const { profit, marginPct } = saleProfit(data, cogs);

  const peptides = inventory.filter((row) => row.item.kind === "peptide");
  const supplies = inventory.filter((row) => row.item.kind === "supply");

  const set = <K extends keyof SaleInput>(key: K, value: SaleInput[K]) => setData((d) => ({ ...d, [key]: value }));
  const updateLine = (lineId: string, patch: Partial<SaleLine>) =>
    setData((d) => ({ ...d, lines: d.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }));

  const chooseItem = (line: SaleLine, itemId: string) => {
    const row = stockById[itemId];
    if (!row) return;
    updateLine(line.id, {
      itemId,
      kind: row.item.kind,
      name: row.item.name,
      variant: row.item.variant,
      unit: row.item.unit,
      unitPriceNzd: PRICE_LIST[itemId] ?? lastPrices[itemId] ?? 0,
    });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = (saved: SaleRecord) => {
    setCurrent(saved);
    setData(saved.data);
    setSavedJson(JSON.stringify(saved.data));
    onChanged(saved);
  };

  const persist = async (): Promise<SaleRecord> => {
    if (!data.customerName.trim()) throw new Error("Enter the customer's name.");
    if (data.lines.some((l) => !l.itemId)) throw new Error("Choose an item on every line.");
    if (data.lines.some((l) => !(l.qty >= 1))) throw new Error("Every item needs a quantity of at least 1.");
    const saved = current
      ? await adminApi.updateSale(current.id, data, getToken)
      : await adminApi.createSale(data, getToken);
    apply(saved);
    return saved;
  };

  const save = () => run(async () => void (await persist()));

  const complete = () => {
    if (data.lines.length === 0) {
      setError("Add at least one item before completing.");
      return;
    }
    if (estimate.short.length > 0) {
      setError("There isn't enough stock for every item — check the quantities marked in red.");
      return;
    }
    const summary = data.lines.map((l) => `• ${l.qty} × ${l.name} ${l.variant}`.trim()).join("\n");
    if (!window.confirm(`Complete this order and take these out of stock?\n\n${summary}`)) return;
    run(async () => {
      const saved = dirty || !current ? await persist() : current;
      apply(await adminApi.completeSale(saved.id, data.orderDate, getToken));
    });
  };

  const reopen = () => {
    if (!current) return;
    if (!window.confirm("Reopen this order? Its items go back into stock (into the same batches they came from).")) return;
    run(async () => apply(await adminApi.reopenSale(current.id, getToken)));
  };

  const remove = () => {
    if (!current) {
      onBack();
      return;
    }
    if (!window.confirm("Delete this customer order? This can't be undone.")) return;
    run(async () => {
      await adminApi.deleteSale(current.id, getToken);
      onDeleted();
    });
  };

  const back = () => {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    onBack();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={back} className={secondaryButton} aria-label="Back to customer orders">
            <ArrowLeft size={14} />
          </button>
          <div className="min-w-0">
            <h3 className="text-base font-black text-white truncate">
              {current ? data.customerName || "Customer order" : "New customer order"}
            </h3>
            <p className="text-[11px] text-slate-500">
              {completed
                ? "Completed — items have been taken out of stock and are locked. Payment, shipping and notes can still be edited."
                : "Stock is only taken out when you complete the order."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {completed ? (
            <>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 border border-emerald-900/60 bg-emerald-950/30 rounded-full px-2.5 py-1">
                <CheckCircle2 size={12} /> Completed
              </span>
              <button className={secondaryButton} onClick={reopen} disabled={busy}>
                <RotateCcw size={13} /> Reopen
              </button>
            </>
          ) : (
            <>
              <button className={dangerButton} onClick={remove} disabled={busy}>
                <Trash2 size={13} /> {current ? "Delete" : "Discard"}
              </button>
              <button className={secondaryButton} onClick={complete} disabled={busy}>
                <CheckCircle2 size={13} /> Complete order
              </button>
            </>
          )}
          <button className={primaryButton} onClick={save} disabled={busy || (!dirty && Boolean(current))}>
            <Save size={13} /> {dirty || !current ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      <ErrorNote message={error} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <Card title="Customer">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Customer name">
                <input
                  className={inputClass}
                  list="admin-customers"
                  value={data.customerName}
                  onChange={(e) => set("customerName", e.target.value)}
                />
                <datalist id="admin-customers">
                  {customers.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label="Email / phone (optional)">
                <input
                  className={inputClass}
                  value={data.customerContact}
                  onChange={(e) => set("customerContact", e.target.value)}
                />
              </Field>
              <Field label="Order date">
                <input
                  type="date"
                  className={inputClass}
                  value={data.orderDate}
                  disabled={completed}
                  onChange={(e) => set("orderDate", e.target.value)}
                />
              </Field>
              <Field label="Order number (optional)">
                <input
                  className={inputClass}
                  value={data.orderNumber}
                  onChange={(e) => set("orderNumber", e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card
            title="Items"
            actions={
              !completed && (
                <button
                  className={secondaryButton}
                  onClick={() =>
                    set("lines", [
                      ...data.lines,
                      { id: newId(), itemId: "", kind: "peptide", name: "", variant: "", unit: "vial", qty: 1, unitPriceNzd: 0 },
                    ])
                  }
                >
                  <Plus size={13} /> Add item
                </button>
              )
            }
          >
            {data.lines.length === 0 && (
              <p className="text-xs text-slate-500 py-4 text-center">No items yet — add what the customer ordered.</p>
            )}
            {inventory.length === 0 && (
              <p className="text-xs text-amber-300/90 pb-3">
                Nothing is in inventory yet. Receive a supply order first so there's stock to sell.
              </p>
            )}
            <div className="space-y-3">
              {data.lines.map((line) => {
                const row = stockById[line.itemId];
                const short = !completed && estimate.short.includes(line.id);
                const cost = lineCost(line.id);
                const lineTotal = line.qty * line.unitPriceNzd;
                const listPrice = PRICE_LIST[line.itemId];
                return (
                  <div key={line.id} className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <select
                        className={inputClass}
                        value={line.itemId}
                        disabled={completed}
                        onChange={(e) => chooseItem(line, e.target.value)}
                      >
                        {completed || (line.itemId && !row) ? (
                          <option value={line.itemId}>
                            {line.name} {line.variant}
                          </option>
                        ) : (
                          <option value="" disabled>
                            Choose an item…
                          </option>
                        )}
                        {!completed &&
                          [
                            { label: "Peptides", rows: peptides },
                            { label: "Supplies", rows: supplies },
                          ]
                            .filter((group) => group.rows.length > 0)
                            .map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.rows.map((r) => (
                                  <option key={r.item.id} value={r.item.id} disabled={r.onHand === 0 && r.item.id !== line.itemId}>
                                    {r.item.name} {r.item.variant} — {r.onHand} {r.item.unit}s in stock
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                      </select>
                      {!completed && (
                        <button
                          className="flex-shrink-0 p-2 text-slate-500 hover:text-red-400 transition cursor-pointer"
                          aria-label="Remove item"
                          onClick={() => set("lines", data.lines.filter((l) => l.id !== line.id))}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label={`Quantity (${line.unit || "unit"}s)`}>
                        <NumberField
                          integer
                          value={line.qty}
                          disabled={completed}
                          onChange={(v) => updateLine(line.id, { qty: v ?? 0 })}
                        />
                      </Field>
                      <Field
                        label={`Price per ${line.unit || "unit"} (NZD)`}
                        hint={
                          listPrice != null && listPrice !== line.unitPriceNzd
                            ? `Price list: ${nzd(listPrice)}`
                            : listPrice == null && line.itemId && !completed
                              ? "Not on the price list — last price you charged."
                              : undefined
                        }
                      >
                        <NumberField
                          value={line.unitPriceNzd}
                          disabled={completed}
                          onChange={(v) => updateLine(line.id, { unitPriceNzd: v ?? 0 })}
                        />
                      </Field>
                    </div>
                    {short && (
                      <div className="flex items-center gap-1.5 text-[11px] text-red-400">
                        <AlertTriangle size={12} /> Only {row?.onHand ?? 0} in stock
                        {data.lines.filter((l) => l.itemId === line.itemId).length > 1 ? " (across all lines for this item)" : ""}.
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <Metric label="Line total" value={nzd(lineTotal)} />
                      <Metric label={completed ? "Cost of stock" : "Est. cost of stock"} value={nzd(cost)} />
                      <Metric label="Gross profit" value={cost == null ? "—" : nzd(lineTotal - cost)} highlight />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card title="Charges & costs (NZD)">
              <div className="space-y-3">
                <Field label="Discount off the order">
                  <NumberField value={data.discountNzd} onChange={(v) => set("discountNzd", v ?? 0)} />
                </Field>
                <Field label="Shipping charged to customer">
                  <NumberField value={data.shippingChargedNzd} onChange={(v) => set("shippingChargedNzd", v ?? 0)} />
                </Field>
                <Field label="What shipping cost you" hint="Courier / postage you paid for this order.">
                  <NumberField value={data.shippingCostNzd} onChange={(v) => set("shippingCostNzd", v ?? 0)} />
                </Field>
                <Field label="Payment fees" hint="e.g. card or payment provider fees.">
                  <NumberField value={data.paymentFeesNzd} onChange={(v) => set("paymentFeesNzd", v ?? 0)} />
                </Field>
              </div>
            </Card>

            <div className="space-y-5">
              <Card
                title="Payment"
                actions={
                  totals.balance > 0.004 && (
                    <button
                      className="text-[11px] font-bold text-gold-400 hover:text-gold-300 cursor-pointer"
                      onClick={() =>
                        set("payment", {
                          ...data.payment,
                          amountPaidNzd: Math.round(totals.total * 100) / 100,
                          paidDate: data.payment.paidDate ?? todayIso(),
                        })
                      }
                    >
                      Paid in full
                    </button>
                  )
                }
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount paid">
                    <NumberField
                      value={data.payment.amountPaidNzd}
                      onChange={(v) => set("payment", { ...data.payment, amountPaidNzd: v ?? 0 })}
                    />
                  </Field>
                  <Field label="Date paid">
                    <input
                      type="date"
                      className={inputClass}
                      value={data.payment.paidDate ?? ""}
                      onChange={(e) => set("payment", { ...data.payment, paidDate: e.target.value || null })}
                    />
                  </Field>
                  <div className="col-span-2">
                    <Field label="Method">
                      <input
                        className={inputClass}
                        list="admin-payment-methods"
                        value={data.payment.method}
                        placeholder="Bank transfer, cash…"
                        onChange={(e) => set("payment", { ...data.payment, method: e.target.value })}
                      />
                      <datalist id="admin-payment-methods">
                        {["Bank transfer", "Cash", "Card", "PayPal", "Other"].map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </Field>
                  </div>
                </div>
              </Card>

              <Card title="Shipping">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {SHIPPING_STATUSES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          set("shipping", {
                            ...data.shipping,
                            status: s.id,
                            sentDate:
                              s.id !== "not-sent" && !data.shipping.sentDate
                                ? todayIso()
                                : data.shipping.sentDate,
                          })
                        }
                        className={`py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          data.shipping.status === s.id
                            ? "border-gold-500/60 text-gold-400 bg-gold-500/10"
                            : "border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Courier">
                      <input
                        className={inputClass}
                        list="admin-couriers"
                        value={data.shipping.courier}
                        onChange={(e) => set("shipping", { ...data.shipping, courier: e.target.value })}
                      />
                      <datalist id="admin-couriers">
                        {["NZ Post", "CourierPost", "Aramex", "NZ Couriers", "Pickup"].map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label="Date sent">
                      <input
                        type="date"
                        className={inputClass}
                        value={data.shipping.sentDate ?? ""}
                        onChange={(e) => set("shipping", { ...data.shipping, sentDate: e.target.value || null })}
                      />
                    </Field>
                    <div className="col-span-2">
                      <Field label="Tracking number">
                        <input
                          className={inputClass}
                          value={data.shipping.tracking}
                          onChange={(e) => set("shipping", { ...data.shipping, tracking: e.target.value })}
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <Card title="Notes">
            <textarea
              className={`${inputClass} min-h-[5rem]`}
              value={data.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Card>
        </div>

        <div className="xl:sticky xl:top-4 space-y-5">
          <Card title="Order summary">
            <StatRow label={`Items (${totals.units} units)`} value={nzd(totals.itemsSubtotal)} />
            {data.discountNzd !== 0 && <StatRow label="Discount" value={nzd(-data.discountNzd)} />}
            <StatRow label="Shipping charged" value={nzd(data.shippingChargedNzd)} />
            <StatRow label="Order total" value={nzd(totals.total)} strong />
            <StatRow label="Paid" value={nzd(data.payment.amountPaidNzd)} />
            <StatRow
              label="Still to pay"
              value={nzd(Math.max(0, totals.balance))}
              tone={totals.balance > 0.004 ? "bad" : "good"}
            />
            <div className="h-3" />
            <StatRow label={completed ? "Cost of stock sold" : "Est. cost of stock"} value={nzd(cogs)} />
            <StatRow label="Shipping cost" value={nzd(data.shippingCostNzd)} />
            <StatRow label="Payment fees" value={nzd(data.paymentFeesNzd)} />
            <StatRow
              label={completed ? "Profit" : "Est. profit"}
              value={nzd(profit)}
              strong
              tone={profit == null ? "muted" : profit >= 0 ? "good" : "bad"}
            />
            <StatRow label="Margin" value={marginPct == null ? "—" : `${marginPct.toFixed(1)}%`} />
          </Card>
          <p className="text-[11px] text-slate-500 leading-relaxed px-1">
            Stock cost uses your oldest batches first — the same way completing the order takes stock out. Once
            completed, the actual cost is recorded and won't change.
          </p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-slate-900/60 rounded-lg px-2.5 py-1.5">
      <div className="text-slate-500">{label}</div>
      <div className={`tabular-nums font-bold ${highlight ? "text-gold-400" : "text-slate-200"}`}>{value}</div>
    </div>
  );
}
