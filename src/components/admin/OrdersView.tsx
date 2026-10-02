import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { ChevronRight, Plus, RefreshCw, Search, X } from "lucide-react";
import { emptyOrder, orderTypeOf, type OrderInput, type OrderType } from "../../../shared/landedCost";
import { adminApi, nzd, todayIso, type InvItem, type PurchaseOrderRecord } from "../../lib/adminApi";
import OrderEditor from "./OrderEditor";
import { ErrorNote, inputClass, MonthFilter, primaryButton, secondaryButton } from "./ui";
import LoadingSpinner from "../LoadingSpinner";

// What was ordered, for the list: "Retatrutide 5mg, Ara-290 10mg" or "V3 Injection Pen (Yellow, Purple)".
function itemsSummary(order: OrderInput): string {
  if (orderTypeOf(order) === "peptides") {
    return order.lines.map((line) => [line.name, line.variant].filter(Boolean).join(" ")).join(", ");
  }
  const variantsByName = new Map<string, string[]>();
  for (const line of order.lines) {
    const variants = variantsByName.get(line.name) ?? [];
    if (line.variant) variants.push(line.variant);
    variantsByName.set(line.name, variants);
  }
  return Array.from(variantsByName, ([name, variants]) => (variants.length ? `${name} (${variants.join(", ")})` : name)).join(", ");
}

type Editing ={ record: PurchaseOrderRecord | null; data: OrderInput } | null;

export default function OrdersView({ orderType }: { orderType: OrderType }) {
  const { getToken } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrderRecord[] | null>(null);
  const [items, setItems] = useState<InvItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [orderRows, itemRows] = await Promise.all([adminApi.listOrders(getToken), adminApi.listItems(getToken)]);
      setOrders(orderRows.filter((o) => orderTypeOf(o.data) === orderType));
      setItems(itemRows);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [getToken, orderType]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchQuery = search.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      (orders ?? []).filter((o) => {
        if (month != null && !o.orderDate.startsWith(month)) return false;
        if (searchQuery) {
          const haystack = [
            o.supplier,
            o.data.orderNumber,
            o.data.tracking,
            o.data.notes,
            itemsSummary(o.data),
            nzd(o.summary.totalLandedNzd),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(searchQuery)) return false;
        }
        return true;
      }),
    [orders, month, searchQuery]
  );

  if (editing) {
    return (
      <OrderEditor
        key={editing.record?.id ?? "new"}
        record={editing.record}
        initialData={editing.data}
        items={items}
        onBack={() => {
          setEditing(null);
          void load();
        }}
        onSaved={() => {
          void adminApi.listItems(getToken).then(setItems).catch(() => undefined);
        }}
        onDeleted={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="flex gap-2">
          <button className={secondaryButton} onClick={() => void load()} aria-label="Refresh">
            <RefreshCw size={13} />
          </button>
          <button className={primaryButton} onClick={() => setEditing({ record: null, data: { ...emptyOrder(todayIso()), orderType } })}>
            <Plus size={13} /> {orderType === "peptides" ? "New peptide order" : "New supply order"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MonthFilter value={month} onChange={setMonth} />
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier, item, amount…"
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
      </div>

      <ErrorNote message={error} />

      {orders == null && !error && <LoadingSpinner label="Loading orders..." />}

      {orders && filtered.length === 0 && (
        <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl">
          <p className="text-sm text-slate-400">
            {orders.length === 0 ? `No ${orderType === "peptides" ? "peptide" : "supply"} orders yet.` : "No orders match."}
          </p>
          {orders.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">Add your first one to start tracking costs and stock.</p>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80">
          {filtered.map((order) => (
            <button
              key={order.id}
              onClick={() => setEditing({ record: order, data: order.data })}
              className="w-full text-left px-4 py-3 bg-slate-900/30 hover:bg-slate-900/70 transition cursor-pointer flex items-center gap-3"
            >
              <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-[6.5rem_minmax(0,1fr)_7rem_8rem_7rem] gap-x-4 gap-y-1 items-center">
                <span className="text-xs text-slate-400 tabular-nums">
                  {new Date(`${order.orderDate}T00:00:00`).toLocaleDateString("en-NZ")}
                </span>
                <span className="min-w-0" title={itemsSummary(order.data)}>
                  <span className="block text-sm font-bold text-white truncate">
                    {itemsSummary(order.data) || "No items yet"}
                  </span>
                  <span className="block text-[11px] text-slate-400 truncate">
                    {[order.supplier, order.data.orderNumber && `#${order.data.orderNumber}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="text-xs text-slate-400">
                  {order.summary.totalUnits} units · {order.data.currency}
                </span>
                <span className="text-xs tabular-nums text-slate-200 font-semibold">
                  {nzd(order.summary.totalLandedNzd)}
                  <span className="block text-[10px] text-slate-500 font-normal">
                    avg {nzd(order.summary.averagePerUnitNzd, 3)}/unit
                  </span>
                </span>
                <span>
                  {order.status === "received" ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-400">Received</span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400">On order</span>
                  )}
                  {order.summary.checkStatus === "mismatch" && (
                    <span className="block text-[10px] text-amber-300/80">Check inputs</span>
                  )}
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
