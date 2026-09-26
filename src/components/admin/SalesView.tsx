import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { ChevronRight, Plus, RefreshCw } from "lucide-react";
import { emptySale, type SaleInput } from "../../../shared/sales";
import { adminApi, nzd, todayIso, type InventorySummaryRow, type SaleRecord } from "../../lib/adminApi";
import SaleEditor from "./SaleEditor";
import { ErrorNote, primaryButton, secondaryButton } from "./ui";

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
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [saleRows, stock] = await Promise.all([adminApi.listSales(getToken), adminApi.inventory(getToken)]);
      setSales(saleRows);
      setInventory(stock);
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
    const month = todayIso().slice(0, 7);
    const all = sales ?? [];
    const thisMonth = all.filter((s) => s.status === "completed" && s.orderDate.startsWith(month));
    return {
      monthSales: thisMonth.reduce((t, s) => t + s.totals.total, 0),
      monthProfit: thisMonth.reduce((t, s) => t + (s.profit ?? 0), 0),
      owed: all.reduce((t, s) => t + Math.max(0, s.totals.balance), 0),
      toSend: all.filter((s) => s.data.shipping.status === "not-sent").length,
    };
  }, [sales]);

  const filtered = useMemo(
    () =>
      (sales ?? []).filter((s) => {
        if (filter === "open") return s.status === "open";
        if (filter === "unpaid") return s.totals.balance > 0.004;
        if (filter === "to-send") return s.data.shipping.status === "not-sent";
        return true;
      }),
    [sales, filter]
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
        <Tile label="Sales this month" value={nzd(stats.monthSales)} />
        <Tile label="Profit this month" value={nzd(stats.monthProfit)} />
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
      {sales == null && !error && <p className="text-xs text-slate-500">Loading customer orders…</p>}

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
              <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-[6.5rem_minmax(0,1fr)_7rem_7rem_9rem] gap-x-4 gap-y-1 items-center">
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
                <span className="flex flex-wrap gap-1">
                  <Badge tone={sale.status === "completed" ? "good" : "muted"}>
                    {sale.status === "completed" ? "Completed" : "Open"}
                  </Badge>
                  <Badge tone={sale.totals.paymentStatus === "paid" ? "good" : "warn"}>
                    {sale.totals.paymentStatus === "paid" ? "Paid" : sale.totals.paymentStatus === "part-paid" ? "Part paid" : "Unpaid"}
                  </Badge>
                  <Badge tone={sale.data.shipping.status === "not-sent" ? "warn" : "good"}>
                    {{ "not-sent": "Not sent", sent: "Sent", delivered: "Delivered", collected: "Collected" }[sale.data.shipping.status]}
                  </Badge>
                </span>
              </div>
              <ChevronRight size={15} className="text-slate-600 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "good" | "warn" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "good" ? "text-emerald-400 border-emerald-900/60" : tone === "warn" ? "text-amber-400 border-amber-900/60" : "text-slate-400 border-slate-700";
  return <span className={`text-[9px] font-bold uppercase tracking-wide border rounded-full px-1.5 py-0.5 ${cls}`}>{children}</span>;
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
      <div className={`text-lg font-black tabular-nums ${warn ? "text-amber-400" : "text-white"}`}>{value}</div>
    </div>
  );
}
