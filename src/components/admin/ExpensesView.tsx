import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { EXPENSE_CATEGORIES } from "../../../shared/sales";
import { detailFromLegacy, expenseTotals, type ExpenseDetail, type ExpenseItem } from "../../../shared/expenses";
import { adminApi, nzd, todayIso, type ExpenseCategory, type ExpenseInput, type ExpenseRecord } from "../../lib/adminApi";
import { Card, ErrorNote, Field, NumberField, dangerButton, inputClass, newId, primaryButton, secondaryButton } from "./ui";

const blankItem = (): ExpenseItem => ({ id: newId(), name: "", qty: 1, unitCostNzd: 0 });

const blankExpense = (): ExpenseInput => ({
  expenseDate: todayIso(),
  supplier: "",
  category: "Equipment",
  orderNumber: "",
  notes: "",
  detail: { items: [blankItem()], shippingNzd: 0, taxNzd: 0, discountNzd: 0 },
});

export default function ExpensesView() {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<ExpenseRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // fromOrder: expenses created from a supply order are shown read-only (they're changed via the order).
  const [form, setForm] = useState<{ id: string | null; fromOrder?: boolean; data: ExpenseInput } | null>(null);
  const [year, setYear] = useState(todayIso().slice(0, 4));
  const [category, setCategory] = useState<ExpenseCategory | "all">("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await adminApi.listExpenses(getToken));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const years = useMemo(() => {
    const set = new Set((rows ?? []).map((r) => r.expenseDate.slice(0, 4)));
    set.add(todayIso().slice(0, 4));
    return Array.from(set).sort().reverse();
  }, [rows]);


  const inYear = useMemo(() => (rows ?? []).filter((r) => r.expenseDate.startsWith(year)), [rows, year]);
  const visible = useMemo(
    () => (category === "all" ? inYear : inYear.filter((r) => r.category === category)),
    [inYear, category]
  );

  const totals = useMemo(() => {
    const month = todayIso().slice(0, 7);
    const byCategory = EXPENSE_CATEGORIES.map((c) => ({
      category: c,
      total: inYear.filter((r) => r.category === c).reduce((t, r) => t + r.amountNzd, 0),
    })).filter((c) => c.total !== 0);
    return {
      month: (rows ?? []).filter((r) => r.expenseDate.startsWith(month)).reduce((t, r) => t + r.amountNzd, 0),
      year: inYear.reduce((t, r) => t + r.amountNzd, 0),
      byCategory,
    };
  }, [rows, inYear]);

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

  const save = () => {
    if (!form) return;
    // Ignore completely empty item rows; every other row needs a name.
    const items = form.data.detail.items.filter((i) => i.name.trim() || i.unitCostNzd);
    if (items.length === 0) {
      setError("Add at least one item.");
      return;
    }
    if (items.some((i) => !i.name.trim())) {
      setError("Every item needs a name.");
      return;
    }
    if (items.some((i) => !(i.qty >= 1))) {
      setError("Every item needs a quantity of at least 1.");
      return;
    }
    const data = { ...form.data, detail: { ...form.data.detail, items } };
    run(async () => {
      if (form.id) await adminApi.updateExpense(form.id, data, getToken);
      else await adminApi.createExpense(data, getToken);
      setForm(null);
      await load();
    });
  };

  const remove = () => {
    if (!form?.id || !window.confirm("Delete this expense?")) return;
    const id = form.id;
    run(async () => {
      await adminApi.deleteExpense(id, getToken);
      setForm(null);
      await load();
    });
  };

  const setField = <K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) =>
    setForm((f) => (f ? { ...f, data: { ...f.data, [key]: value } } : f));
  const setDetail = (patch: Partial<ExpenseDetail>) =>
    setForm((f) => (f ? { ...f, data: { ...f.data, detail: { ...f.data.detail, ...patch } } } : f));
  const updateItem = (itemId: string, patch: Partial<ExpenseItem>) =>
    setForm((f) =>
      f
        ? {
            ...f,
            data: {
              ...f.data,
              detail: { ...f.data.detail, items: f.data.detail.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) },
            },
          }
        : f
    );
  const formTotals = form ? expenseTotals(form.data.detail) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Tile label="This month" value={nzd(totals.month)} />
        <Tile label={`${year} total`} value={nzd(totals.year)} />
        <div className="col-span-2 lg:col-span-1 bg-slate-900/40 border border-slate-800 rounded-2xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">{year} by category</div>
          {totals.byCategory.length === 0 ? (
            <div className="text-xs text-slate-500">Nothing yet</div>
          ) : (
            totals.byCategory.map((c) => (
              <div key={c.category} className="flex justify-between text-xs py-0.5">
                <span className="text-slate-400">{c.category}</span>
                <span className="tabular-nums text-slate-200 font-semibold">{nzd(c.total)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {form && (
        <Card
          title={form.fromOrder ? "Expense from a supply order" : form.id ? "Edit expense" : "New expense"}
          actions={
            <div className="flex items-center gap-2">
              {!form.fromOrder && (
                <button className={primaryButton} onClick={save} disabled={busy}>
                  <Save size={13} /> Save expense
                </button>
              )}
              <button className="p-1.5 text-slate-500 hover:text-white cursor-pointer" onClick={() => setForm(null)} aria-label="Close">
                <X size={14} />
              </button>
            </div>
          }
        >
          {form.fromOrder && (
            <p className="text-xs text-sky-300/90 bg-sky-950/30 border border-sky-900/50 rounded-lg px-3 py-2 mb-4">
              This was added automatically from the expense items on a supply order from {form.data.supplier || "a supplier"}
              {form.data.orderNumber ? ` (#${form.data.orderNumber})` : ""}, including their share of its shipping, tax and
              fees. To change it, open the order in Supply Orders, undo "received", edit it and receive it again.
            </p>
          )}
          <fieldset disabled={form.fromOrder} className="contents">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Date">
              <input
                type="date"
                className={inputClass}
                value={form.data.expenseDate}
                onChange={(e) => setField("expenseDate", e.target.value)}
              />
            </Field>
            <Field label="Supplier (optional)">
              <input
                className={inputClass}
                value={form.data.supplier}
                onChange={(e) => setField("supplier", e.target.value)}
              />
            </Field>
            <Field label="Category">
              <select
                className={inputClass}
                value={form.data.category}
                onChange={(e) => setField("category", e.target.value as ExpenseCategory)}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Order number (optional)">
              <input
                className={inputClass}
                value={form.data.orderNumber}
                onChange={(e) => setField("orderNumber", e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-5 space-y-2">
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_5rem_8rem_7rem_2rem] gap-2 text-[11px] font-bold text-slate-400">
              <span>Item</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Cost each (NZD)</span>
              <span className="text-right">Total</span>
              <span />
            </div>
            {form.data.detail.items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_2rem] sm:grid-cols-[minmax(0,1fr)_5rem_8rem_7rem_2rem] gap-2 items-center"
              >
                <input
                  className={inputClass}
                  placeholder="e.g. V3 Injection Pen"
                  value={item.name}
                  onChange={(e) => updateItem(item.id, { name: e.target.value })}
                />
                <button
                  type="button"
                  className="sm:order-last flex-shrink-0 p-1.5 text-slate-500 hover:text-red-400 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Remove item"
                  disabled={form.data.detail.items.length === 1}
                  onClick={() => setDetail({ items: form.data.detail.items.filter((i) => i.id !== item.id) })}
                >
                  <X size={14} />
                </button>
                <div className="col-span-2 sm:col-span-1 grid grid-cols-3 sm:contents gap-2">
                  <NumberField integer ariaLabel="Quantity" value={item.qty} onChange={(v) => updateItem(item.id, { qty: v ?? 0 })} />
                  <NumberField
                    ariaLabel="Cost each"
                    placeholder="0.00"
                    value={item.unitCostNzd || null}
                    onChange={(v) => updateItem(item.id, { unitCostNzd: v ?? 0 })}
                  />
                  <span className="text-sm tabular-nums text-slate-300 text-right self-center">
                    {nzd(item.qty * item.unitCostNzd)}
                  </span>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-gold-400 transition cursor-pointer"
              onClick={() => setDetail({ items: [...form.data.detail.items, blankItem()] })}
            >
              <Plus size={12} /> Add another item
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.2fr)] gap-3 items-end">
            <Field label="Shipping">
              <NumberField placeholder="0.00" value={form.data.detail.shippingNzd || null} onChange={(v) => setDetail({ shippingNzd: v ?? 0 })} />
            </Field>
            <Field label="Tax / GST">
              <NumberField placeholder="0.00" value={form.data.detail.taxNzd || null} onChange={(v) => setDetail({ taxNzd: v ?? 0 })} />
            </Field>
            <Field label="Coupons & discounts">
              <NumberField placeholder="0.00" value={form.data.detail.discountNzd || null} onChange={(v) => setDetail({ discountNzd: v ?? 0 })} />
            </Field>
            <div className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-bold text-slate-400">Total paid</span>
              <span className="text-base font-black tabular-nums text-gold-400">{nzd(formTotals?.total)}</span>
            </div>
          </div>

          <div className="mt-4">
            <Field label="Notes (optional)">
              <input className={inputClass} value={form.data.notes} onChange={(e) => setField("notes", e.target.value)} />
            </Field>
          </div>
          </fieldset>
          {error && (
            <div className="mt-4">
              <ErrorNote message={error} />
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            {!form.fromOrder && (
              <button className={primaryButton} onClick={save} disabled={busy}>
                <Save size={13} /> {busy ? "Saving…" : "Save expense"}
              </button>
            )}
            <button className={secondaryButton} onClick={() => setForm(null)} disabled={busy}>
              {form.fromOrder ? "Close" : "Cancel"}
            </button>
            {form.id && !form.fromOrder && (
              <button className={`${dangerButton} ml-auto`} onClick={remove} disabled={busy}>
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select className={`${inputClass} w-auto`} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          className={`${inputClass} w-auto`}
          value={category}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory | "all")}
          aria-label="Category"
        >
          <option value="all">All categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button className={secondaryButton} onClick={() => void load()} aria-label="Refresh">
            <RefreshCw size={13} />
          </button>
          {!form && (
            <button
              className={primaryButton}
              onClick={() => {
                setError(null);
                setForm({ id: null, data: blankExpense() });
              }}
            >
              <Plus size={13} /> Add expense
            </button>
          )}
        </div>
      </div>

      {!form && <ErrorNote message={error} />}
      {rows == null && !error && <p className="text-xs text-slate-500">Loading expenses…</p>}

      {rows && visible.length === 0 && (
        <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl">
          <p className="text-sm text-slate-400">No expenses for {year}{category !== "all" ? ` in ${category}` : ""}.</p>
          <p className="text-xs text-slate-500 mt-1">
            For things you buy to run the business but don't sell — equipment, packaging, postage, software.
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <div className="border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80">
          {visible.map((row) => (
            <button
              key={row.id}
              onClick={() => {
                setError(null);
                setForm({
                  id: row.id,
                  fromOrder: Boolean(row.sourceOrderId),
                  data: {
                    expenseDate: row.expenseDate,
                    supplier: row.supplier,
                    category: row.category,
                    orderNumber: row.orderNumber,
                    notes: row.notes,
                    detail: row.detail ?? detailFromLegacy(row.description, row.amountNzd, newId()),
                  },
                });
              }}
              className="w-full text-left px-4 py-3 bg-slate-900/30 hover:bg-slate-900/70 transition cursor-pointer grid grid-cols-2 sm:grid-cols-[6.5rem_minmax(0,1fr)_9rem_7rem] gap-x-4 gap-y-1 items-center"
            >
              <span className="text-xs text-slate-400 tabular-nums">
                {new Date(`${row.expenseDate}T00:00:00`).toLocaleDateString("en-NZ")}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white truncate">{row.description}</span>
                <span className="block text-[10px] text-slate-500 truncate">
                  {[row.supplier, row.orderNumber && `#${row.orderNumber}`, row.sourceOrderId && "from supply order"]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="text-xs text-slate-400">{row.category}</span>
              <span className="text-sm tabular-nums font-bold text-slate-100 sm:text-right">{nzd(row.amountNzd)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
      <div className="text-lg font-black tabular-nums text-white">{value}</div>
    </div>
  );
}
