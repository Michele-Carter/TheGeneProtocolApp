import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { ArrowLeft, ChevronRight, Merge, Plus, RefreshCw, Save, Search, Trash2, UserCheck, X } from "lucide-react";
import { addressLines, emptyAddress } from "../../../shared/customers";
import { adminApi, nzd, type CustomerDetail, type CustomerInput, type CustomerSummary } from "../../lib/adminApi";
import AddressFields from "../AddressFields";
import { Card, ErrorNote, Field, StatRow, StatusDot, dangerButton, inputClass, primaryButton, secondaryButton } from "./ui";
import LoadingSpinner, { Spinner } from "../LoadingSpinner";

type Selected = { id: string } | { id: null } | null;

const formatDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-NZ") : "—");

export default function CustomersView({ onOpenSale }: { onOpenSale: (saleId: string) => void }) {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<CustomerSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selected>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await adminApi.listCustomers(getToken));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (rows ?? []).filter((c) =>
        !q ? true : [c.name, c.email, ...addressLines(c.shippingAddress), c.notes].join(" ").toLowerCase().includes(q)
      ),
    [rows, q]
  );

  const totals = useMemo(() => {
    const all = rows ?? [];
    return {
      count: all.length,
      withLogin: all.filter((c) => c.hasLogin).length,
      openOrders: all.reduce((t, c) => t + c.stats.openOrders, 0),
      owed: all.reduce((t, c) => t + c.stats.owedNzd, 0),
    };
  }, [rows]);

  if (selected) {
    return (
      <CustomerPage
        key={selected.id ?? "new"}
        id={selected.id}
        others={(rows ?? []).filter((c) => c.id !== selected.id)}
        onOpenSale={onOpenSale}
        onBack={() => {
          setSelected(null);
          void load();
        }}
        onSwitch={(id) => {
          setSelected({ id });
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Customers" value={String(totals.count)} />
        <Tile label="With an app login" value={String(totals.withLogin)} />
        <Tile label="Open orders" value={String(totals.openOrders)} />
        <Tile label="Owed to you" value={nzd(totals.owed)} warn={totals.owed > 0.004} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem] max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            className={`${inputClass} pl-8 pr-7`}
            placeholder="Search name, email, address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
          <button className={primaryButton} onClick={() => setSelected({ id: null })}>
            <Plus size={13} /> New customer
          </button>
        </div>
      </div>

      <ErrorNote message={error} />
      {rows == null && !error && <LoadingSpinner label="Loading customers..." />}

      {rows && filtered.length === 0 && (
        <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl">
          <p className="text-sm text-slate-400">{rows.length === 0 ? "No customers yet." : "No customers match."}</p>
          {rows.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">Everyone registered for the app appears here, plus anyone you record an order for.</p>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="border border-slate-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-xs min-w-[44rem]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-white bg-slate-900/60">
                <th className="px-4 py-2.5 font-bold">Customer</th>
                <th className="px-3 py-2.5 font-bold">Town / city</th>
                <th className="px-3 py-2.5 font-bold text-right">Orders</th>
                <th className="px-3 py-2.5 font-bold text-right">Spent</th>
                <th className="px-3 py-2.5 font-bold text-right">Profit</th>
                <th className="px-3 py-2.5 font-bold">Last order</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelected({ id: c.id })}
                  className="bg-slate-900/20 hover:bg-slate-900/70 cursor-pointer transition"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-100">
                      {c.name}
                      {c.hasLogin && <UserCheck size={12} className="text-emerald-400" aria-label="Has an app login" />}
                    </div>
                    <div className="text-[10px] text-slate-500">{c.email || "No email"}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{c.shippingAddress.city || "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="text-slate-200 font-semibold">{c.stats.orders}</span>
                    {c.stats.openOrders > 0 && <div className="text-[10px] text-amber-400">{c.stats.openOrders} open</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-200 font-semibold">{nzd(c.stats.spentNzd)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className={c.stats.profitNzd >= 0 ? "text-emerald-400" : "text-red-400"}>{nzd(c.stats.profitNzd)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 tabular-nums">{formatDate(c.stats.lastOrderDate)}</td>
                  <td className="pr-3 text-slate-600">
                    <ChevronRight size={15} />
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

const blankCustomer = (): CustomerInput => ({ name: "", email: "", shippingAddress: emptyAddress(), notes: "" });

function CustomerPage({
  id,
  others,
  onOpenSale,
  onBack,
  onSwitch,
}: {
  id: string | null;
  others: CustomerSummary[];
  onOpenSale: (saleId: string) => void;
  onBack: () => void;
  onSwitch: (id: string) => void;
}) {
  const { getToken } = useAuth();
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [form, setForm] = useState<CustomerInput>(blankCustomer);
  const [savedJson, setSavedJson] = useState(JSON.stringify(blankCustomer()));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "delete" | "merge">(null);
  const [mergeInto, setMergeInto] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await adminApi.getCustomer(id, getToken);
      const input: CustomerInput = { name: d.name, email: d.email, shippingAddress: d.shippingAddress, notes: d.notes };
      setDetail(d);
      setForm(input);
      setSavedJson(JSON.stringify(input));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = JSON.stringify(form) !== savedJson;

  const run = async (action: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(action);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run("save", async () => {
      if (id) {
        await adminApi.updateCustomer(id, form, getToken);
        await load();
      } else {
        const created = await adminApi.createCustomer(form, getToken);
        onSwitch(created.id);
      }
    });

  const remove = () => {
    if (!id || !window.confirm(`Delete ${form.name}? This can't be undone.`)) return;
    void run("delete", async () => {
      await adminApi.deleteCustomer(id, getToken);
      onBack();
    });
  };

  const merge = () => {
    const target = others.find((c) => c.id === mergeInto);
    if (!id || !target) return;
    const message =
      `Move all of ${form.name}'s orders to ${target.name}, then delete ${form.name}?\n\n` +
      `${target.name}'s details are kept; any email, address or login ${target.name} is missing is taken from ${form.name}.`;
    if (!window.confirm(message)) return;
    void run("merge", async () => {
      await adminApi.mergeCustomer(id, target.id, getToken);
      onSwitch(target.id);
    });
  };

  const set = <K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const hasOrders = (detail?.orders.length ?? 0) > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className={secondaryButton} aria-label="Back to customers">
          <ArrowLeft size={14} />
        </button>
        <div>
          <h3 className="text-base font-black text-white">{id ? detail?.name ?? "Loading…" : "New customer"}</h3>
          {detail && (
            <p className="text-[11px] text-slate-500">
              Customer since {new Date(detail.createdAt).toLocaleDateString("en-NZ")}
            </p>
          )}
        </div>
      </div>

      <ErrorNote message={error} />

      {(id == null || detail) && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-5 items-start">
          <div className="space-y-5 min-w-0">
            <Card title="Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Name">
                  <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} />
                </Field>
                <Field label="Email">
                  <input className={inputClass} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </Field>
              </div>
              <div className="mt-4 space-y-1">
                <span className="block text-[11px] font-bold text-white">Shipping address</span>
                <AddressFields value={form.shippingAddress} onChange={(a) => set("shippingAddress", a)} />
              </div>
              <div className="mt-4">
                <Field label="Notes" hint="Only you see these.">
                  <textarea
                    className={`${inputClass} min-h-[5rem] resize-y`}
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <button className={primaryButton} onClick={save} disabled={busy != null || !dirty}>
                  {busy === "save" ? <Spinner size={13} /> : <Save size={13} />} {id ? "Save changes" : "Add customer"}
                </button>
                {id && !hasOrders && (
                  <button className={`${dangerButton} ml-auto`} onClick={remove} disabled={busy != null}>
                    {busy === "delete" ? <Spinner size={13} /> : <Trash2 size={13} />} Delete
                  </button>
                )}
              </div>
            </Card>

            {detail && (
              <Card title="Orders">
                {detail.orders.length === 0 ? (
                  <p className="text-xs text-slate-500">No orders yet.</p>
                ) : (
                  <div className="divide-y divide-slate-800/70 -my-1">
                    {detail.orders.map((sale) => (
                      <button
                        key={sale.id}
                        onClick={() => onOpenSale(sale.id)}
                        className="w-full text-left py-2.5 flex items-center gap-3 hover:bg-slate-900/50 -mx-2 px-2 rounded-lg transition cursor-pointer"
                      >
                        <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-[5.5rem_minmax(0,1fr)_5.5rem_5.5rem_5.5rem] gap-x-3 gap-y-1 items-center">
                          <span className="text-xs text-slate-400 tabular-nums">{formatDate(sale.orderDate)}</span>
                          <span className="text-xs text-slate-300 truncate">
                            {sale.data.lines.map((l) => `${l.qty}× ${l.name}`).join(", ") || "No items"}
                          </span>
                          <span className="text-xs tabular-nums text-slate-200 font-semibold">{nzd(sale.totals.total)}</span>
                          <StatusDot tone={sale.status === "completed" ? "good" : "muted"}>
                            {sale.status === "completed" ? "Completed" : "Open"}
                          </StatusDot>
                          <StatusDot tone={sale.totals.paymentStatus === "paid" ? "good" : "warn"}>
                            {sale.totals.paymentStatus === "paid" ? "Paid" : sale.totals.paymentStatus === "part-paid" ? "Part paid" : "Unpaid"}
                          </StatusDot>
                        </div>
                        <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          {detail && (
            <div className="space-y-5">
              <Card title="Summary">
                <StatRow label="Orders" value={detail.stats.orders} strong />
                <StatRow label="Open orders" value={detail.stats.openOrders} />
                <StatRow label="Spent (completed)" value={nzd(detail.stats.spentNzd)} />
                <StatRow
                  label="Profit (completed)"
                  value={nzd(detail.stats.profitNzd)}
                  tone={detail.stats.profitNzd >= 0 ? "good" : "bad"}
                />
                <StatRow label="Owed to you" value={nzd(detail.stats.owedNzd)} tone={detail.stats.owedNzd > 0.004 ? "bad" : "muted"} />
                <StatRow label="Last order" value={formatDate(detail.stats.lastOrderDate)} />
              </Card>

              <Card title="App login">
                {detail.hasLogin ? (
                  <p className="flex items-start gap-1.5 text-xs text-emerald-400">
                    <UserCheck size={13} className="flex-shrink-0 mt-0.5" />
                    Linked to their app login. They can update their own email and address from My Account.
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">
                    {detail.email
                      ? `No app login registered with ${detail.email} yet. It links automatically as soon as one is - nothing else to do.`
                      : "Add the email they registered for the app with, and their login is linked when you save."}
                  </p>
                )}
              </Card>

              {others.length > 0 && (
                <Card title="Merge">
                  <p className="text-xs text-slate-400 mb-3">
                    Same person entered twice? Move this customer's orders to the other record and remove this one.
                  </p>
                  <div className="space-y-2">
                    <select className={inputClass} value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
                      <option value="">Merge into…</option>
                      {others.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.email ? ` (${c.email})` : ""}
                        </option>
                      ))}
                    </select>
                    <button className={secondaryButton} onClick={merge} disabled={busy != null || !mergeInto}>
                      {busy === "merge" ? <Spinner size={13} /> : <Merge size={13} />} Merge
                    </button>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {id && !detail && !error && <LoadingSpinner label="Loading customer..." />}
    </div>
  );
}
