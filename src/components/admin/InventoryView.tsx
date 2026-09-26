import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, ArrowLeft, RefreshCw, Search } from "lucide-react";
import {
  adminApi,
  nzd,
  todayIso,
  type InventoryDetail,
  type InventorySummaryRow,
} from "../../lib/adminApi";
import { Card, ErrorNote, Field, NumberField, StatRow, inputClass, primaryButton, secondaryButton } from "./ui";

type KindFilter = "all" | "peptide" | "supply";

const ADJUST_REASONS_OUT = ["Stocktake correction", "Damaged / broken", "Sample / giveaway", "Personal use", "Expired", "Other"];
const ADJUST_REASONS_IN = ["Stocktake correction", "Found stock", "Returned by customer", "Opening stock", "Other"];

function isLowStock(row: InventorySummaryRow) {
  return row.item.reorderLevel != null && row.onHand <= row.item.reorderLevel;
}

export default function InventoryView() {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<InventorySummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await adminApi.inventory(getToken));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      if (kind !== "all" && row.item.kind !== kind) return false;
      if (hideEmpty && row.onHand === 0) return false;
      if (!q) return true;
      return `${row.item.name} ${row.item.variant} ${row.item.catalogCode ?? ""}`.toLowerCase().includes(q);
    });
  }, [rows, query, kind, hideEmpty]);

  const totals = useMemo(() => {
    const all = rows ?? [];
    return {
      value: all.reduce((t, r) => t + r.valueNzd, 0),
      peptideValue: all.filter((r) => r.item.kind === "peptide").reduce((t, r) => t + r.valueNzd, 0),
      supplyValue: all.filter((r) => r.item.kind === "supply").reduce((t, r) => t + r.valueNzd, 0),
      low: all.filter(isLowStock).length,
    };
  }, [rows]);

  if (selectedId) {
    return (
      <ItemDetail
        itemId={selectedId}
        onBack={() => {
          setSelectedId(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Stock value (at cost)" value={nzd(totals.value)} />
        <Tile label="Peptides" value={nzd(totals.peptideValue)} />
        <Tile label="Supplies" value={nzd(totals.supplyValue)} />
        <Tile label="Low on stock" value={String(totals.low)} warn={totals.low > 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className={`${inputClass} pl-8`}
            placeholder="Search items…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {(["all", "peptide", "supply"] as KindFilter[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
              kind === k ? "border-gold-500/60 text-gold-400 bg-gold-500/10" : "border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {k === "all" ? "All" : k === "peptide" ? "Peptides" : "Supplies"}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer ml-1">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
          Hide out of stock
        </label>
        <button className={`${secondaryButton} ml-auto`} onClick={() => void load()} aria-label="Refresh">
          <RefreshCw size={13} />
        </button>
      </div>

      <ErrorNote message={error} />
      {rows == null && !error && <p className="text-xs text-slate-500">Loading inventory…</p>}

      {rows && filtered.length === 0 && (
        <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl">
          <p className="text-sm text-slate-400">
            {rows.length === 0 ? "Nothing in inventory yet." : "No items match."}
          </p>
          {rows.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">Stock appears here when you mark a supply order as received.</p>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="border border-slate-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-xs min-w-[40rem]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900/60">
                <th className="px-4 py-2.5 font-bold">Item</th>
                <th className="px-3 py-2.5 font-bold text-right">On hand</th>
                <th className="px-3 py-2.5 font-bold text-right" title="Cost of the next unit sold (oldest batch)">
                  Next unit cost
                </th>
                <th className="px-3 py-2.5 font-bold text-right">Avg cost</th>
                <th className="px-3 py-2.5 font-bold text-right">Value</th>
                <th className="px-4 py-2.5 font-bold">Next expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((row) => (
                <tr
                  key={row.item.id}
                  onClick={() => setSelectedId(row.item.id)}
                  className="bg-slate-900/20 hover:bg-slate-900/70 cursor-pointer transition"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-bold text-slate-100">
                      {row.item.name} <span className="text-slate-400 font-semibold">{row.item.variant}</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {row.item.kind === "peptide" ? "Peptide" : "Supply"}
                      {row.item.catalogCode ? ` · ${row.item.catalogCode}` : ""}
                      {row.openLots > 1 ? ` · ${row.openLots} batches` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className={`font-black ${isLowStock(row) ? "text-amber-400" : "text-white"}`}>{row.onHand}</span>{" "}
                    <span className="text-slate-500">{row.item.unit}s</span>
                    {isLowStock(row) && <div className="text-[10px] text-amber-400">Low stock</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gold-400 font-bold">{nzd(row.nextCostNzd, 3)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{nzd(row.averageCostNzd, 3)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-200 font-semibold">{nzd(row.valueNzd)}</td>
                  <td className="px-4 py-2.5 text-slate-400 tabular-nums">
                    {row.nextExpiry ? new Date(`${row.nextExpiry}T00:00:00`).toLocaleDateString("en-NZ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
      <div className={`text-lg font-black tabular-nums ${warn ? "text-amber-400" : "text-white"}`}>{value}</div>
    </div>
  );
}

function ItemDetail({ itemId, onBack }: { itemId: string; onBack: () => void }) {
  const { getToken } = useAuth();
  const [detail, setDetail] = useState<InventoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [qty, setQty] = useState<number | null>(null);
  const [reason, setReason] = useState(ADJUST_REASONS_OUT[0]);
  const [note, setNote] = useState("");
  const [unitCost, setUnitCost] = useState<number | null>(null);
  const [date, setDate] = useState(todayIso());
  const [reorderLevel, setReorderLevel] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await adminApi.inventoryItem(itemId, getToken);
      setDetail(d);
      setReorderLevel(d.item.reorderLevel);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [itemId, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const onHand = detail?.lots.reduce((t, l) => t + l.qtyRemaining, 0) ?? 0;
  const value = detail?.lots.reduce((t, l) => t + l.qtyRemaining * l.unitCostNzd, 0) ?? 0;

  const submitAdjust = async () => {
    if (!qty || qty <= 0) {
      setError("Enter how many units to adjust.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminApi.adjust(
        {
          itemId,
          qty: direction === "out" ? -qty : qty,
          reason,
          note,
          unitCostNzd: direction === "in" ? unitCost : null,
          date,
        },
        getToken
      );
      setQty(null);
      setNote("");
      setUnitCost(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveReorderLevel = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.updateItem(itemId, { reorderLevel }, getToken);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const item = detail?.item;
  const reasons = direction === "out" ? ADJUST_REASONS_OUT : ADJUST_REASONS_IN;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className={secondaryButton} aria-label="Back to inventory">
          <ArrowLeft size={14} />
        </button>
        <div>
          <h3 className="text-base font-black text-white">
            {item ? `${item.name} ${item.variant}` : "Loading…"}
          </h3>
          {item && (
            <p className="text-[11px] text-slate-500">
              {item.kind === "peptide" ? "Peptide" : "Supply"}
              {item.catalogCode ? ` · ${item.catalogCode}` : ""} · counted in {item.unit}s
            </p>
          )}
        </div>
      </div>

      <ErrorNote message={error} />

      {detail && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-5 items-start">
          <div className="space-y-5 min-w-0">
            <Card title="Batches (used oldest first)">
              {detail.lots.length === 0 ? (
                <p className="text-xs text-slate-500">No stock has been received for this item yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[32rem]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                        <th className="py-1.5 pr-3 font-bold">Received</th>
                        <th className="py-1.5 pr-3 font-bold">Source</th>
                        <th className="py-1.5 pr-3 font-bold">Lot / expiry</th>
                        <th className="py-1.5 pr-3 font-bold text-right">Remaining</th>
                        <th className="py-1.5 font-bold text-right">Cost / {item?.unit}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {detail.lots.map((lot) => (
                        <tr key={lot.id} className={lot.qtyRemaining === 0 ? "opacity-40" : ""}>
                          <td className="py-2 pr-3 tabular-nums text-slate-300">
                            {new Date(lot.receivedAt).toLocaleDateString("en-NZ")}
                          </td>
                          <td className="py-2 pr-3 text-slate-400">{lot.orderId ? "Supply order" : "Adjustment"}</td>
                          <td className="py-2 pr-3 text-slate-400">
                            {lot.lotNumber || "—"}
                            {lot.expiryDate && (
                              <span className="block text-[10px] text-slate-500">
                                exp {new Date(`${lot.expiryDate}T00:00:00`).toLocaleDateString("en-NZ")}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-slate-100 font-bold">
                            {lot.qtyRemaining} <span className="text-slate-500 font-normal">/ {lot.qtyReceived}</span>
                          </td>
                          <td className="py-2 text-right tabular-nums text-gold-400 font-bold">{nzd(lot.unitCostNzd, 3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="History">
              {detail.movements.length === 0 ? (
                <p className="text-xs text-slate-500">No stock movements yet.</p>
              ) : (
                <div className="divide-y divide-slate-800/70">
                  {detail.movements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="text-slate-200 font-semibold">
                          {m.type === "receive" ? "Received" : m.type === "sale" ? "Sold" : "Adjusted"}
                          {m.reason ? <span className="text-slate-400 font-normal"> — {m.reason}</span> : null}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(m.occurredAt).toLocaleDateString("en-NZ")}
                          {m.note ? ` · ${m.note}` : ""}
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className={`font-black ${m.qty > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {m.qty > 0 ? `+${m.qty}` : m.qty}
                        </div>
                        <div className="text-[10px] text-slate-500">@ {nzd(m.unitCostNzd, 3)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-5">
            <Card title="Stock">
              <StatRow label="On hand" value={`${onHand} ${item?.unit}s`} strong />
              <StatRow label="Value at cost" value={nzd(value)} />
              <StatRow label="Average cost" value={nzd(onHand > 0 ? value / onHand : null, 3)} />
              <div className="flex items-end gap-2 mt-3">
                <div className="flex-1">
                  <Field label="Warn me when stock is at or below">
                    <NumberField integer value={reorderLevel} onChange={setReorderLevel} placeholder="Off" />
                  </Field>
                </div>
                <button
                  className={secondaryButton}
                  onClick={saveReorderLevel}
                  disabled={busy || reorderLevel === detail.item.reorderLevel}
                >
                  Save
                </button>
              </div>
            </Card>

            <Card title="Adjust stock">
              <div className="space-y-3">
                <div className="flex gap-2">
                  {(["out", "in"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        setDirection(d);
                        setReason((d === "out" ? ADJUST_REASONS_OUT : ADJUST_REASONS_IN)[0]);
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        direction === d
                          ? "border-gold-500/60 text-gold-400 bg-gold-500/10"
                          : "border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {d === "out" ? "Remove stock" : "Add stock"}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Quantity (${item?.unit}s)`}>
                    <NumberField integer value={qty} onChange={setQty} />
                  </Field>
                  <Field label="Date">
                    <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
                  </Field>
                </div>
                <Field label="Reason">
                  <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                    {reasons.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                {direction === "in" && (
                  <Field label="Cost per unit (NZD)" hint="Leave blank to use the most recent batch cost.">
                    <NumberField value={unitCost} onChange={setUnitCost} />
                  </Field>
                )}
                <Field label="Note">
                  <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                {direction === "out" && (
                  <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                    Removed from the oldest batch first.
                  </p>
                )}
                <button className={primaryButton} onClick={submitAdjust} disabled={busy}>
                  {direction === "out" ? "Remove from stock" : "Add to stock"}
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
