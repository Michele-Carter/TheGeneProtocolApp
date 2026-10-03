import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { ChevronRight, Package, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { emptyBundle, type BundleInput } from "../../../shared/bundles";
import { adminApi, nzd, type BundleRecord, type InventorySummaryRow } from "../../lib/adminApi";
import { Card, ErrorNote, Field, NumberField, dangerButton, inputClass, primaryButton, secondaryButton } from "./ui";
import LoadingSpinner, { Spinner } from "../LoadingSpinner";
import CategoryPicker from "./CategoryPicker";
import ProductImages from "./ProductImages";

type Editing = { id: string | null; data: BundleInput; images: string[] } | null;

export default function BundlesView({ inventory }: { inventory: InventorySummaryRow[] }) {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<BundleRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<null | "save" | "delete">(null);
  const busy = busyAction != null;
  const [editing, setEditing] = useState<Editing>(null);
  const [draftItemId, setDraftItemId] = useState("");
  const [draftQty, setDraftQty] = useState<number | null>(1);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await adminApi.listBundles(getToken));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const itemsById = useMemo(() => Object.fromEntries(inventory.map((row) => [row.item.id, row])), [inventory]);
  const peptides = inventory.filter((row) => row.item.kind === "peptide");
  const supplies = inventory.filter((row) => row.item.kind === "supply");

  const run = async (action: NonNullable<typeof busyAction>, fn: () => Promise<void>) => {
    setBusyAction(action);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyAction(null);
    }
  };

  const startNew = () => {
    setError(null);
    setDraftItemId("");
    setDraftQty(1);
    setEditing({ id: null, data: emptyBundle(), images: [] });
  };

  const startEdit = (row: BundleRecord) => {
    setError(null);
    setDraftItemId("");
    setDraftQty(1);
    setEditing({
      id: row.id,
      data: {
        name: row.name,
        description: row.description,
        components: row.components,
        priceNzd: row.priceNzd,
        shopVisible: row.shopVisible,
        shopCategories: row.shopCategories,
      },
      images: row.images,
    });
  };

  const knownCategories = useMemo(
    () => [...inventory.flatMap((row) => row.item.shopCategories), ...(rows ?? []).flatMap((b) => b.shopCategories)],
    [inventory, rows]
  );

  const addComponent = () => {
    if (!editing || !draftItemId || !(draftQty && draftQty >= 1)) return;
    setEditing((e) => {
      if (!e) return e;
      const existing = e.data.components.find((c) => c.itemId === draftItemId);
      const components = existing
        ? e.data.components.map((c) => (c.itemId === draftItemId ? { ...c, qty: c.qty + draftQty } : c))
        : [...e.data.components, { itemId: draftItemId, qty: draftQty }];
      return { ...e, data: { ...e.data, components } };
    });
    setDraftItemId("");
    setDraftQty(1);
  };

  const removeComponent = (itemId: string) =>
    setEditing((e) => (e ? { ...e, data: { ...e.data, components: e.data.components.filter((c) => c.itemId !== itemId) } } : e));

  // Only one item per bundle can be the customer's choice, so ticking one unticks any other.
  const setCustomerChooses = (itemId: string, on: boolean) =>
    setEditing((e) =>
      e
        ? {
            ...e,
            data: {
              ...e.data,
              components: e.data.components.map((c) => ({ ...c, customerChooses: on && c.itemId === itemId })),
            },
          }
        : e
    );

  const updateComponentQty = (itemId: string, qty: number) =>
    setEditing((e) =>
      e ? { ...e, data: { ...e.data, components: e.data.components.map((c) => (c.itemId === itemId ? { ...c, qty } : c)) } } : e
    );

  const save = () => {
    if (!editing) return;
    if (!editing.data.name.trim()) return setError("Name is required.");
    if (editing.data.components.length === 0) return setError("Add at least one item.");
    if (editing.data.shopVisible && editing.data.priceNzd == null) {
      return setError("Set a package price before showing this bundle in the shop.");
    }
    run("save", async () => {
      if (editing.id) {
        await adminApi.updateBundle(editing.id, editing.data, getToken);
        setEditing(null);
      } else {
        // Stay on a new bundle once it's saved so images can be added straight away.
        const created = await adminApi.createBundle(editing.data, getToken);
        setEditing({ id: created.id, data: editing.data, images: created.images });
      }
      await load();
    });
  };

  const remove = () => {
    if (!editing?.id || !window.confirm("Delete this bundle? Past orders already placed are unaffected.")) return;
    const id = editing.id;
    run("delete", async () => {
      await adminApi.deleteBundle(id, getToken);
      setEditing(null);
      await load();
    });
  };

  if (editing) {
    return (
      <Card
        title={editing.id ? "Edit bundle" : "New bundle"}
        actions={
          <button className="p-1.5 text-slate-500 hover:text-white cursor-pointer" onClick={() => setEditing(null)} aria-label="Close">
            <X size={14} />
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name">
            <input
              className={inputClass}
              placeholder="e.g. Pen Starter Bundle"
              value={editing.data.name}
              onChange={(e) => setEditing((ed) => (ed ? { ...ed, data: { ...ed.data, name: e.target.value } } : ed))}
            />
          </Field>
          <Field label="Package price (NZD)" hint="Leave blank to charge each item's normal price with no bundle discount.">
            <NumberField
              placeholder="0.00"
              value={editing.data.priceNzd}
              onChange={(v) => setEditing((ed) => (ed ? { ...ed, data: { ...ed.data, priceNzd: v } } : ed))}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description (optional)" hint="Also shown on the shop page when the bundle is in the shop.">
              <textarea
                className={`${inputClass} min-h-[4.5rem] resize-y`}
                value={editing.data.description}
                onChange={(e) => setEditing((ed) => (ed ? { ...ed, data: { ...ed.data, description: e.target.value } } : ed))}
              />
            </Field>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <span className="block text-[11px] font-bold text-white">Shop</span>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.data.shopVisible}
                onChange={(e) => setEditing((ed) => (ed ? { ...ed, data: { ...ed.data, shopVisible: e.target.checked } } : ed))}
              />
              Show in shop
            </label>
            <div className="space-y-1">
              <span className="block text-[11px] font-bold text-white">Categories</span>
              <CategoryPicker
                value={editing.data.shopCategories}
                known={knownCategories}
                onChange={(shopCategories) => setEditing((ed) => (ed ? { ...ed, data: { ...ed.data, shopCategories } } : ed))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-white">Images</span>
            {editing.id ? (
              <ProductImages
                target="bundle"
                id={editing.id}
                images={editing.images}
                onChange={(images) => {
                  setEditing((ed) => (ed ? { ...ed, images } : ed));
                  setRows((rs) => rs?.map((r) => (r.id === editing.id ? { ...r, images } : r)) ?? rs);
                }}
              />
            ) : (
              <p className="text-xs text-slate-500">Save the bundle first, then add images.</p>
            )}
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <span className="block text-[11px] font-bold text-white">Items in this bundle</span>
          {editing.data.components.length === 0 && (
            <p className="text-xs text-slate-500">No items yet — add from your inventory below.</p>
          )}
          {editing.data.components.map((c) => {
            const row = itemsById[c.itemId];
            // Other colours / sizes of the same item, which the customer could pick between.
            const variants = row
              ? inventory.filter((r) => r.item.name === row.item.name && r.item.kind === row.item.kind)
              : [];
            return (
              <div key={c.itemId} className="grid grid-cols-[minmax(0,1fr)_5rem_2rem] gap-2 items-center">
                <span className="text-sm text-slate-200 min-w-0">
                  {row ? (
                    <>
                      <span className="block truncate">
                        {row.item.name}{" "}
                        <span className="text-slate-500">{c.customerChooses ? "(customer's choice)" : row.item.variant}</span>
                      </span>
                      {variants.length > 1 && (
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer mt-0.5">
                          <input
                            type="checkbox"
                            checked={Boolean(c.customerChooses)}
                            onChange={(e) => setCustomerChooses(c.itemId, e.target.checked)}
                          />
                          Customer chooses: {variants.map((v) => v.item.variant || "standard").join(", ")}
                        </label>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-500 italic">Unknown item</span>
                  )}
                </span>
                <NumberField integer ariaLabel="Quantity" value={c.qty} onChange={(v) => updateComponentQty(c.itemId, v ?? 1)} />
                <button
                  type="button"
                  className="p-1.5 text-slate-500 hover:text-red-400 transition cursor-pointer"
                  aria-label="Remove item"
                  onClick={() => removeComponent(c.itemId)}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}

          <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto] gap-2 items-center pt-2 border-t border-slate-800/60 mt-3">
            <select className={inputClass} value={draftItemId} onChange={(e) => setDraftItemId(e.target.value)}>
              <option value="">Choose an item…</option>
              {peptides.length > 0 && (
                <optgroup label="Peptides">
                  {peptides.map((row) => (
                    <option key={row.item.id} value={row.item.id}>
                      {row.item.name} {row.item.variant}
                    </option>
                  ))}
                </optgroup>
              )}
              {supplies.length > 0 && (
                <optgroup label="Supplies">
                  {supplies.map((row) => (
                    <option key={row.item.id} value={row.item.id}>
                      {row.item.name} {row.item.variant}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <NumberField integer ariaLabel="Quantity" value={draftQty} onChange={setDraftQty} />
            <button type="button" className={secondaryButton} onClick={addComponent} disabled={!draftItemId}>
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        <ErrorNote message={error} />
        <div className="flex flex-wrap gap-2 mt-4">
          <button className={primaryButton} onClick={save} disabled={busy}>
            {busyAction === "save" ? <Spinner /> : <Save size={13} />} {busyAction === "save" ? "Saving…" : "Save bundle"}
          </button>
          <button className={secondaryButton} onClick={() => setEditing(null)} disabled={busy}>
            Cancel
          </button>
          {editing.id && (
            <button className={`${dangerButton} ml-auto`} onClick={remove} disabled={busy}>
              {busyAction === "delete" ? <Spinner /> : <Trash2 size={13} />} Delete
            </button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          Reusable kits built from your inventory items — add one to a customer order and every component is pulled from
          its own stock.
        </p>
        <div className="flex gap-2">
          <button className={secondaryButton} onClick={() => void load()} aria-label="Refresh">
            <RefreshCw size={13} />
          </button>
          <button className={primaryButton} onClick={startNew}>
            <Plus size={13} /> New bundle
          </button>
        </div>
      </div>

      <ErrorNote message={error} />
      {rows == null && !error && <LoadingSpinner label="Loading bundles..." />}

      {rows && rows.length === 0 && (
        <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl">
          <p className="text-sm text-slate-400">No bundles yet.</p>
          <p className="text-xs text-slate-500 mt-1">Group items you sell together, like a starter kit, into one reusable bundle.</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80">
          {rows.map((row) => (
            <button
              key={row.id}
              onClick={() => startEdit(row)}
              className="w-full text-left px-4 py-3 bg-slate-900/30 hover:bg-slate-900/70 transition cursor-pointer flex items-center gap-3"
            >
              <Package size={15} className="text-gold-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white truncate">{row.name}</span>
                  {row.priceNzd != null && <span className="text-xs tabular-nums text-gold-400 font-semibold">{nzd(row.priceNzd)}</span>}
                  {row.shopVisible && <span className="text-[10px] font-bold text-emerald-400">In shop</span>}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {row.components
                    .map((c) => {
                      const item = itemsById[c.itemId];
                      return item ? `${c.qty}× ${item.item.name}` : null;
                    })
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <ChevronRight size={15} className="text-slate-600 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
