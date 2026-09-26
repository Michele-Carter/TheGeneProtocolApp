import React, { useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, PackageCheck, Plus, Save, Trash2, Undo2, X } from "lucide-react";
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

  const updateLine = (lineId: string, patch: Partial<OrderLineInput>) =>
    setData((d) => ({ ...d, lines: d.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }));

  const addLine = () =>
    setData((d) => ({
      ...d,
      lines: [
        ...d.lines,
        orderTypeOf(d) === "supplies"
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
              unitsPerPack: 10,
            },
      ],
    }));


  // Supplies are typed in freely. If the name + variant match something ordered before,
  // the line joins that item's stock; otherwise it becomes a new item.
  const updateSupplyLine = (line: OrderLineInput, patch: Partial<Pick<OrderLineInput, "name" | "variant" | "unit">>) => {
    const next = { ...line, ...patch };
    if (isExpenseLine(next)) {
      updateLine(line.id, patch);
      return;
    }
    const match = supplyItems.find(
      (item) => normalise(item.name) === normalise(next.name) && normalise(item.variant) === normalise(next.variant)
    );
    if (match) {
      const unitUntouched = !line.unit || line.unit === "unit" || knownIds.has(line.itemId);
      updateLine(line.id, { ...patch, itemId: match.id, unit: patch.unit ?? (unitUntouched ? match.unit : line.unit) });
    } else {
      updateLine(line.id, { ...patch, itemId: knownIds.has(line.itemId) ? newId() : line.itemId });
    }
  };

  const chooseItem = (line: OrderLineInput, value: string) => {
    if (value === NEW_PEPTIDE) {
      updateLine(line.id, {
        itemId: newId(),
        kind: "peptide",
        name: "",
        variant: "",
        unit: "vial",
        catalogCode: null,
        unitsPerPack: line.unitsPerPack || 10,
      });
      return;
    }
    const catalog = CATALOG_OPTIONS.find((o) => o.itemId === value);
    if (catalog) {
      updateLine(line.id, {
        itemId: catalog.itemId,
        kind: "peptide",
        name: catalog.name,
        variant: catalog.variant,
        unit: "vial",
        catalogCode: catalog.code,
        unitsPerPack: line.kind === "peptide" && line.unitsPerPack > 1 ? line.unitsPerPack : 10,
      });
      return;
    }
    const item = items.find((i) => i.id === value);
    if (item) {
      updateLine(line.id, {
        itemId: item.id,
        kind: item.kind,
        name: item.name,
        variant: item.variant,
        unit: item.unit,
        catalogCode: item.catalogCode,
        unitsPerPack: line.unitsPerPack || 10,
      });
    }
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

          <Card
            title={`${orderType === "supplies" ? "Supplies" : "Peptides"} ordered (${ccy})`}
            actions={
              !received && (
                <button className={secondaryButton} onClick={addLine}>
                  <Plus size={13} /> {orderType === "supplies" ? "Add supply" : "Add peptide"}
                </button>
              )
            }
          >
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
            {data.lines.length === 0 && (
              <p className="text-xs text-slate-500 py-4 text-center">
                {orderType === "supplies" ? "No supplies yet — add what you ordered." : "No peptides yet — add what you ordered."}
              </p>
            )}
            <div className="space-y-3">
              {data.lines.map((line) => {
                const result = calc.lines.find((l) => l.lineId === line.id);
                const isNew = line.itemId !== "" && !isCatalogId(line.itemId) && !knownIds.has(line.itemId);
                const packWord = line.kind === "peptide" ? "kit" : "pack";
                return (
                  <div key={line.id} className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2 min-w-0">
                        {line.kind === "supply" ? (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              {(
                                [
                                  { id: "stock", label: "Stock", hint: "to sell / use" },
                                  { id: "expense", label: "Expense", hint: "business use" },
                                ] as const
                              ).map((option) => {
                                const active = (line.use ?? "stock") === option.id;
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    disabled={received}
                                    onClick={() => {
                                      if (active) return;
                                      if (option.id === "expense") {
                                        updateLine(line.id, {
                                          use: "expense",
                                          expenseCategory: line.expenseCategory ?? "Packaging",
                                          itemId: knownIds.has(line.itemId) ? newId() : line.itemId,
                                        });
                                      } else {
                                        // Back to stock: re-link to an existing item if the name matches.
                                        const match = supplyItems.find(
                                          (item) =>
                                            normalise(item.name) === normalise(line.name) &&
                                            normalise(item.variant) === normalise(line.variant)
                                        );
                                        updateLine(line.id, { use: "stock", itemId: match?.id ?? line.itemId });
                                      }
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer disabled:cursor-not-allowed ${
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
                              {isExpenseLine(line) && (
                                <select
                                  className={`${inputClass} w-auto py-1 text-xs`}
                                  value={line.expenseCategory ?? "Packaging"}
                                  disabled={received}
                                  aria-label="Expense category"
                                  onChange={(e) => updateLine(line.id, { expenseCategory: e.target.value })}
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
                                  value={line.name}
                                  disabled={received}
                                  onChange={(e) => updateSupplyLine(line, { name: e.target.value })}
                                />
                              </Field>
                              <Field label="Variant / colour / size">
                                <input
                                  className={inputClass}
                                  list={`admin-supply-variants-${line.id}`}
                                  placeholder="e.g. Blue, 32G 4mm"
                                  value={line.variant}
                                  disabled={received}
                                  onChange={(e) => updateSupplyLine(line, { variant: e.target.value })}
                                />
                                <datalist id={`admin-supply-variants-${line.id}`}>
                                  {supplyItems
                                    .filter((i) => normalise(i.name) === normalise(line.name) && i.variant)
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
                                  value={line.unit}
                                  disabled={received}
                                  onChange={(e) => updateSupplyLine(line, { unit: e.target.value })}
                                />
                              </Field>
                            </div>
                            {line.name.trim() && !received && (
                              <p className="text-[10px] text-slate-500">
                                {isExpenseLine(line)
                                  ? `Goes to Expenses (${line.expenseCategory ?? "Packaging"}) when received, with its share of shipping and fees.`
                                  : knownIds.has(line.itemId)
                                    ? "Adds to your existing stock of this item."
                                    : "New item — it'll be added to your inventory."}
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <select
                              className={inputClass}
                              value={isNew ? NEW_PEPTIDE : line.itemId}
                              disabled={received}
                              onChange={(e) => chooseItem(line, e.target.value)}
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
                            {isNew && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                  className={inputClass}
                                  placeholder="Peptide name"
                                  value={line.name}
                                  onChange={(e) => updateLine(line.id, { name: e.target.value })}
                                />
                                <input
                                  className={inputClass}
                                  placeholder="Vial size, e.g. 10mg"
                                  value={line.variant}
                                  onChange={(e) => updateLine(line.id, { variant: e.target.value })}
                                />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      {!received && (
                        <button
                          className="p-2 text-slate-500 hover:text-red-400 transition cursor-pointer"
                          aria-label="Remove item"
                          onClick={() => set("lines", data.lines.filter((l) => l.id !== line.id))}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Field label={`Price per ${packWord} (${ccy})`}>
                        <NumberField
                          value={line.packPrice}
                          disabled={received}
                          onChange={(v) => updateLine(line.id, { packPrice: v ?? 0 })}
                        />
                      </Field>
                      <Field label={`No. of ${packWord}s`}>
                        <NumberField
                          integer
                          value={line.packs}
                          disabled={received}
                          onChange={(v) => updateLine(line.id, { packs: v ?? 0 })}
                        />
                      </Field>
                      <Field label={`${line.unit || "unit"}s per ${packWord}`}>
                        <NumberField
                          integer
                          value={line.unitsPerPack}
                          disabled={received}
                          onChange={(v) => updateLine(line.id, { unitsPerPack: v ?? 0 })}
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <Metric label="Units" value={`${result?.units ?? 0} ${line.unit || "unit"}s`} />
                      <Metric
                        label={data.orderDiscountPct ? "Line total after discount" : "Line total"}
                        value={money(result?.netSupplier, ccy)}
                      />
                      <Metric label={`Landed per ${packWord}`} value={nzd(result?.landedPerPackNzd)} />
                      <Metric label={`Landed per ${line.unit || "unit"}`} value={nzd(result?.landedPerUnitNzd, 3)} highlight />
                    </div>
                  </div>
                );
              })}
            </div>
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
