import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { CheckCircle2, Percent, Save, XCircle } from "lucide-react";
import { BANNER_MAX, storewideText, type StorewideSale } from "../../../shared/specials";
import { adminApi, cash } from "../../lib/adminApi";
import { Card, ErrorNote, Field, NumberField, dangerButton, dateButtonClass, inputClass, primaryButton, secondaryButton } from "./ui";
import { BannerColourPicker } from "./SpecialEditor";
import { SaleBanner } from "../shop/parts";
import StyledDatePicker from "../StyledDatePicker";
import LoadingSpinner, { Spinner } from "../LoadingSpinner";
import { businessToday, formatDate, homeCurrency } from "../../lib/locale";

// A percentage off everything in the shop - optionally only on orders of at least a minimum spend, until an end
// date - with a banner across the top of the shop in the owner's words and colour (shared/specials.ts).

interface Draft {
  percentOff: number | null;
  minSpendNzd: number | null; // blank = any order
  endsOn: string; // "" = until it's ended
  bannerText: string;
  bannerColour: string; // "" = brand colour
}

const toDraft = (sale: StorewideSale | null): Draft => ({
  percentOff: sale?.percentOff ?? null,
  minSpendNzd: sale && sale.minSpendNzd > 0 ? sale.minSpendNzd : null,
  endsOn: sale?.endsOn ?? "",
  bannerText: sale?.bannerText ?? "",
  bannerColour: sale?.bannerColour ?? "",
});

// The sale to save, or what's missing.
function fromDraft(d: Draft, today: string): { sale: StorewideSale; error?: undefined } | { sale?: undefined; error: string } {
  if (d.percentOff == null || d.percentOff <= 0 || d.percentOff >= 100) return { error: "Enter the % off - between 1 and 99." };
  if (d.endsOn && d.endsOn < today) return { error: "That end date has already passed - pick today or later, or clear it." };
  return {
    sale: {
      percentOff: d.percentOff,
      minSpendNzd: d.minSpendNzd ?? 0,
      endsOn: d.endsOn || null,
      bannerText: d.bannerText.trim(),
      bannerColour: d.bannerColour,
    },
  };
}

const longDate = (iso: string) => formatDate(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function StorewideSaleView() {
  const { getToken } = useAuth();
  const [saved, setSaved] = useState<{ sale: StorewideSale | null; on: boolean } | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft(null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "end">(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    adminApi
      .getStorewide(getToken)
      .then((result) => {
        setSaved(result);
        setDraft(toDraft(result.sale));
      })
      .catch((e) => setError((e as Error).message));
  }, [getToken]);

  if (!saved) return error ? <ErrorNote message={error} /> : <LoadingSpinner label="Loading your storewide sale..." />;

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const today = businessToday();
  const result = fromDraft(draft, today);
  const dirty = JSON.stringify(result.sale ?? null) !== JSON.stringify(saved.sale);
  const ended = saved.sale != null && !saved.on;

  const run = async (what: "save" | "end", sale: StorewideSale | null) => {
    setBusy(what);
    setError(null);
    try {
      const next = await adminApi.saveStorewide(sale, getToken);
      setSaved(next);
      // Ending it keeps what was typed, so the same sale is easy to run again.
      if (next.sale) setDraft(toDraft(next.sale));
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <Card title="Right now">
        {saved.on && saved.sale ? (
          <div className="flex items-start gap-2.5 text-sm">
            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white">Your sale is on: {storewideText(saved.sale, cash)}</div>
              <div className="text-slate-400">
                {saved.sale.endsOn ? `Runs to the end of ${longDate(saved.sale.endsOn)}.` : "Runs until you end it."}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 text-sm">
            <Percent size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white">No storewide sale running</div>
              <div className="text-slate-400">
                {ended && saved.sale?.endsOn
                  ? `Your last sale ended on ${longDate(saved.sale.endsOn)}. Pick a new end date below to run it again.`
                  : "Set one up below - it starts as soon as you save it."}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card title={saved.on ? "Your sale" : "Start a sale"}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <Field label="% off everything">
              <NumberField value={draft.percentOff} onChange={(v) => set({ percentOff: v })} placeholder="e.g. 15" />
            </Field>
            <Field
              label={`Minimum spend (${homeCurrency()})`}
              hint="Leave blank for any order. Counts what the items cost after any specials."
            >
              <NumberField value={draft.minSpendNzd} onChange={(v) => set({ minSpendNzd: v })} placeholder="Any order" />
            </Field>
          </div>

          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-white">Ends on (optional)</span>
            <div className="flex items-center gap-2">
              <StyledDatePicker
                className="flex-1"
                buttonClassName={dateButtonClass}
                value={draft.endsOn}
                onChange={(v) => set({ endsOn: v })}
                ariaLabel="Last day of the sale"
              />
              {draft.endsOn && (
                <button type="button" className={secondaryButton} onClick={() => set({ endsOn: "" })}>
                  No end date
                </button>
              )}
            </div>
            <span className="block text-[11px] text-slate-500 leading-snug">
              The sale runs to the end of this day, then switches itself off. Leave blank to run it until you end it.
            </span>
          </div>

          <Field label="Banner wording (optional)" hint="Shown across the top of your shop. Leave blank to show the deal.">
            <input
              className={inputClass}
              value={draft.bannerText}
              maxLength={BANNER_MAX}
              onChange={(e) => set({ bannerText: e.target.value })}
              placeholder={result.sale ? storewideText(result.sale, cash) : "e.g. Spring sale - 15% off everything"}
            />
            <span className="block text-right text-[10px] text-slate-500 tabular-nums">
              {draft.bannerText.length}/{BANNER_MAX}
            </span>
          </Field>

          <BannerColourPicker value={draft.bannerColour} onChange={(bannerColour) => set({ bannerColour })} />

          {result.sale ? (
            <div className="space-y-1">
              <span className="block text-[11px] font-bold text-white">Preview</span>
              <SaleBanner sale={result.sale} />
            </div>
          ) : (
            draft.percentOff != null && <p className="text-[11px] text-amber-300">{result.error}</p>
          )}

          <p className="text-[11px] text-slate-500 leading-snug">
            Items and bundles with their own special get the special or the sale - whichever saves the customer more on
            that item, never both. Orders already sent keep the deal they were sent with, and the saving goes on the
            customer order as its discount when you confirm it.
          </p>

          <ErrorNote message={error} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              className={primaryButton}
              onClick={() => result.sale && run("save", result.sale)}
              disabled={busy != null || !result.sale || (saved.on && !dirty)}
            >
              {busy === "save" ? <Spinner size={13} /> : <Save size={13} />} {saved.on ? "Save changes" : "Start sale"}
            </button>
            {justSaved && <span className="text-xs font-bold text-emerald-400">Saved</span>}
            {saved.sale && (
              <button className={`${dangerButton} ml-auto`} onClick={() => run("end", null)} disabled={busy != null}>
                {busy === "end" ? <Spinner size={13} /> : <XCircle size={13} />} {saved.on ? "End sale now" : "Clear"}
              </button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
