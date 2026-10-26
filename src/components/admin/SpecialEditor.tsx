import React from "react";
import { Check, Palette } from "lucide-react";
import { RIBBON_MAX, dealText, defaultRibbon, type Special } from "../../../shared/specials";
import { BRAND_PRESETS, isHexColour } from "../../lib/brandColour";
import { ProductImage, specialRibbon } from "../shop/parts";
import { Field, NumberField, inputClass } from "./ui";

// Inventory > item > Shop: a special on this size - a percentage off (optionally from a minimum quantity) or buy X
// get Y free - and the ribbon shown across its photo in the shop, in the owner's words and colour.

type Kind = "none" | Special["kind"];

// What's being typed, which may not be a complete special yet.
export interface SpecialDraft {
  kind: Kind;
  percentOff: number | null;
  minQty: number | null; // blank = any quantity
  buy: number | null;
  free: number | null;
  ribbonText: string;
  ribbonColour: string; // "" = brand colour
}

export function toDraft(special: Special | null): SpecialDraft {
  return {
    kind: special?.kind ?? "none",
    percentOff: special?.kind === "percent" ? special.percentOff : null,
    minQty: special?.kind === "percent" && special.minQty > 1 ? special.minQty : null,
    buy: special?.kind === "free" ? special.buy : null,
    free: special?.kind === "free" ? special.free : 1,
    ribbonText: special?.ribbonText ?? "",
    ribbonColour: special?.ribbonColour ?? "",
  };
}

// The special to save, or what's missing.
export function fromDraft(
  d: SpecialDraft
): { special: Special | null; error?: undefined } | { special?: undefined; error: string } {
  const ribbon = { ribbonText: d.ribbonText.trim(), ribbonColour: d.ribbonColour };
  const whole = (n: number | null) => n != null && Number.isInteger(n) && n >= 1 && n <= 99;
  if (d.kind === "none") return { special: null };
  if (d.kind === "percent") {
    if (d.percentOff == null || d.percentOff <= 0 || d.percentOff >= 100) return { error: "Enter the % off - between 1 and 99." };
    if (d.minQty != null && !whole(d.minQty)) return { error: "The minimum to buy should be a whole number, or leave it blank." };
    return { special: { kind: "percent", percentOff: d.percentOff, minQty: d.minQty ?? 1, ...ribbon } };
  }
  if (!whole(d.buy) || !whole(d.free)) return { error: "Enter how many to buy and how many they get free (whole numbers)." };
  return { special: { kind: "free", buy: d.buy!, free: d.free!, ...ribbon } };
}

const KINDS: { id: Kind; label: string }[] = [
  { id: "none", label: "None" },
  { id: "percent", label: "% off" },
  { id: "free", label: "Buy & get free" },
];

const choiceButton = (on: boolean) =>
  `flex-1 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
    on ? "border-gold-500/60 text-gold-400 bg-gold-500/10" : "border-slate-800 text-slate-400 hover:text-white"
  }`;

