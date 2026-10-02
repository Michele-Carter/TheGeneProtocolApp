import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { ChevronRight, Plus, RefreshCw, Search, X } from "lucide-react";
import { emptySale, type SaleInput } from "../../../shared/sales";
import { adminApi, nzd, todayIso, type BundleRecord, type InventorySummaryRow, type SaleRecord } from "../../lib/adminApi";
import SaleEditor from "./SaleEditor";
import { ErrorNote, formatMonth, inputClass, MonthFilter, primaryButton, secondaryButton, StatusDot } from "./ui";
import LoadingSpinner from "../LoadingSpinner";

type Filter = "all" | "open" | "unpaid" | "to-send";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Not completed" },
  { id: "unpaid", label: "Owing money" },
  { id: "to-send", label: "To send" },
];

type Editing = { record: SaleRecord | null; data: SaleInput } | null;

export default function SalesView() {
  const { getToken } = useAuth();
  const [sales, setSales] = useState<SaleRecord[] | null>(null);
  const [inventory, setInventory] = useState<InventorySummaryRow[]>([]);
  const [bundles, setBundles] = useState<BundleRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [month, setMonth] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [saleRows, stock, bundleRows] = await Promise.all([
        adminApi.listSales(getToken),
        adminApi.inventory(getToken),
        adminApi.listBundles(getToken),
      ]);
      setSales(saleRows);
      setInventory(stock);
      setBundles(bundleRows);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const customers = useMemo(
    () => Array.from(new Set((sales ?? []).map((s) => s.customerName).filter(Boolean))).sort(),
    [sales]
  );

  // Most recent price charged per item — the default for items that aren't on the price list.
  const lastPrices = useMemo(() => {
    const prices: Record<string, number> = {};
    for (const sale of [...(sales ?? [])].sort((a, b) => a.orderDate.localeCompare(b.orderDate))) {
      for (const line of sale.data.lines) prices[line.itemId] = line.unitPriceNzd;
    }
    return prices;
  }, [sales]);

  const stats = useMemo(() => {
    const all = sales ?? [];
    const inMonth = month == null ? all : all.filter((s) => s.orderDate.startsWith(month));
    const completed = inMonth.filter((s) => s.status === "completed");
    return {
      periodSales: completed.reduce((t, s) => t + s.totals.total, 0),
      periodProfit: completed.reduce((t, s) => t + (s.profit ?? 0), 0),
      owed: all.reduce((t, s) => t + Math.max(0, s.totals.balance), 0),
      toSend: all.filter((s) => s.data.shipping.status === "not-sent").length,
    };
  }, [sales, month]);

  const periodLabel = month == null ? "all time" : formatMonth(month);

  const searchQuery = search.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      (sales ?? []).filter((s) => {
        if (month != null && !s.orderDate.startsWith(month)) return false;
        if (filter === "open" && s.status !== "open") return false;
        if (filter === "unpaid" && !(s.totals.balance > 0.004)) return false;
        if (filter === "to-send" && s.data.shipping.status !== "not-sent") return false;
        if (searchQuery) {
          const haystack = [
            s.customerName,
            s.data.customerContact,
            s.data.orderNumber,
            s.data.notes,
            s.data.shipping.tracking,
            s.data.shipping.courier,
            s.data.payment.method,
            nzd(s.totals.total),
            ...s.data.lines.flatMap((l) => [l.name, l.variant]),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(searchQuery)) return false;
        }
        return true;
      }),
    [sales, filter, month, searchQuery]
  );

  const refreshAfterChange = () => {
    void Promise.all([adminApi.listSales(getToken), adminApi.inventory(getToken)])
      .then(([saleRows, stock]) => {
        setSales(saleRows);
        setInventory(stock);
      })
      .catch(() => undefined);
  };

  if (editing) {
    return (
      <SaleEditor
        key={editing.record?.id ?? "new"}
        record={editing.record}
        initialData={editing.data}
        inventory={inventory}
        bundles={bundles}
        customers={customers}
        lastPrices={lastPrices}
        onBack={() => {
          setEditing(null);
          void load();
        }}
        onChanged={refreshAfterChange}
        onDeleted={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label={`Sales — ${periodLabel}`} value={nzd(stats.periodSales)} />
        <Tile label={`Profit — ${periodLabel}`} value={nzd(stats.periodProfit)} />
        <Tile label="Owed to you" value={nzd(stats.owed)} warn={stats.owed > 0.004} />
        <Tile label="Waiting to send" value={String(stats.toSend)} warn={stats.toSend > 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
              filter === f.id ? "border-gold-500/60 text-gold-400 bg-gold-500/10" : "border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
        <MonthFilter value={month} onChange={setMonth} />
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, peptide, amount…"
            className={`${inputClass} pl-8 pr-7`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <button className={secondaryButton} onClick={() => void load()} aria-label="Refresh">
            <RefreshCw size={13} />
          </button>
          <button className={primaryButton} onClick={() => setEditing({ record: null, data: emptySale(todayIso()) })}>
            <Plus size={13} /> New customer order
          </button>
        </div>
      </div>

      <ErrorNote message={error} />
      {sales == null && !error && <LoadingSpinner label="Loading customer orders..." />}

      {sales && filtered.length === 0 && (
        <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl">
          <p className="text-sm text-slate-400">{sales.length === 0 ? "No customer orders yet." : "No orders match."}</p>
          {sales.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">Add one when a customer orders — stock comes out when you complete it.</p>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80">
          {filtered.map((sale) => (
            <button
              key={sale.id}
              onClick={() => setEditing({ record: sale, data: sale.data })}
              className="w-full text-left px-4 py-3 bg-slate-900/30 hover:bg-slate-900/70 transition cursor-pointer flex items-center gap-3"
            >
              <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-[6.5rem_minmax(0,1fr)_6rem_5.5rem_6rem_6.5rem_7rem] gap-x-4 gap-y-1 items-center">
                <span className="text-xs text-slate-400 tabular-nums">
                  {new Date(`${sale.orderDate}T00:00:00`).toLocaleDateString("en-NZ")}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white truncate">{sale.customerName}</span>
                  <span className="block text-[10px] text-slate-500 truncate">
                    {sale.totals.units} units
                    {sale.data.orderNumber ? ` · #${sale.data.orderNumber}` : ""}
                  </span>
                </span>
                <span className="text-xs tabular-nums text-slate-200 font-semibold">{nzd(sale.totals.total)}</span>
                <span className="text-xs tabular-nums">
                  {sale.profit != null ? (
                    <span className={sale.profit >= 0 ? "text-emerald-400" : "text-red-400"}>{nzd(sale.profit)}</span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                  <span className="block text-[10px] text-slate-500">profit</span>
                </span>
                <StatusDot tone={sale.status === "completed" ? "good" : "muted"}>
                  {sale.status === "completed" ? "Completed" : "Open"}
                </StatusDot>
                <StatusDot tone={sale.totals.paymentStatus === "paid" ? "good" : "warn"}>
                  {sale.totals.paymentStatus === "paid" ? "Paid" : sale.totals.paymentStatus === "part-paid" ? "Part paid" : "Unpaid"}
                </StatusDot>
                <StatusDot tone={sale.data.shipping.status === "not-sent" ? "warn" : "good"}>
                  {{ "not-sent": "Not sent", sent: "Sent", delivered: "Delivered", collected: "Collected" }[sale.data.shipping.status]}
                </StatusDot>
              </div>
              <ChevronRight size={15} className="text-slate-600 flex-shrink-0" />
            </button>
          ))}
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
