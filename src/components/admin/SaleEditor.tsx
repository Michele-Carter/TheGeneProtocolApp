import React, { useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Package, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { fifoEstimate, saleProfit, saleTotals, type SaleInput, type SaleLine, type ShippingStatus } from "../../../shared/sales";
import { adminApi, nzd, todayIso, type BundleRecord, type InventorySummaryRow, type SaleRecord } from "../../lib/adminApi";
import {
  Card,
  ErrorNote,
  Field,
  NumberField,
  StatRow,
  dangerButton,
  dateButtonClass,
  inputClass,
  newId,
  primaryButton,
  secondaryButton,
} from "./ui";
import StyledDatePicker from "../StyledDatePicker";
import { Spinner } from "../LoadingSpinner";

const SHIPPING_STATUSES: { id: ShippingStatus; label: string }[] = [
  { id: "not-sent", label: "Not sent" },
  { id: "sent", label: "Sent" },
  { id: "delivered", label: "Delivered" },
  { id: "collected", label: "Collected" },
];

function blankLine(): SaleLine {
  return { id: newId(), itemId: "", kind: "peptide", name: "", variant: "", unit: "vial", qty: 1, unitPriceNzd: 0 };
}

interface Props {
  record: SaleRecord | null;
  initialData: SaleInput;
  inventory: InventorySummaryRow[];
  bundles: BundleRecord[];
  customers: string[];
  lastPrices: Record<string, number>;
  onBack: () => void;
  onChanged: (record: SaleRecord) => void;
  onDeleted: () => void;
}

export default function SaleEditor({ record, initialData, inventory, bundles, customers, lastPrices, onBack, onChanged, onDeleted }: Props) {
  const { getToken } = useAuth();
  const [data, setData] = useState<SaleInput>(initialData);
  const [savedJson, setSavedJson] = useState(JSON.stringify(initialData));
  const [current, setCurrent] = useState<SaleRecord | null>(record);
  const [busyAction, setBusyAction] = useState<null | "save" | "complete" | "reopen" | "delete">(null);
  const busy = busyAction != null;
  const [error, setError] = useState<string | null>(null);

  const completed = current?.status === "completed";
  const dirty = JSON.stringify(data) !== savedJson;
  const totals = useMemo(() => saleTotals(data), [data]);

  const stockById = useMemo(() => Object.fromEntries(inventory.map((row) => [row.item.id, row])), [inventory]);
  // Each item's sell price, set on the item in Inventory.
  const listPrice = (itemId: string) => stockById[itemId]?.item.sellPriceNzd ?? null;
  const estimate = useMemo(
    () => fifoEstimate(data.lines, Object.fromEntries(inventory.map((row) => [row.item.id, row.fifo]))),
    [data.lines, inventory]
  );
  // Before completion the cost is estimated from the oldest batches; after, it's what was actually taken.
  const lineCost = (lineId: string) => (completed ? current?.costDetail?.[lineId] ?? null : estimate.byLine[lineId] ?? null);
  const cogs = completed ? current?.cogsNzd ?? null : estimate.total;
  const { profit, marginPct } = saleProfit(data, cogs);

  // Lines added together as a bundle are shown as one collapsed row, named after the bundle.
  const lineGroups = useMemo(() => {
    const groups: { key: string; bundleName: string | null; lines: SaleLine[] }[] = [];
    for (const line of data.lines) {
      const last = groups[groups.length - 1];
      if (line.bundleName && last?.bundleName === line.bundleName) {
        last.lines.push(line);
      } else {
        groups.push({ key: line.id, bundleName: line.bundleName ?? null, lines: [line] });
      }
    }
    return groups;
  }, [data.lines]);

  const peptides = inventory.filter((row) => row.item.kind === "peptide");
  const supplies = inventory.filter((row) => row.item.kind === "supply");

  const set = <K extends keyof SaleInput>(key: K, value: SaleInput[K]) => setData((d) => ({ ...d, [key]: value }));

  // One entry box for adding (or editing) an item; the order's items are listed below it.
  const [draft, setDraft] = useState<SaleLine>(() => blankLine());
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({});
  const [lineError, setLineError] = useState<string | null>(null);
  const draftStarted = draft.itemId !== "";

  const chooseItem = (itemId: string) => {
    const row = stockById[itemId];
    if (!row) return;
    setDraft((d) => ({
      ...d,
      itemId,
      kind: row.item.kind,
      name: row.item.name,
      variant: row.item.variant,
      unit: row.item.unit,
      unitPriceNzd: listPrice(itemId) ?? lastPrices[itemId] ?? 0,
    }));
  };

  const commitDraft = () => {
    if (!draft.itemId) return setLineError("Choose an item.");
    if (!(draft.qty >= 1)) return setLineError("Enter a quantity of at least 1.");
    setLineError(null);
    setData((d) => ({
      ...d,
      lines: editingLineId ? d.lines.map((l) => (l.id === editingLineId ? draft : l)) : [...d.lines, draft],
    }));
    setEditingLineId(null);
    setDraft(blankLine());
  };

  // Edit loads the line into the entry box at the top of the Items card, which may be scrolled
  // out of view - so bring it into view and put the cursor in the price.
  const entryBoxRef = useRef<HTMLDivElement>(null);
  const showEntryBox = () =>
    requestAnimationFrame(() => {
      entryBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      entryBoxRef.current?.querySelector<HTMLInputElement>("input[data-price]")?.focus({ preventScroll: true });
    });

  const editLine = (line: SaleLine) => {
    setDraft(line);
    setEditingLineId(line.id);
    setLineError(null);
    showEntryBox();
  };

  const cancelEdit = () => {
    setEditingLineId(null);
    setDraft(blankLine());
    setLineError(null);
  };

  const removeLine = (lineId: string) => {
    setData((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== lineId) }));
    if (editingLineId === lineId) cancelEdit();
  };

  // Adding a bundle drops in one line per component (scaled by how many bundles).
  // With a package price set, components usually have no sale-price history of their own
  // (they're only ever sold as part of a bundle), so the package price is split across them
  // weighted by stock cost — not left at $0 — and the lines already sum to the package price.
  const [bundleId, setBundleId] = useState("");
  const [bundleQty, setBundleQty] = useState<number | null>(1);
  const bundlesById = useMemo(() => Object.fromEntries(bundles.map((b) => [b.id, b])), [bundles]);

  const addBundle = () => {
    const bundle = bundlesById[bundleId];
    if (!bundle || !(bundleQty && bundleQty >= 1)) return;

    const base = bundle.components.map((c) => {
      const row = stockById[c.itemId];
      const qty = c.qty * bundleQty;
      const refCostNzd = row?.nextCostNzd ?? row?.averageCostNzd ?? 0;
      return {
        itemId: c.itemId,
        kind: row?.item.kind ?? ("supply" as const),
        name: row?.item.name ?? "Unknown item",
        variant: row?.item.variant ?? "",
        unit: row?.item.unit ?? "unit",
        qty,
        weight: qty * refCostNzd,
      };
    });

    let newLines: SaleLine[];
    if (bundle.priceNzd != null) {
      const packageTotal = bundle.priceNzd * bundleQty;
      const weightTotal = base.reduce((t, l) => t + l.weight, 0);
      newLines = base.map((l) => {
        const share = weightTotal > 0 ? l.weight / weightTotal : 1 / base.length;
        const lineTotal = packageTotal * share;
        return {
          id: newId(),
          itemId: l.itemId,
          kind: l.kind,
          name: l.name,
          variant: l.variant,
          unit: l.unit,
          qty: l.qty,
          unitPriceNzd: l.qty > 0 ? lineTotal / l.qty : 0,
          bundleName: bundle.name,
        };
      });
    } else {
      newLines = base.map((l) => ({
        id: newId(),
        itemId: l.itemId,
        kind: l.kind,
        name: l.name,
        variant: l.variant,
        unit: l.unit,
        qty: l.qty,
        unitPriceNzd: listPrice(l.itemId) ?? lastPrices[l.itemId] ?? 0,
        bundleName: bundle.name,
      }));
    }

    setData((d) => ({ ...d, lines: [...d.lines, ...newLines] }));
    setBundleId("");
    setBundleQty(1);
  };

  // Cost and stock check for the item in the entry box, as if it were already on the order.
  const draftEstimate = useMemo(() => {
    if (!draft.itemId || !(draft.qty >= 1)) return null;
    const lines = editingLineId ? data.lines.map((l) => (l.id === editingLineId ? draft : l)) : [...data.lines, draft];
    const result = fifoEstimate(lines, Object.fromEntries(inventory.map((row) => [row.item.id, row.fifo])));
    return { cost: result.byLine[draft.id] ?? null, short: result.short.includes(draft.id) };
  }, [draft, editingLineId, data.lines, inventory]);

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

  const apply = (saved: SaleRecord) => {
    setCurrent(saved);
    setData(saved.data);
    setSavedJson(JSON.stringify(saved.data));
    onChanged(saved);
  };

  const persist = async (): Promise<SaleRecord> => {
    if (!completed && draftStarted) {
      throw new Error(
        editingLineId
          ? "Finish editing the item in the entry box first — click “Update item” or “Cancel”."
          : "There's an item in the entry box that hasn't been added — click “Add to order” (or clear it) first."
      );
    }
    if (!data.customerName.trim()) throw new Error("Enter the customer's name.");
    if (data.lines.some((l) => !l.itemId)) throw new Error("Choose an item on every line.");
    if (data.lines.some((l) => !(l.qty >= 1))) throw new Error("Every item needs a quantity of at least 1.");
    const saved = current
      ? await adminApi.updateSale(current.id, data, getToken)
      : await adminApi.createSale(data, getToken);
    apply(saved);
    return saved;
  };

  const save = () => run("save", async () => void (await persist()));

  const complete = () => {
    if (draftStarted) {
      setError(
        editingLineId
          ? "Finish editing the item in the entry box first — click “Update item” or “Cancel”."
          : "There's an item in the entry box that hasn't been added — click “Add to order” (or clear it) first."
      );
      return;
    }
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
    run("complete", async () => {
      const saved = dirty || !current ? await persist() : current;
      apply(await adminApi.completeSale(saved.id, data.orderDate, getToken));
    });
  };

  const reopen = () => {
    if (!current) return;
    if (!window.confirm("Reopen this order? Its items go back into stock (into the same batches they came from).")) return;
    run("reopen", async () => apply(await adminApi.reopenSale(current.id, getToken)));
  };

  const remove = () => {
    if (!current) {
      onBack();
      return;
    }
    if (!window.confirm("Delete this customer order? This can't be undone.")) return;
    run("delete", async () => {
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
                {busyAction === "reopen" ? <Spinner /> : <RotateCcw size={13} />} Reopen
              </button>
            </>
          ) : (
            <>
              <button className={dangerButton} onClick={remove} disabled={busy}>
                {busyAction === "delete" ? <Spinner /> : <Trash2 size={13} />} {current ? "Delete" : "Discard"}
              </button>
              <button className={secondaryButton} onClick={complete} disabled={busy}>
                {busyAction === "complete" ? <Spinner /> : <CheckCircle2 size={13} />} Complete order
              </button>
            </>
          )}
          <button className={primaryButton} onClick={save} disabled={busy || (!dirty && Boolean(current))}>
            {busyAction === "save" ? <Spinner /> : <Save size={13} />} {dirty || !current ? "Save" : "Saved"}
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
                <StyledDatePicker
                  buttonClassName={dateButtonClass}
                  value={data.orderDate}
                  disabled={completed}
                  onChange={(v) => set("orderDate", v)}
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

          <Card title="Items">
            {inventory.length === 0 && !completed && (
              <p className="text-xs text-amber-300/90 pb-3">
                Nothing is in inventory yet. Receive a supply order first so there's stock to sell.
              </p>
            )}

            {!completed && (
              <div
                ref={entryBoxRef}
                className={`border rounded-xl p-3 space-y-3 ${
                  editingLineId ? "border-gold-500/50 bg-gold-500/5" : "border-slate-800/80 bg-slate-950/50"
                }`}
              >
                {editingLineId && (
                  <div className="text-[11px] font-bold text-gold-400">
                    Editing {[draft.name, draft.variant].filter(Boolean).join(" ") || "item"}
                  </div>
                )}
                <select className={inputClass} value={draft.itemId} onChange={(e) => chooseItem(e.target.value)}>
                  {draft.itemId && !stockById[draft.itemId] ? (
                    <option value={draft.itemId}>
                      {draft.name} {draft.variant}
                    </option>
                  ) : (
                    <option value="" disabled>
                      Choose an item…
                    </option>
                  )}
                  {[
                    { label: "Peptides", rows: peptides },
                    { label: "Supplies", rows: supplies },
                  ]
                    .filter((group) => group.rows.length > 0)
                    .map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.rows.map((r) => (
                          <option key={r.item.id} value={r.item.id} disabled={r.onHand === 0 && r.item.id !== draft.itemId}>
                            {r.item.name} {r.item.variant} — {r.onHand} {r.item.unit}s in stock
                          </option>
                        ))}
                      </optgroup>
                    ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Quantity (${draft.unit || "unit"}s)`}>
                    <NumberField integer value={draft.qty} onChange={(v) => setDraft((d) => ({ ...d, qty: v ?? 0 }))} />
                  </Field>
                  <Field
                    label={`Price per ${draft.unit || "unit"} (NZD)`}
                    hint={
                      draft.itemId && listPrice(draft.itemId) != null && listPrice(draft.itemId) !== draft.unitPriceNzd
                        ? `Sell price: ${nzd(listPrice(draft.itemId))}`
                        : draft.itemId && listPrice(draft.itemId) == null
                          ? "No sell price set — last price you charged."
                          : undefined
                    }
                  >
                    <NumberField
                      price
                      placeholder="0.00"
                      value={draft.unitPriceNzd || null}
                      onChange={(v) => setDraft((d) => ({ ...d, unitPriceNzd: v ?? 0 }))}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-400 min-w-0">
                    {draftEstimate ? (
                      <>
                        {draft.qty} {draft.unit || "unit"}
                        {draft.qty === 1 ? "" : "s"} · {nzd(draft.qty * draft.unitPriceNzd)}
                        {draftEstimate.cost != null && (
                          <>
                            {" "}
                            · est. cost {nzd(draftEstimate.cost)} · profit{" "}
                            <span className="text-gold-400 font-bold">
                              {nzd(draft.qty * draft.unitPriceNzd - draftEstimate.cost)}
                            </span>
                          </>
                        )}
                        {draftEstimate.short && (
                          <span className="flex items-center gap-1.5 text-red-400 pt-0.5">
                            <AlertTriangle size={12} /> Only {stockById[draft.itemId]?.onHand ?? 0} in stock
                            {data.lines.some((l) => l.itemId === draft.itemId && l.id !== draft.id)
                              ? " (across all lines for this item)"
                              : ""}
                            .
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-500">Choose an item, then add it to the order.</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {editingLineId && (
                      <button className={secondaryButton} onClick={cancelEdit}>
                        Cancel
                      </button>
                    )}
                    <button className={primaryButton} onClick={commitDraft}>
                      <Plus size={13} /> {editingLineId ? "Update item" : "Add to order"}
                    </button>
                  </div>
                </div>
                <ErrorNote message={lineError} />
              </div>
            )}

            {!completed && bundles.length > 0 && (
              <div className="mt-3 border border-slate-800/80 bg-slate-950/50 rounded-xl p-3 space-y-2">
                <span className="block text-[11px] font-bold text-white">Or add a bundle</span>
                <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto] gap-2 items-center">
                  <select className={inputClass} value={bundleId} onChange={(e) => setBundleId(e.target.value)}>
                    <option value="" disabled>
                      Choose a bundle…
                    </option>
                    {bundles.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.priceNzd != null ? ` — ${nzd(b.priceNzd)}` : ""}
                      </option>
                    ))}
                  </select>
                  <NumberField integer ariaLabel="Quantity" value={bundleQty} onChange={setBundleQty} />
                  <button type="button" className={secondaryButton} onClick={addBundle} disabled={!bundleId}>
                    <Plus size={13} /> Add
                  </button>
                </div>
              </div>
            )}

            {data.lines.length === 0 ? (
              completed && <p className="text-xs text-slate-500 py-4 text-center">No items on this order.</p>
            ) : (
              <div className={`${completed ? "" : "mt-4"} border border-slate-800 rounded-xl overflow-hidden`}>
                <div className="grid grid-cols-[1rem_minmax(0,1fr)_auto_6.5rem] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-white bg-slate-900/60">
                  <span />
                  <span>Item</span>
                  <span className="text-right">Quantity</span>
                  <span className="text-right">Line total</span>
                </div>
                <div className="divide-y divide-slate-800/70">
                  {lineGroups.map((group) => {
                    if (group.bundleName) {
                      const bundleName = group.bundleName;
                      const open = Boolean(expandedLines[group.key]);
                      const groupTotal = group.lines.reduce((t, l) => t + l.qty * l.unitPriceNzd, 0);
                      const costs = group.lines.map((l) => lineCost(l.id));
                      const groupCost = costs.some((c) => c == null) ? null : (costs as number[]).reduce((t, c) => t + c, 0);
                      const groupShort = !completed && group.lines.some((l) => estimate.short.includes(l.id));
                      const removeGroup = () =>
                        setData((d) => ({ ...d, lines: d.lines.filter((l) => !group.lines.some((gl) => gl.id === l.id)) }));
                      return (
                        <div key={group.key}>
                          <button
                            type="button"
                            onClick={() => setExpandedLines((m) => ({ ...m, [group.key]: !m[group.key] }))}
                            className="w-full grid grid-cols-[1rem_minmax(0,1fr)_auto_6.5rem] gap-3 px-3 py-2.5 items-center text-left hover:bg-slate-900/50 transition cursor-pointer"
                            aria-expanded={open}
                          >
                            <ChevronRight size={14} className={`text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} />
                            <span className="min-w-0 truncate text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                              <Package size={13} className="text-sky-300 flex-shrink-0" />
                              <span className="truncate">{bundleName}</span>
                              {groupShort && (
                                <span className="text-[9px] font-bold uppercase tracking-wide text-red-400 border border-red-900/60 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                  Short
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-slate-300 text-right tabular-nums whitespace-nowrap">
                              {group.lines.length} items
                            </span>
                            <span className="text-sm text-slate-100 text-right tabular-nums font-semibold">{nzd(groupTotal)}</span>
                          </button>
                          {open && (
                            <div className="px-3 pb-3 pl-10 space-y-3">
                              <div className="grid grid-cols-3 gap-2 text-[11px]">
                                <Metric label="Bundle value" value={nzd(groupTotal)} />
                                <Metric label={completed ? "Cost of stock" : "Est. cost of stock"} value={nzd(groupCost)} />
                                <Metric label="Gross profit" value={groupCost == null ? "—" : nzd(groupTotal - groupCost)} highlight />
                              </div>
                              <div className="space-y-1 border-t border-slate-800/60 pt-2">
                                {group.lines.map((line) => {
                                  const row = stockById[line.itemId];
                                  const lineShort = !completed && estimate.short.includes(line.id);
                                  const unit = line.unit || "unit";
                                  return (
                                    <div key={line.id} className="flex items-center justify-between gap-2 text-xs">
                                      <span className="min-w-0 truncate text-slate-300">
                                        {line.qty} {unit}
                                        {line.qty === 1 ? "" : "s"} · {line.name}{" "}
                                        <span className="text-slate-500">{line.variant}</span>
                                        {lineShort && (
                                          <span className="ml-1.5 text-red-400">
                                            <AlertTriangle size={11} className="inline -mt-0.5" /> only {row?.onHand ?? 0} in stock
                                          </span>
                                        )}
                                      </span>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="tabular-nums text-slate-300">{nzd(line.qty * line.unitPriceNzd)}</span>
                                        {!completed && (
                                          <button
                                            type="button"
                                            className="p-1 text-slate-500 hover:text-red-400 transition cursor-pointer"
                                            aria-label="Remove item"
                                            onClick={() => removeLine(line.id)}
                                          >
                                            <X size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {!completed && (
                                <button className={dangerButton} onClick={removeGroup}>
                                  <Trash2 size={12} /> Remove bundle
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }

                    const line = group.lines[0];
                    const row = stockById[line.itemId];
                    const short = !completed && estimate.short.includes(line.id);
                    const cost = lineCost(line.id);
                    const lineTotal = line.qty * line.unitPriceNzd;
                    const open = Boolean(expandedLines[line.id]);
                    const unit = line.unit || "unit";
                    return (
                      <div key={line.id} className={editingLineId === line.id ? "bg-gold-500/5" : ""}>
                        <button
                          type="button"
                          onClick={() => setExpandedLines((m) => ({ ...m, [line.id]: !m[line.id] }))}
                          className="w-full grid grid-cols-[1rem_minmax(0,1fr)_auto_6.5rem] gap-3 px-3 py-2.5 items-center text-left hover:bg-slate-900/50 transition cursor-pointer"
                          aria-expanded={open}
                        >
                          <ChevronRight size={14} className={`text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} />
                          <span className="min-w-0 truncate text-sm font-semibold text-slate-100">
                            {line.name} <span className="font-normal text-slate-400">{line.variant}</span>
                            {short && (
                              <span className="ml-2 text-[9px] font-bold uppercase tracking-wide text-red-400 border border-red-900/60 rounded-full px-1.5 py-0.5">
                                Short
                              </span>
                            )}
                            {editingLineId === line.id && (
                              <span className="ml-2 text-[9px] font-bold uppercase tracking-wide text-gold-400">Editing</span>
                            )}
                          </span>
                          <span className="text-xs text-slate-300 text-right tabular-nums whitespace-nowrap">
                            {line.qty} {unit}
                            {line.qty === 1 ? "" : "s"}
                          </span>
                          <span className="text-sm text-slate-100 text-right tabular-nums font-semibold">{nzd(lineTotal)}</span>
                        </button>
                        {open && (
                          <div className="px-3 pb-3 pl-10 space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                              <Metric label={`Price per ${unit}`} value={nzd(line.unitPriceNzd)} />
                              <Metric label="Line total" value={nzd(lineTotal)} />
                              <Metric label={completed ? "Cost of stock" : "Est. cost of stock"} value={nzd(cost)} />
                              <Metric label="Gross profit" value={cost == null ? "—" : nzd(lineTotal - cost)} highlight />
                            </div>
                            {short && (
                              <div className="flex items-center gap-1.5 text-[11px] text-red-400">
                                <AlertTriangle size={12} /> Only {row?.onHand ?? 0} in stock
                                {data.lines.filter((l) => l.itemId === line.itemId).length > 1 ? " (across all lines for this item)" : ""}.
                              </div>
                            )}
                            {!completed && (
                              <div className="flex gap-2">
                                <button className={secondaryButton} onClick={() => editLine(line)}>
                                  <Pencil size={12} /> Edit
                                </button>
                                <button className={dangerButton} onClick={() => removeLine(line.id)}>
                                  <Trash2 size={12} /> Remove
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-xs bg-slate-900/40 border-t border-slate-800">
                  <span className="text-slate-400">
                    {data.lines.length} {data.lines.length === 1 ? "item" : "items"} · {totals.units} units
                  </span>
                  <span className="font-bold tabular-nums text-slate-100">{nzd(totals.itemsSubtotal)}</span>
                </div>
              </div>
            )}
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
                    <StyledDatePicker
                      buttonClassName={dateButtonClass}
                      value={data.payment.paidDate ?? ""}
                      onChange={(v) => set("payment", { ...data.payment, paidDate: v || null })}
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
                      <StyledDatePicker
                        buttonClassName={dateButtonClass}
                        value={data.shipping.sentDate ?? ""}
                        onChange={(v) => set("shipping", { ...data.shipping, sentDate: v || null })}
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