export default function SpecialEditor({
  draft,
  onChange,
  image,
  unit,
}: {
  draft: SpecialDraft;
  onChange: (draft: SpecialDraft) => void;
  image: string | undefined; // the item's photo, for the ribbon preview
  unit: string;
}) {
  const set = (patch: Partial<SpecialDraft>) => onChange({ ...draft, ...patch });
  const result = fromDraft(draft);
  const special = result.special ?? null;
  const units = `${unit}s`;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <span className="block text-[11px] font-bold text-white">Special</span>
        <div className="flex gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => set({ kind: k.id })}
              aria-pressed={draft.kind === k.id}
              className={choiceButton(draft.kind === k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {draft.kind === "percent" && (
        <div className="grid grid-cols-2 gap-2 items-start">
          <Field label="% off">
            <NumberField value={draft.percentOff} onChange={(v) => set({ percentOff: v })} placeholder="e.g. 20" />
          </Field>
          <Field label={`When buying at least (${units})`} hint="Leave blank for any quantity.">
            <NumberField integer value={draft.minQty} onChange={(v) => set({ minQty: v })} placeholder="Any" />
          </Field>
        </div>
      )}

      {draft.kind === "free" && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span>Buy</span>
          <NumberField integer ariaLabel="How many to buy" value={draft.buy} onChange={(v) => set({ buy: v })} placeholder="2" className="w-16" />
          <span>get</span>
          <NumberField integer ariaLabel="How many free" value={draft.free} onChange={(v) => set({ free: v })} placeholder="1" className="w-16" />
          <span>free</span>
        </div>
      )}

      {draft.kind !== "none" && (
        <>
          {special ? (
            <p className="text-[11px] text-slate-500">
              Customers see: <span className="text-slate-300 font-bold">{dealText(special)}</span>
              {special.kind === "free" &&
                ` - every ${special.buy + special.free} in their cart, ${special.free} ${special.free === 1 ? "is" : "are"} free.`}
            </p>
          ) : (
            <p className="text-[11px] text-amber-300">{result.error}</p>
          )}

          <Field label="Banner wording" hint="Shown across the photo in the shop. Short works best - leave blank to show the deal.">
            <input
              className={inputClass}
              value={draft.ribbonText}
              maxLength={RIBBON_MAX}
              onChange={(e) => set({ ribbonText: e.target.value })}
              placeholder={special ? defaultRibbon(special) : "e.g. Sale"}
            />
            <span className="block text-right text-[10px] text-slate-500 tabular-nums">
              {draft.ribbonText.length}/{RIBBON_MAX}
            </span>
          </Field>

          <div className="space-y-1.5">
            <span className="block text-[11px] font-bold text-white">Banner colour</span>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Banner colour">
              <button
                type="button"
                role="radio"
                aria-checked={draft.ribbonColour === ""}
                onClick={() => set({ ribbonColour: "" })}
                className={`theme-keep-bg h-8 px-3 rounded-full border-2 text-[11px] font-black bg-gold-500 cursor-pointer flex items-center gap-1 transition ${
                  draft.ribbonColour === "" ? "border-white" : "border-transparent hover:scale-105"
                }`}
              >
                {draft.ribbonColour === "" && <Check size={12} />} Brand colour
              </button>
              {BRAND_PRESETS.map((p) => {
                const selected = draft.ribbonColour === p.hex;
                return (
                  <button
                    key={p.hex}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={p.name}
                    onClick={() => set({ ribbonColour: p.hex })}
                    className={`theme-keep-bg h-8 w-8 rounded-full border-2 cursor-pointer flex items-center justify-center transition ${
                      selected ? "border-white scale-110" : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: p.hex }}
                  >
                    {selected && <Check size={13} className="text-white drop-shadow" />}
                    <span className="sr-only">{p.name}</span>
                  </button>
                );
              })}
              <label
                className="theme-keep-bg relative h-8 w-12 rounded-lg border border-slate-700 overflow-hidden cursor-pointer flex items-center justify-center"
                title="Choose any colour"
              >
                <input
                  type="color"
                  value={isHexColour(draft.ribbonColour) ? draft.ribbonColour : "#ef4444"}
                  onChange={(e) => set({ ribbonColour: e.target.value.toLowerCase() })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                {isHexColour(draft.ribbonColour) && !BRAND_PRESETS.some((p) => p.hex === draft.ribbonColour) ? (
                  <span className="block h-full w-full" style={{ backgroundColor: draft.ribbonColour }} />
                ) : (
                  <Palette size={14} className="text-slate-400" />
                )}
              </label>
            </div>
          </div>

          {special && (
            <div className="space-y-1">
              <span className="block text-[11px] font-bold text-white">Preview</span>
              <ProductImage src={image} alt="" className="w-40 h-40 border border-slate-800" ribbon={specialRibbon(special)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
