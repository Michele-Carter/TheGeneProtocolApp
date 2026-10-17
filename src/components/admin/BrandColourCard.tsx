import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { Check, Palette, RotateCcw, Save } from "lucide-react";
import { businessApi, type BusinessContext } from "../../lib/business";
import { BRAND_PRESETS, PEPBIZ_GOLD, applyBrandColour, colourWarning, isHexColour } from "../../lib/brandColour";
import { Card, ErrorNote, inputClass, primaryButton, secondaryButton } from "./ui";
import { Spinner } from "../LoadingSpinner";

// Business page: the business's own colour in place of PepBiz gold, for its app and its shop. While picking, the
// whole app shows the colour as a preview; leaving without saving puts the saved colour back.
export default function BrandColourCard({ context, onChanged }: { context: BusinessContext; onChanged: () => void }) {
  const { getToken } = useAuth();
  // The colour last saved (this page can outlive the business details it was opened with).
  const [saved, setSaved] = useState(context.business.brandColor || PEPBIZ_GOLD);
  const committed = useRef(saved);
  const [draft, setDraft] = useState(saved);
  const [typed, setTyped] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Preview the colour across the app while choosing; put the saved one back when leaving the page.
  useEffect(() => {
    applyBrandColour(draft);
  }, [draft]);
  useEffect(() => () => applyBrandColour(committed.current), []);

  const choose = (hex: string) => {
    setDraft(hex.toLowerCase());
    setTyped(hex.toLowerCase());
    setNotice(null);
  };

  const save = async (hex: string) => {
    setBusy(true);
    setError(null);
    try {
      await businessApi.setBrandColor(hex.toLowerCase() === PEPBIZ_GOLD ? "" : hex, getToken);
      committed.current = hex.toLowerCase();
      setSaved(hex.toLowerCase());
      setNotice(hex.toLowerCase() === PEPBIZ_GOLD ? "Back to PepBiz gold." : "Saved - your app and shop now use this colour.");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changed = draft !== saved;
  const warning = colourWarning(draft);

  return (
    <Card title="Brand colour">
      <div className="space-y-4">
        <p className="text-xs text-slate-400">
          Use your brand's colour for buttons and highlights in your app and your shop, in place of the gold. Pick one below
          or choose your exact colour - the whole app previews it as you go.
        </p>
        <ErrorNote message={error} />
        {notice && <p className="text-xs text-emerald-400">{notice}</p>}

        {/* Quick picks */}
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Brand colour">
          {BRAND_PRESETS.map((p) => {
            const selected = draft === p.hex;
            return (
              <button
                key={p.hex}
                role="radio"
                aria-checked={selected}
                title={p.name}
                onClick={() => choose(p.hex)}
                className={`theme-keep-bg h-9 w-9 rounded-full border-2 cursor-pointer flex items-center justify-center transition ${
                  selected ? "border-white scale-110" : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: p.hex }}
              >
                {selected && <Check size={15} className="text-white drop-shadow" />}
                <span className="sr-only">{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* Any colour */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="theme-keep-bg relative h-10 w-14 rounded-lg border border-slate-700 overflow-hidden cursor-pointer" title="Choose any colour">
            <input type="color" value={draft} onChange={(e) => choose(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            <span className="block h-full w-full" style={{ backgroundColor: draft }} />
          </label>
          <div className="flex items-center gap-1.5">
            <Palette size={14} className="text-slate-500" />
            <input
              className={`${inputClass} w-32 font-mono`}
              value={typed}
              maxLength={7}
              placeholder="#e0457b"
              aria-label="Colour code"
              onChange={(e) => {
                const value = e.target.value.trim();
                setTyped(value);
                const hex = value.startsWith("#") ? value : `#${value}`;
                if (isHexColour(hex)) setDraft(hex.toLowerCase());
              }}
            />
          </div>
          <span className="text-[11px] text-slate-500">Your colour code, if you have one (e.g. from your logo).</span>
        </div>

        {warning && <p className="text-xs text-amber-300">{warning}</p>}

        {/* How it looks */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 w-full">Preview</span>
          <span className="rounded-xl px-4 py-2 text-xs font-bold bg-gold-500">Add to cart</span>
          <span className="rounded-xl px-3.5 py-2 text-xs font-extrabold text-gold-400 border border-gold-500/60">Inventory</span>
          <span className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest bg-gold-500/15 text-gold-300 border border-gold-500/40">
            Healing
          </span>
          <span className="text-sm font-black text-gold-400">NZ$45.00</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className={primaryButton} disabled={busy || !changed} onClick={() => void save(draft)}>
            {busy ? <Spinner size={13} /> : <Save size={13} />} Save colour
          </button>
          {changed && (
            <button className={secondaryButton} disabled={busy} onClick={() => choose(saved)}>
              Undo
            </button>
          )}
          {saved !== PEPBIZ_GOLD && !changed && (
            <button className={secondaryButton} disabled={busy} onClick={() => void (choose(PEPBIZ_GOLD), save(PEPBIZ_GOLD))}>
              <RotateCcw size={13} /> Back to gold
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
