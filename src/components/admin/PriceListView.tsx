import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { ArrowLeft, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import type { SupplierOption } from "../../../shared/library";
import { adminApi, type SupplierProductInput, type SupplierProductRecord } from "../../lib/adminApi";
import { Card, ErrorNote, Field, NumberField, dangerButton, inputClass, primaryButton, secondaryButton } from "./ui";
import LoadingSpinner, { Spinner } from "../LoadingSpinner";

// The supplier's products and prices. Each size with a code can be picked on a peptide order, which stocks
// inventory item "cat:<code>" - so a code stays tied to the same product once it's been ordered.

const blankProduct = (): SupplierProductInput => ({ name: "", note: "", options: [{ code: "", vialSize: "", priceUsd: 0 }] });

export default function PriceListView() {
  const { getToken } = useAuth();
  const [products, setProducts] = useState<SupplierProductRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // null = list; "new" = adding; otherwise the product being edited.
  const [editing, setEditing] = useState<SupplierProductRecord | "new" | null>(null);

  const load = () =>
    adminApi
      .listSupplierCatalog(getToken)
      .then(setProducts)
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (products ?? []).filter(
      (p) => !query || `${p.name} ${p.options.map((o) => `${o.code ?? ""} ${o.vialSize}`).join(" ")}`.toLowerCase().includes(query)
    );
  }, [products, search]);

  if (!products) return error ? <ErrorNote message={error} /> : <LoadingSpinner label="Loading price list..." />;

  if (editing) {
    return (
      <ProductEditor
        record={editing === "new" ? null : editing}
        onBack={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className={`${inputClass} pl-8`} placeholder="Search products or codes" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className={primaryButton} onClick={() => setEditing("new")}>
          <Plus size={13} /> Add product
        </button>
      </div>

      {products.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">
            Your price list is empty. Add your supplier's products with their codes and prices, and they'll be ready to pick
            when you enter a peptide order.
          </p>
        </Card>
      ) : (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl divide-y divide-slate-800/70">
          {shown.map((product) => (
            <button
              key={product.id}
              onClick={() => setEditing(product)}
              className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-900/60 transition cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-sm font-bold text-white">{product.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {product.options
                    .map((o) => `${o.vialSize}${o.code ? ` (${o.code})` : ""} $${o.priceUsd.toLocaleString("en-NZ")}`)
                    .join(" · ")}
                </div>
                {product.note && <div className="text-[11px] text-slate-500 mt-0.5">{product.note}</div>}
              </div>
              <Pencil size={13} className="text-slate-500 flex-shrink-0 mt-1" />
            </button>
          ))}
          {shown.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">Nothing matches "{search}".</div>}
        </div>
      )}
    </div>
  );
}

function ProductEditor({
  record,
  onBack,
  onSaved,
}: {
  record: SupplierProductRecord | null;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { getToken } = useAuth();
  const [form, setForm] = useState<SupplierProductInput>(() =>
    record ? { name: record.name, note: record.note, options: record.options.map((o) => ({ ...o, code: o.code ?? "" })) } : blankProduct()
  );
  const [busy, setBusy] = useState<null | "save" | "delete">(null);
  const [error, setError] = useState<string | null>(null);

  const setOption = (index: number, patch: Partial<SupplierOption>) =>
    setForm((f) => ({ ...f, options: f.options.map((o, i) => (i === index ? { ...o, ...patch } : o)) }));

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      if (record) await adminApi.updateSupplierProduct(record.id, form, getToken);
      else await adminApi.createSupplierProduct(form, getToken);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!record || !window.confirm(`Remove ${record.name} from your price list? Stock you already have isn't affected.`)) return;
    setBusy("delete");
    setError(null);
    try {
      await adminApi.deleteSupplierProduct(record.id, getToken);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-gold-400 hover:text-gold-300 cursor-pointer">
        <ArrowLeft size={13} /> Price list
      </button>
      <Card title={record ? "Edit product" : "Add product"}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name">
            <input className={inputClass} value={form.name} placeholder="e.g. Retatrutide" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Note (optional)">
            <input className={inputClass} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>

        <div className="mt-4 space-y-2">
          <div className="text-[11px] font-bold text-white">Sizes</div>
          <p className="text-[11px] text-slate-500">
            Sizes with a code can be picked on a peptide order. Keep a code the same once you've ordered it - your stock of
            that size is tracked by it.
          </p>
          {form.options.map((option, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
              <Field label={index === 0 ? "Size" : ""}>
                <input className={inputClass} value={option.vialSize} placeholder="10mg" onChange={(e) => setOption(index, { vialSize: e.target.value })} />
              </Field>
              <Field label={index === 0 ? "Code" : ""}>
                <input className={`${inputClass} font-mono`} value={option.code ?? ""} placeholder="RT10" onChange={(e) => setOption(index, { code: e.target.value.toUpperCase() })} />
              </Field>
              <Field label={index === 0 ? "Supplier price" : ""}>
                <NumberField value={option.priceUsd} price onChange={(v) => setOption(index, { priceUsd: v ?? 0 })} />
              </Field>
              <button
                className={`${secondaryButton} px-2.5`}
                aria-label="Remove size"
                disabled={form.options.length === 1}
                onClick={() => setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== index) }))}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            className={secondaryButton}
            onClick={() => setForm((f) => ({ ...f, options: [...f.options, { code: "", vialSize: "", priceUsd: 0 }] }))}
          >
            <Plus size={13} /> Add size
          </button>
        </div>

        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
        <div className="flex items-center justify-between gap-3 mt-4">
          <button className={primaryButton} onClick={save} disabled={busy != null}>
            {busy === "save" ? <Spinner size={13} /> : <Save size={13} />} Save
          </button>
          {record && (
            <button className={dangerButton} onClick={remove} disabled={busy != null}>
              {busy === "delete" ? <Spinner size={13} /> : <Trash2 size={13} />} Remove
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
