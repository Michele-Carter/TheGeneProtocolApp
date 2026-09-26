import React, { useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, PackageCheck, Pencil, Plus, Save, Trash2, Undo2, X } from "lucide-react";
import {
  calculateOrder,
  orderTypeOf,
  type OrderInput,
  type OrderLineInput,
  type SupplierCurrency,
} from "../../../shared/landedCost";
import { isExpenseLine } from "../../../shared/landedCost";
import { EXPENSE_CATEGORIES } from "../../../shared/sales";
import { MY_PRODUCTS } from "../../data/myProducts";
import { adminApi, money, nzd, todayIso, type InvItem, type PurchaseOrderRecord } from "../../lib/adminApi";
import {
  Card,
  CostEntryList,
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

const CATALOG_OPTIONS = MY_PRODUCTS.flatMap((product) =>
  product.options
    .filter((option) => option.code)
    .map((option) => ({
      itemId: `cat:${option.code}`,
      name: product.name,
      variant: option.vialSize,
      code: option.code as string,
    }))
);

const NEW_PEPTIDE = "__new_peptide";
const SUPPLY_UNITS = ["unit", "pen", "cartridge", "needle", "syringe", "wipe", "swab", "tube", "vial", "bottle", "box"];

function isCatalogId(itemId: string) {
  return itemId.startsWith("cat:");
}

const normalise = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

interface Props {
  record: PurchaseOrderRecord | null;
  initialData: OrderInput;
  items: InvItem[];
  onBack: () => void;
  onSaved: (record: PurchaseOrderRecord) => void;
  onDeleted: (id: string) => void;
}

export default function OrderEditor({ record, initialData, items, onBack, onSaved, onDeleted }: Props) {
  const { getToken } = useAuth();
  const [data, setData] = useState<OrderInput>(initialData);
  const [savedJson, setSavedJson] = useState(JSON.stringify(initialData));
  const [current, setCurrent] = useState<PurchaseOrderRecord | null>(record);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReceive, setShowReceive] = useState(false);
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [lotInfo, setLotInfo] = useState<Record<string, { lotNumber: string; expiryDate: string | null }>>({});

  const received = current?.status === "received";
  const dirty = JSON.stringify(data) !== savedJson;
  const calc = useMemo(() => calculateOrder(data), [data]);
  const ccy = data.currency;

  const orderType = orderTypeOf(data);
  const knownPeptides = useMemo(
    () => items.filter((item) => item.kind === "peptide" && !isCatalogId(item.id)),
    [items]
  );
  const supplyItems = useMemo(() => items.filter((item) => item.kind === "supply"), [items]);
  const supplyNames = useMemo(() => Array.from(new Set(supplyItems.map((i) => i.name))).sort(), [supplyItems]);
  const knownIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);

  const set = <K extends keyof OrderInput>(key: K, value: OrderInput[K]) => setData((d) => ({ ...d, [key]: value }));


  // ---- Item entry: one entry box; added items show as compact rows underneath ----
  const blankLine = (previous?: OrderLineInput): OrderLineInput =>
    orderType === "supplies"
      ? {
          id: newId(),
          itemId: newId(),
          kind: "supply",
          name: "",
          variant: "",
          unit: "unit",
          catalogCode: null,
          packPrice: 0,
          packs: 1,
          unitsPerPack: 1,
          use: previous?.use ?? "stock",
          expenseCategory: previous?.use === "expense" ? previous.expenseCategory ?? "Packaging" : null,
        }
      : {
          id: newId(),
          itemId: "",
          kind: "peptide",
          name: "",
          variant: "",
          unit: "vial",
          catalogCode: null,
          packPrice: 0,
          packs: 1,
          unitsPerPack: previous?.unitsPerPack || 10,
        };

  const [draft, setDraft] = useState<OrderLineInput>(() => blankLine());
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({});
  const [lineError, setLineError] = useState<string | null>(null);

  // Supplies are typed in freely. If the name + variant match something ordered before,
  // the line joins that item's stock; otherwise it becomes a new item.
  const withSupplyFields = (
    line: OrderLineInput,
    patch: Partial<Pick<OrderLineInput, "name" | "variant" | "unit">>
  ): OrderLineInput => {
    const next = { ...line, ...patch };
    if (isExpenseLine(next)) return next;
    const match = supplyItems.find(
      (item) => normalise(item.name) === normalise(next.name) && normalise(item.variant) === normalise(next.variant)
    );
    if (match) {
      const unitUntouched = !line.unit || line.unit === "unit" || knownIds.has(line.itemId);
      return { ...next, itemId: match.id, unit: patch.unit ?? (unitUntouched ? match.unit : line.unit) };
    }
    return { ...next, itemId: knownIds.has(line.itemId) ? newId() : line.itemId };
  };

  const withUse = (line: OrderLineInput, use: "stock" | "expense"): OrderLineInput => {
    if (use === "expense") {
      return {
        ...line,
        use: "expense",
        expenseCategory: line.expenseCategory ?? "Packaging",
        itemId: knownIds.has(line.itemId) ? newId() : line.itemId,
      };
    }
    // Back to stock: re-link to an existing item if the name matches.
    return withSupplyFields({ ...line, use: "stock" }, {});
  };

  const withChoice = (line: OrderLineInput, value: string): OrderLineInput => {
    if (value === NEW_PEPTIDE) {
      return { ...line, itemId: newId(), kind: "peptide", name: "", variant: "", unit: "vial", catalogCode: null };
    }
    const catalog = CATALOG_OPTIONS.find((o) => o.itemId === value);
    if (catalog) {
      return {
        ...line,
        itemId: catalog.itemId,
        kind: "peptide",
        name: catalog.name,
        variant: catalog.variant,
        unit: "vial",
        catalogCode: catalog.code,
      };
    }
    const item = items.find((i) => i.id === value);
    if (item) {
      return { ...line, itemId: item.id, kind: item.kind, name: item.name, variant: item.variant, unit: item.unit, catalogCode: item.catalogCode };
    }
    return line;
  };

  const draftStarted =
    draft.name.trim() !== "" || draft.packPrice > 0 || (draft.kind === "peptide" && draft.itemId !== "");

  const commitDraft = () => {
    const packWord = draft.kind === "peptide" ? "kit" : "pack";
    if (draft.kind === "peptide" && !draft.itemId) return setLineError("Choose a peptide.");
    if (!draft.name.trim()) {
      return setLineError(draft.kind === "peptide" ? "Enter the peptide's name." : "Enter the product name.");
    }
    if (!(draft.packs >= 1)) return setLineError(`Enter how many ${packWord}s you ordered.`);
    if (!(draft.unitsPerPack >= 1)) return setLineError(`Enter how many ${draft.unit || "unit"}s are in each ${packWord}.`);
    setLineError(null);
    setData((d) => ({
      ...d,
      lines: editingLineId ? d.lines.map((l) => (l.id === editingLineId ? draft : l)) : [...d.lines, draft],
    }));
    setEditingLineId(null);
    setDraft(blankLine(draft));
  };

  const editLine = (line: OrderLineInput) => {
    setDraft(line);
    setEditingLineId(line.id);
    setLineError(null);
  };

  const cancelEdit = () => {
    setEditingLineId(null);
    setDraft(blankLine(draft));
    setLineError(null);
  };

  const removeLine = (lineId: string) => {
    setData((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== lineId) }));
    if (editingLineId === lineId) cancelEdit();
  };

  // Landed cost of the item in the entry box, as if it were already on the order.
  const draftResult = (() => {
    if (!(draft.packs >= 1 && draft.unitsPerPack >= 1)) return null;
    const lines = editingLineId ? data.lines.map((l) => (l.id === editingLineId ? draft : l)) : [...data.lines, draft];
    return calculateOrder({ ...data, lines }).lines.find((l) => l.lineId === draft.id) ?? null;
  })();

  const quantityText = (line: OrderLineInput, units: number) => {
    const packWord = line.kind === "peptide" ? "kit" : "pack";
    const unit = line.unit || "unit";
    if (line.unitsPerPack > 1) {
      return `${line.packs} ${packWord}${line.packs === 1 ? "" : "s"} · ${units} ${unit}s`;
    }
    return `${units} ${unit}${units === 1 ? "" : "s"}`;
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

  const persist = async (): Promise<PurchaseOrderRecord> => {
    if (!received && draftStarted) {
      throw new Error(
        editingLineId
          ? "Finish editing the item in the entry box first — click “Update item” or “Cancel”."
          : "There's an item in the entry box that hasn't been added — click “Add to order” (or clear it) first."
      );
    }
    if (!data.supplier.trim()) throw new Error("Enter the supplier's name.");
    if (data.lines.some((l) => !l.itemId || !l.name.trim())) {
      throw new Error(
        orderType === "supplies"
          ? "Enter the product name on every line."
          : "Choose a peptide (or name the new one) on every line."
      );
    }
    if (data.lines.some((l) => l.unitsPerPack < 1)) {
      throw new Error("Units per kit/pack must be at least 1 on every line.");
    }
    const saved = current
      ? await adminApi.updateOrder(current.id, data, getToken)
      : await adminApi.createOrder(data, getToken);
    setCurrent(saved);
    setData(saved.data);
    setSavedJson(JSON.stringify(saved.data));
    onSaved(saved);
    return saved;
  };

  const save = () => run(async () => void (await persist()));

  const receive = () => {
    if (
      calc.problems.length > 0 &&
      !window.confirm(
        `This order doesn't add up yet:\n\n• ${calc.problems.join("\n• ")}\n\nCosts get locked once it's received. Receive it anyway?`
      )
    ) {
      return;
    }
    return run(async () => {
      const saved = dirty || !current ? await persist() : current;
      const updated = await adminApi.receiveOrder(saved.id, { receivedDate, lots: lotInfo }, getToken);
      setCurrent(updated);
      setShowReceive(false);
      onSaved(updated);
    });
  };

  const unreceive = () => {
    if (!current) return;
    if (!window.confirm("Take this order's stock back out of inventory and mark it as not received?")) return;
    run(async () => {
      const updated = await adminApi.unreceiveOrder(current.id, getToken);
      setCurrent(updated);
      onSaved(updated);
    });
  };

  const remove = () => {
    if (!current) {
      onBack();
      return;
    }
    if (!window.confirm("Delete this order? This can't be undone.")) return;
    run(async () => {
      await adminApi.deleteOrder(current.id, getToken);
      onDeleted(current.id);
    });
  };

  const back = () => {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    onBack();
  };

  // Amount that would make the order add up to what was billed (or paid, for NZD orders).
  const mismatch = calc.supplierBilledDiff ?? calc.paymentDiffNzd;
  const adjustmentNeeded =
    mismatch != null && Math.abs(mismatch) >= 0.005 ? Math.round(mismatch * 100) / 100 : null;

  const rateLabel =
    calc.rateNzdPerSupplier == null
      ? "—"
      : ccy === "NZD"
        ? "NZD order"
        : `1 NZD = ${(1 / calc.rateNzdPerSupplier).toFixed(6)} USD`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={back} className={secondaryButton} aria-label="Back to orders">
            <ArrowLeft size={14} />
          </button>
          <div className="min-w-0">
            <h3 className="text-base font-black text-white truncate">
              {current
                ? data.supplier || (orderType === "supplies" ? "Supply order" : "Peptide order")
                : orderType === "supplies"
                  ? "New supply order"
                  : "New peptide order"}
            </h3>
            <p className="text-[11px] text-slate-500">
              {received
                ? `Received ${current?.receivedAt ? new Date(current.receivedAt).toLocaleDateString("en-NZ") : ""} — stock and costs are locked. Order number, tracking and notes can still be edited.`
                : "Costs update as you type. Save, then mark as received when it arrives to add it to inventory."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {received ? (
            <>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 border border-emerald-900/60 bg-emerald-950/30 rounded-full px-2.5 py-1">
                <PackageCheck size={12} /> Received
              </span>
              <button className={secondaryButton} onClick={unreceive} disabled={busy}>
                <Undo2 size={13} /> Undo received
              </button>
            </>
          ) : (
            <>
              <button className={dangerButton} onClick={remove} disabled={busy}>
                <Trash2 size={13} /> {current ? "Delete" : "Discard"}
              </button>
              <button className={secondaryButton} onClick={() => setShowReceive((v) => !v)} disabled={busy}>
                <PackageCheck size={13} /> Mark as received
              </button>
            </>
          )}
          <button className={primaryButton} onClick={save} disabled={busy || (!dirty && Boolean(current))}>
            <Save size={13} /> {dirty || !current ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      <ErrorNote message={error} />

      {showReceive && !received && (
        <Card
          title="Receive into inventory"
          actions={
            <button className="text-slate-500 hover:text-white cursor-pointer" onClick={() => setShowReceive(false)}>
              <X size={14} />
            </button>
          }
        >
          <div className="space-y-3">
            {calc.problems.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/30 border border-amber-900/60 rounded-lg px-3 py-2">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <div>
                  {calc.problems.map((p) => (
                    <div key={p}>{p}</div>
                  ))}
                </div>
              </div>
            )}
            <div className="max-w-[12rem]">
              <Field label="Date received">
                <input
                  type="date"
                  className={inputClass}
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                />
              </Field>
            </div>
            <p className="text-[11px] text-slate-500">Batch / lot numbers and expiry dates are optional.</p>
            <div className="space-y-2">
              {data.lines.map((line) => {
                const result = calc.lines.find((l) => l.lineId === line.id);
                const info = lotInfo[line.id] ?? { lotNumber: "", expiryDate: null };
                if (isExpenseLine(line)) {
                  return (
                    <div key={line.id} className="text-xs text-slate-200">
                      <span className="font-bold">{line.name || "Unnamed item"}</span>{" "}
                      <span className="text-slate-500">{line.variant}</span>
                      <span className="text-sky-300/90">
                        {" "}
                        → Expenses ({line.expenseCategory ?? "Packaging"}) · {nzd(result?.landedLineNzd)}
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={line.id} className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_10rem] gap-2 items-center">
                    <div className="text-xs text-slate-200">
                      <span className="font-bold">{line.name || "Unnamed item"}</span>{" "}
                      <span className="text-slate-500">{line.variant}</span>
                      <span className="text-slate-500">
                        {" "}
                        · {result?.units ?? 0} {line.unit}s at {nzd(result?.landedPerUnitNzd, 3)} each
                      </span>
                    </div>
                    <input
                      className={inputClass}
                      placeholder="Lot no."
                      value={info.lotNumber}
                      onChange={(e) => setLotInfo((m) => ({ ...m, [line.id]: { ...info, lotNumber: e.target.value } }))}
                    />
                    <input
                      type="date"
                      className={inputClass}
                      aria-label="Expiry date"
                      value={info.expiryDate ?? ""}
                      onChange={(e) =>
                        setLotInfo((m) => ({ ...m, [line.id]: { ...info, expiryDate: e.target.value || null } }))
                      }
                    />
                  </div>
                );
              })}
            </div>
            <button className={primaryButton} onClick={receive} disabled={busy || calc.totalLandedNzd == null}>
              <PackageCheck size={13} /> {dirty || !current ? "Save & add to inventory" : "Add to inventory"}
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <Card title="Order details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Supplier">
                <input
                  className={inputClass}
                  value={data.supplier}
                  disabled={received}
                  placeholder="e.g. Alibaba, peptide supplier…"
                  onChange={(e) => set("supplier", e.target.value)}
                />
              </Field>
              <Field label="Order date">
                <input
                  type="date"
                  className={inputClass}
                  value={data.orderDate}
                  disabled={received}
                  onChange={(e) => set("orderDate", e.target.value)}
                />
              </Field>
              <Field label="Order number (optional)">
                <input
                  className={inputClass}
                  value={data.orderNumber ?? ""}
                  placeholder="Supplier's order / invoice no."
                  onChange={(e) => set("orderNumber", e.target.value)}
                />
              </Field>
              <Field label="Tracking number">
                <input
                  className={inputClass}
                  value={data.tracking}
                  onChange={(e) => set("tracking", e.target.value)}
                />
              </Field>
              <Field label="Supplier charges in">
                <div className="flex gap-2">
                  {(["USD", "NZD"] as SupplierCurrency[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={received}
                      onClick={() => set("currency", c)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer disabled:cursor-not-allowed ${
                        data.currency === c
                          ? "border-gold-500/60 text-gold-400 bg-gold-500/10"
                          : "border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Card>

          <Card title={`${orderType === "supplies" ? "Supplies" : "Peptides"} ordered (${ccy})`}>
            <datalist id="admin-supply-names">
              {supplyNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <datalist id="admin-supply-units">
              {SUPPLY_UNITS.map((unit) => (
                <option key={unit} value={unit} />
              ))}
            </datalist>

            {!received && (
              <div
                className={`border rounded-xl p-3 space-y-3 ${
                  editingLineId ? "border-gold-500/50 bg-gold-500/5" : "border-slate-800/80 bg-slate-950/50"
                }`}
              >
                {editingLineId && (
                  <div className="text-[11px] font-bold text-gold-400">
                    Editing {[draft.name, draft.variant].filter(Boolean).join(" ") || "item"}
                  </div>
                )}

                {draft.kind === "supply" ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {(
                        [
                          { id: "stock", label: "Stock", hint: "to sell / use" },
                          { id: "expense", label: "Expense", hint: "business use" },
                        ] as const
                      ).map((option) => {
                        const active = (draft.use ?? "stock") === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => !active && setDraft((d) => withUse(d, option.id))}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                              active
                                ? option.id === "expense"
                                  ? "border-sky-600/60 text-sky-300 bg-sky-500/10"
                                  : "border-gold-500/60 text-gold-400 bg-gold-500/10"
                                : "border-slate-800 text-slate-500 hover:text-white"
                            }`}
                          >
                            {option.label} <span className="font-normal opacity-70">({option.hint})</span>
                          </button>
                        );
                      })}
                      {isExpenseLine(draft) && (
                        <select
                          className={`${inputClass} w-auto py-1 text-xs`}
                          value={draft.expenseCategory ?? "Packaging"}
                          aria-label="Expense category"
                          onChange={(e) => setDraft((d) => ({ ...d, expenseCategory: e.target.value }))}
                        >
                          {EXPENSE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                      <Field label="Product">
                        <input
                          className={inputClass}
                          list="admin-supply-names"
                          placeholder="e.g. Reusable Injection Pen"
                          value={draft.name}
                          onChange={(e) => setDraft((d) => withSupplyFields(d, { name: e.target.value }))}
                        />
                      </Field>
                      <Field label="Variant / colour / size">
                        <input
                          className={inputClass}
                          list="admin-supply-variants-draft"
                          placeholder="e.g. Blue, 32G 4mm"
                          value={draft.variant}
                          onChange={(e) => setDraft((d) => withSupplyFields(d, { variant: e.target.value }))}
                        />
                        <datalist id="admin-supply-variants-draft">
                          {supplyItems
                            .filter((i) => normalise(i.name) === normalise(draft.name) && i.variant)
                            .map((i) => (
                              <option key={i.id} value={i.variant} />
                            ))}
                        </datalist>
                      </Field>
                      <Field label="Counted as">
                        <input
                          className={inputClass}
                          list="admin-supply-units"
                          placeholder="pen, needle…"
                          value={draft.unit}
                          onChange={(e) => setDraft((d) => withSupplyFields(d, { unit: e.target.value }))}
                        />
                      </Field>
                    </div>
                  </>
                ) : (
                  <>
                    <select
                      className={inputClass}
                      value={
                        draft.itemId !== "" && !isCatalogId(draft.itemId) && !knownIds.has(draft.itemId)
                          ? NEW_PEPTIDE
                          : draft.itemId
                      }
                      onChange={(e) => setDraft((d) => withChoice(d, e.target.value))}
                    >
                      <option value="" disabled>
                        Choose a peptide…
                      </option>
                      <optgroup label="Your price list">
                        {CATALOG_OPTIONS.map((o) => (
                          <option key={o.itemId} value={o.itemId}>
                            {o.name} {o.variant} ({o.code})
                          </option>
                        ))}
                      </optgroup>
                      {knownPeptides.length > 0 && (
                        <optgroup label="Other peptides you've ordered">
                          {knownPeptides.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                              {item.variant ? ` ${item.variant}` : ""}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Not listed?">
                        <option value={NEW_PEPTIDE}>+ New peptide not on the price list</option>
                      </optgroup>
                    </select>
                    {draft.itemId !== "" && !isCatalogId(draft.itemId) && !knownIds.has(draft.itemId) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          className={inputClass}
                          placeholder="Peptide name"
                          value={draft.name}
                          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        />
                        <input
                          className={inputClass}
                          placeholder="Vial size, e.g. 10mg"
                          value={draft.variant}
                          onChange={(e) => setDraft((d) => ({ ...d, variant: e.target.value }))}
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <Field label={`Price per ${draft.kind === "peptide" ? "kit" : "pack"} (${ccy})`}>
                    <NumberField
                      placeholder="0.00"
                      value={draft.packPrice || null}
                      onChange={(v) => setDraft((d) => ({ ...d, packPrice: v ?? 0 }))}
                    />
                  </Field>
                  <Field label={`No. of ${draft.kind === "peptide" ? "kit" : "pack"}s`}>
                    <NumberField integer value={draft.packs} onChange={(v) => setDraft((d) => ({ ...d, packs: v ?? 0 }))} />
                  </Field>
                  <Field label={`${draft.unit || "unit"}s per ${draft.kind === "peptide" ? "kit" : "pack"}`}>
                    <NumberField
                      integer
                      value={draft.unitsPerPack}
                      onChange={(v) => setDraft((d) => ({ ...d, unitsPerPack: v ?? 0 }))}
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-400 min-w-0">
                    {draftResult && (draft.name || draft.itemId) ? (
                      <>
                        {quantityText(draft, draftResult.units)} · {money(draftResult.netSupplier, ccy)}
                        {draftResult.landedPerUnitNzd != null && (
                          <>
                            {" "}
                            · landed{" "}
                            <span className="text-gold-400 font-bold">{nzd(draftResult.landedPerUnitNzd, 3)}</span> per{" "}
                            {draft.unit || "unit"}
                          </>
                        )}
                        {draft.kind === "supply" && draft.name.trim() && (
                          <span className="block text-slate-500">
                            {isExpenseLine(draft)
                              ? `Goes to Expenses (${draft.expenseCategory ?? "Packaging"}) when received.`
                              : knownIds.has(draft.itemId)
                                ? "Adds to your existing stock of this item."
                                : "New item — it'll be added to your inventory."}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-500">
                        {orderType === "supplies" ? "Enter an item, then add it to the order." : "Choose a peptide, then add it to the order."}
                      </span>
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

            {data.lines.length === 0 ? (
              received && <p className="text-xs text-slate-500 py-4 text-center">No items on this order.</p>
            ) : (
              <div className={`${received ? "" : "mt-4"} border border-slate-800 rounded-xl overflow-hidden`}>
                <div className="grid grid-cols-[1rem_minmax(0,1fr)_auto_6.5rem] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-slate-500 bg-slate-900/60">
                  <span />
                  <span>{orderType === "supplies" ? "Item" : "Peptide"}</span>
                  <span className="text-right">Quantity</span>
                  <span className="text-right">Line total</span>
                </div>
                <div className="divide-y divide-slate-800/70">
                  {data.lines.map((line) => {
                    const result = calc.lines.find((l) => l.lineId === line.id);
                    const open = Boolean(expandedLines[line.id]);
                    const packWord = line.kind === "peptide" ? "kit" : "pack";
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
                            {isExpenseLine(line) && (
                              <span className="ml-2 text-[9px] font-bold uppercase tracking-wide text-sky-300 border border-sky-900/60 rounded-full px-1.5 py-0.5">
                                Expense
                              </span>
                            )}
                            {editingLineId === line.id && (
                              <span className="ml-2 text-[9px] font-bold uppercase tracking-wide text-gold-400">Editing</span>
                            )}
                          </span>
                          <span className="text-xs text-slate-300 text-right tabular-nums whitespace-nowrap">
                            {quantityText(line, result?.units ?? 0)}
                          </span>
                          <span className="text-sm text-slate-100 text-right tabular-nums font-semibold">
                            {money(result?.netSupplier, ccy)}
                          </span>
                        </button>
                        {open && (
                          <div className="px-3 pb-3 pl-10 space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                              <Metric label={`Price per ${packWord}`} value={money(line.packPrice, ccy)} />
                              <Metric label={`No. of ${packWord}s`} value={String(line.packs)} />
                              <Metric label={`${unit}s per ${packWord}`} value={String(line.unitsPerPack)} />
                              <Metric label="Units" value={`${result?.units ?? 0} ${unit}s`} />
                              <Metric
                                label={data.orderDiscountPct ? "Line total after discount" : "Line total"}
                                value={money(result?.netSupplier, ccy)}
                              />
                              <Metric label="Share of shipping & fees" value={nzd(result?.sharedNzd)} />
                              <Metric label={`Landed per ${packWord}`} value={nzd(result?.landedPerPackNzd)} />
                              <Metric label={`Landed per ${unit}`} value={nzd(result?.landedPerUnitNzd, 3)} highlight />
                            </div>
                            {line.kind === "supply" && (
                              <p className="text-[11px] text-slate-500">
                                {isExpenseLine(line)
                                  ? `Goes to Expenses (${line.expenseCategory ?? "Packaging"}) when received.`
                                  : "Goes into stock when received."}
                              </p>
                            )}
                            {!received && (
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
                    {data.lines.length} {data.lines.length === 1 ? "item" : "items"} · {calc.totalUnits} units
                  </span>
                  <span className="font-bold tabular-nums text-slate-100">
                    {data.orderDiscountPct ? "After discount " : ""}
                    {money(calc.productsNetSupplier, ccy)}
                  </span>
                </div>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card title={`Supplier side (${ccy})`}>
              <div className="space-y-3">
                <Field label="Order discount %" hint="A percentage off the products (e.g. a 5% sale).">
                  <NumberField
                    value={data.orderDiscountPct}
                    disabled={received}
                    onChange={(v) => set("orderDiscountPct", v ?? 0)}
                  />
                </Field>
                <Field label={`Coupons & discounts (${ccy})`} hint="Fixed amounts off the order — enter them as positive numbers.">
                  <CostEntryList
                    entries={data.supplierDiscounts ?? []}
                    onChange={(v) => set("supplierDiscounts", v)}
                    suggestions={["Store coupon", "AliExpress coupon", "Discount code", "Credit", "Promotion"]}
                    prefix={ccy === "USD" ? "US$" : "NZ$"}
                    disabled={received}
                    addLabel="Add coupon / discount"
                  />
                </Field>
                <Field
                  label={`Shipping, tax & other charges (${ccy})`}
                  hint="Anything the supplier charged on top, e.g. shipping, tax/GST. Use a negative amount for rounding down."
                >
                  <CostEntryList
                    entries={data.supplierCharges}
                    onChange={(v) => set("supplierCharges", v)}
                    suggestions={["Shipping", "Freight", "Tax", "GST", "Rounding adjustment", "Supplier fee", "Insurance"]}
                    prefix={ccy === "USD" ? "US$" : "NZ$"}
                    disabled={received}
                    addLabel="Add charge"
                  />
                </Field>
                <Field label={`Amount the supplier billed (${ccy})`} hint="Optional — used to check the order adds up.">
                  <NumberField
                    value={data.supplierBilledTotal}
                    disabled={received}
                    onChange={(v) => set("supplierBilledTotal", v)}
                  />
                </Field>
              </div>
            </Card>

            <Card title="Your costs (NZD)">
              <div className="space-y-3">
                <Field
                  label="Total paid (NZD)"
                  hint={ccy === "USD" ? "Everything that left your account for this payment, fees included." : "The invoice total you paid."}
                >
                  <NumberField
                    value={data.totalPaidNzd}
                    disabled={received}
                    onChange={(v) => set("totalPaidNzd", v)}
                  />
                </Field>
                <Field label="Fees included in that total" hint="e.g. Wise fee, card or bank fee.">
                  <CostEntryList
                    entries={data.paymentFeesNzd}
                    onChange={(v) => set("paymentFeesNzd", v)}
                    suggestions={["Wise fee", "Card fee", "Bank fee", "Merchant fee"]}
                    prefix="NZ$"
                    disabled={received}
                    addLabel="Add fee"
                  />
                </Field>
                <Field label="Other costs paid separately" hint="e.g. customs, GST on import, courier clearance.">
                  <CostEntryList
                    entries={data.extraCostsNzd}
                    onChange={(v) => set("extraCostsNzd", v)}
                    suggestions={["Customs", "GST on import", "Courier clearance fee", "Local courier"]}
                    prefix="NZ$"
                    disabled={received}
                    addLabel="Add cost"
                  />
                </Field>
                {ccy === "USD" && data.totalPaidNzd == null && (
                  <Field label="Exchange rate for now (1 NZD = ? USD)" hint="Only used until you enter the total paid.">
                    <NumberField
                      value={data.manualRateUsdPerNzd}
                      disabled={received}
                      onChange={(v) => set("manualRateUsdPerNzd", v)}
                    />
                  </Field>
                )}
              </div>
            </Card>
          </div>

          <Card title="Notes">
            <textarea
              className={`${inputClass} min-h-[5rem]`}
              value={data.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything worth remembering about this order…"
            />
          </Card>
        </div>

        <div className="xl:sticky xl:top-4 space-y-5">
          <Card title="Order check & summary">
            <div className="space-y-0.5">
              <StatRow label="Kits / packs" value={calc.totalPacks} />
              <StatRow label="Individual units" value={calc.totalUnits} />
              <StatRow label={`Products before discount`} value={money(calc.grossSupplier, ccy)} />
              {calc.discountSupplier !== 0 && (
                <StatRow label={`Discount (${data.orderDiscountPct}%)`} value={money(-calc.discountSupplier, ccy)} />
              )}
              {calc.supplierDiscountsTotal !== 0 && (
                <StatRow label="Coupons & discounts" value={money(-calc.supplierDiscountsTotal, ccy)} />
              )}
              <StatRow label="Shipping, tax & charges" value={money(calc.supplierChargesTotal, ccy)} />
              <StatRow label="Calculated supplier total" value={money(calc.calcSupplierTotal, ccy)} strong />
              {calc.supplierBilledDiff != null && (
                <StatRow
                  label="Difference from supplier bill"
                  value={money(calc.supplierBilledDiff, ccy)}
                  tone={Math.abs(calc.supplierBilledDiff) < 0.005 ? "good" : "bad"}
                />
              )}
              <StatRow label="Total paid" value={nzd(data.totalPaidNzd)} />
              <StatRow label="Payment fees" value={nzd(calc.paymentFeesTotalNzd)} />
              {ccy === "USD" && <StatRow label="Converted to pay supplier" value={nzd(calc.convertedNzd)} />}
              {calc.paymentDiffNzd != null && (
                <StatRow
                  label="Difference from amount paid"
                  value={nzd(calc.paymentDiffNzd)}
                  tone={Math.abs(calc.paymentDiffNzd) < 0.005 ? "good" : "bad"}
                />
              )}
              <StatRow label="Other costs" value={nzd(calc.extraCostsTotalNzd)} />
              <StatRow
                label={calc.rateSource === "manual" ? "Exchange rate (estimate)" : "Effective exchange rate"}
                value={rateLabel}
                tone={calc.rateSource === "manual" ? "muted" : undefined}
              />
              <StatRow label="Shared costs (NZD)" value={nzd(calc.sharedCostsNzd)} />
              <StatRow label="Shared cost per unit" value={nzd(calc.sharedPerUnitNzd, 4)} />
              <StatRow label="Total landed cost" value={nzd(calc.totalLandedNzd)} strong />
              {data.lines.some(isExpenseLine) && (
                <>
                  <StatRow
                    label="…into stock"
                    value={nzd(
                      calc.lines
                        .filter((l) => !isExpenseLine(data.lines.find((d) => d.id === l.lineId) ?? {}))
                        .reduce((t, l) => (t == null || l.landedLineNzd == null ? null : t + l.landedLineNzd), 0 as number | null)
                    )}
                  />
                  <StatRow
                    label="…to expenses"
                    value={nzd(
                      calc.lines
                        .filter((l) => isExpenseLine(data.lines.find((d) => d.id === l.lineId) ?? {}))
                        .reduce((t, l) => (t == null || l.landedLineNzd == null ? null : t + l.landedLineNzd), 0 as number | null)
                    )}
                  />
                </>
              )}
              <StatRow label="Average per unit" value={nzd(calc.averagePerUnitNzd, 3)} strong />
            </div>

            <div className="mt-3">
              {calc.status === "matches" && (
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <CheckCircle2 size={14} /> Matches what you paid
                </div>
              )}
              {calc.status === "not-checked" && (
                <div className="text-[11px] text-slate-500">
                  Enter the amount the supplier billed to double-check the totals.
                </div>
              )}
              {calc.problems.length > 0 && (
                <div className="space-y-1">
                  {calc.problems.map((p) => (
                    <div key={p} className="flex items-start gap-1.5 text-[11px] text-amber-300">
                      <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                      <span>{p}</span>
                    </div>
                  ))}
                  {!received && adjustmentNeeded != null && (
                    <button
                      className={`${secondaryButton} mt-2`}
                      onClick={() =>
                        set("supplierCharges", [
                          ...data.supplierCharges,
                          { id: newId(), label: "Rounding adjustment", amount: adjustmentNeeded },
                        ])
                      }
                    >
                      <Plus size={13} /> Add {money(adjustmentNeeded, ccy)} adjustment
                    </button>
                  )}
                </div>
              )}
            </div>
          </Card>
          <p className="text-[11px] text-slate-500 leading-relaxed px-1">
            Each product's own price (after discount) is converted at the effective rate. Freight, fees, taxes and
            every other cost are split equally across every individual unit — each vial in a kit counts as one.
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
