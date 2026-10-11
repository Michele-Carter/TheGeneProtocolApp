import React, { useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { CheckCircle2, PackagePlus, X } from "lucide-react";
import { adminApi, todayIso, type InventorySummaryRow } from "../../lib/adminApi";
import { Card, ErrorNote, Field, NumberField, dateButtonClass, inputClass, primaryButton, secondaryButton } from "./ui";
import StyledDatePicker from "../StyledDatePicker";
import { Spinner } from "../LoadingSpinner";

// Stock that didn't come from a supply order - e.g. a new business entering what it already has on hand.
// Pick an existing product or type a new one; each entry becomes a batch at the cost given (used oldest first,
// like received stock).

const REASONS = ["Opening stock", "Found stock", "Returned by customer", "Stocktake correction", "Other"];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function AddStockPanel({
  inventory,
  onAdded,
  onClose,
}: {
  inventory: InventorySummaryRow[];
  onAdded: () => void;
  onClose: () => void;
}) {
  const { getToken } = useAuth();
  const [name, setName] = useState("");
  const [variant, setVariant] = useState("");
  const [kind, setKind] = useState<"peptide" | "supply">("peptide");
  const [qty, setQty] = useState<number | null>(null);
  const [unitCost, setUnitCost] = useState<number | null>(null);
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const items = inventory.map((r) => r.item);
  const names = useMemo(() => Array.from(new Set(items.map((i) => i.name))).sort(), [items]);
  const sizes = useMemo(
    () => Array.from(new Set(items.filter((i) => same(i.name, name)).map((i) => i.variant).filter(Boolean))).sort(),
    [items, name]
  );
  // The product this is for, if it's already in inventory (same name and size).
  const existing = name.trim() ? items.find((i) => same(i.name, name) && same(i.variant, variant)) : undefined;
  const unit = existing?.unit ?? (kind === "peptide" ? "vial" : "unit");

  const submit = async () => {
    if (!name.trim()) return setError("Enter the product's name.");
    if (!qty || qty <= 0) return setError("Enter how many you have.");
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const itemId =
        existing?.id ??
        (await adminApi.createItem({ kind, name: name.trim(), variant: variant.trim(), unit }, getToken)).id;
      await adminApi.adjust({ itemId, qty, reason, note: note.trim(), unitCostNzd: unitCost, date }, getToken);
      setAdded(`Added ${qty} ${unit}${qty === 1 ? "" : "s"} of ${[name.trim(), variant.trim()].filter(Boolean).join(" ")}.`);
      // Ready for the next product.
      setName("");
      setVariant("");
      setQty(null);
      setUnitCost(null);
      setNote("");
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Add stock"
      actions={
        <button className="text-slate-500 hover:text-white p-1" onClick={onClose} aria-label="Close">
          <X size={15} />
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-400">
          For stock you already have that didn't come through a supply order - e.g. your stock on hand when you start
          using PepBiz. Add one product at a time; the form clears for the next one.
        </p>

        <ErrorNote message={error} />
        {added && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 size={13} /> {added}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Product" hint="Start typing to pick one you already have, or enter a new one.">
            <input
              className={inputClass}
              list="add-stock-names"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. BPC-157"
            />
            <datalist id="add-stock-names">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label="Size" hint="e.g. 10mg, 5ml - leave empty if it doesn't have one.">
            <input
              className={inputClass}
              list="add-stock-sizes"
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              placeholder="e.g. 10mg"
            />
            <datalist id="add-stock-sizes">
              {sizes.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        </div>

        {name.trim() &&
          (existing ? (
            <p className="text-[11px] text-slate-500">Adding to your existing product.</p>
          ) : (
            <div>
              <span className="block text-[11px] font-bold text-white mb-1">New product - what is it?</span>
              <div className="flex gap-2">
                {(["peptide", "supply"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      kind === k ? "border-gold-500/60 text-gold-400 bg-gold-500/10" : "border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {k === "peptide" ? "Peptide" : "Supply"}
                  </button>
                ))}
              </div>
            </div>
          ))}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={`How many (${unit}s)`}>
            <NumberField integer value={qty} onChange={setQty} placeholder="0" />
          </Field>
          <Field label={`Cost per ${unit} (NZD)`} hint="What it cost you - used for profit and stock value.">
            <NumberField price value={unitCost} onChange={setUnitCost} placeholder="0.00" />
          </Field>
          <Field label="Date">
            <StyledDatePicker buttonClassName={dateButtonClass} value={date} onChange={setDate} />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Reason">
            <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Note (optional)">
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        {unitCost == null && qty != null && qty > 0 && (
          <p className="text-[11px] text-amber-400">
            No cost entered - {existing ? "it'll use this product's last cost" : "it'll be counted as $0"}, so profit on
            these will look higher than it really is.
          </p>
        )}

        <div className="flex gap-2">
          <button className={primaryButton} onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner size={13} /> : <PackagePlus size={13} />} Add stock
          </button>
          <button className={secondaryButton} onClick={onClose} disabled={busy}>
            Done
          </button>
        </div>
      </div>
    </Card>
  );
}
