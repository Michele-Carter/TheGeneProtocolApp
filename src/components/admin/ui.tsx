import React, { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { CostEntry } from "../../../shared/landedCost";

export const inputClass =
  "w-full bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm text-slate-400 placeholder:text-slate-600 focus:outline-none focus:border-gold-500/60 transition";

export const buttonClass =
  "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
export const primaryButton = `${buttonClass} border-gold-500/60 text-gold-400 bg-gold-500/10 hover:bg-gold-500/20`;
export const secondaryButton = `${buttonClass} border-slate-700 text-slate-300 hover:text-white hover:border-slate-500`;
export const dangerButton = `${buttonClass} border-red-900/70 text-red-400 hover:bg-red-950/40`;

export function newId() {
  return crypto.randomUUID();
}

export function Card({
  title,
  children,
  className = "",
  actions,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className={`bg-slate-900/40 border border-slate-800 rounded-2xl p-4 md:p-5 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {title && <h3 className="text-[11px] font-black uppercase tracking-widest text-gold-400">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] font-bold text-white">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500 leading-snug">{hint}</span>}
    </label>
  );
}

// Number input that lets you type freely ("0.", "-", "") and reports a number or null.
export function NumberField({
  value,
  onChange,
  placeholder,
  className = "",
  allowNegative = false,
  integer = false,
  disabled,
  ariaLabel,
  price,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
  allowNegative?: boolean;
  integer?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  /** Marks the input as a price field (data-price), e.g. so it can be focused when editing a line. */
  price?: boolean;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));

  useEffect(() => {
    const parsed = text.trim() === "" ? null : Number(text);
    if (parsed !== value && !(parsed != null && Number.isNaN(parsed))) {
      setText(value == null ? "" : String(value));
    }
    // Only resync when the value changes from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      value={text}
      disabled={disabled}
      aria-label={ariaLabel}
      data-price={price || undefined}
      placeholder={placeholder}
      className={`${inputClass} text-right tabular-nums ${className}`}
      onChange={(event) => {
        const raw = event.target.value.replace(/[$,\s]/g, "");
        const pattern = integer
          ? allowNegative
            ? /^-?\d*$/
            : /^\d*$/
          : allowNegative
            ? /^-?\d*\.?\d*$/
            : /^\d*\.?\d*$/;
        if (!pattern.test(raw)) return;
        setText(raw);
        if (raw === "" || raw === "-" || raw === "." || raw === "-.") {
          onChange(null);
        } else {
          onChange(Number(raw));
        }
      }}
    />
  );
}

// Editable list of labelled amounts (freight, fees, customs...).
export function CostEntryList({
  entries,
  onChange,
  suggestions,
  prefix,
  disabled,
  addLabel,
}: {
  entries: CostEntry[];
  onChange: (entries: CostEntry[]) => void;
  suggestions: string[];
  prefix: string;
  disabled?: boolean;
  addLabel: string;
}) {
  const listId = `cost-suggestions-${suggestions.join("-").replace(/\W/g, "")}`;
  return (
    <div className="space-y-1.5">
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {entries.map((entry, index) => (
        <div key={entry.id} className="flex items-center gap-2">
          <input
            className={inputClass}
            list={listId}
            value={entry.label}
            disabled={disabled}
            placeholder="Description"
            onChange={(event) => {
              const next = [...entries];
              next[index] = { ...entry, label: event.target.value };
              onChange(next);
            }}
          />
          <span className="text-[11px] text-slate-500 font-mono">{prefix}</span>
          <NumberField
            className="max-w-[7.5rem]"
            allowNegative
            disabled={disabled}
            ariaLabel={`${entry.label || "Cost"} amount`}
            value={entry.amount}
            onChange={(amount) => {
              const next = [...entries];
              next[index] = { ...entry, amount: amount ?? 0 };
              onChange(next);
            }}
          />
          {!disabled && (
            <button
              type="button"
              className="flex-shrink-0 p-1.5 text-slate-500 hover:text-red-400 transition cursor-pointer"
              aria-label="Remove"
              onClick={() => onChange(entries.filter((e) => e.id !== entry.id))}
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-gold-400 transition cursor-pointer"
          onClick={() => onChange([...entries, { id: newId(), label: "", amount: 0 }])}
        >
          <Plus size={12} />
          {addLabel}
        </button>
      )}
    </div>
  );
}

export function StatRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  tone?: "good" | "bad" | "muted";
}) {
  const toneClass =
    tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : tone === "muted" ? "text-slate-500" : "text-slate-100";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs border-b border-slate-800/60 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className={`tabular-nums ${strong ? "font-black" : "font-semibold"} ${toneClass}`}>{value}</span>
    </div>
  );
}

export function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-NZ", { month: "long", year: "numeric" });
}

// Month picker styled as a button that reads "Select month" when empty (no separate
// "all time" toggle needed - an empty value already means all time everywhere it's used).
// The real <input type="month"> stays in the DOM (pointer-events disabled) so its native
// picker can be opened with showPicker() from the visible button's click handler.
export function MonthFilter({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={openPicker}
        className={`${inputClass} w-auto min-w-[10rem] pr-7 text-left cursor-pointer ${
          value != null ? "border-gold-500/60 text-gold-300" : ""
        }`}
      >
        {value != null ? formatMonth(value) : "Select month"}
      </button>
      <input
        ref={inputRef}
        type="month"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="absolute inset-0 opacity-0 pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
      />
      {value != null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-2 text-slate-500 hover:text-white transition cursor-pointer"
          aria-label="Clear month filter"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// Small coloured dot + label, for compact multi-state status columns (payment, shipping...).
export function StatusDot({ tone, children }: { tone: "good" | "warn" | "muted"; children: React.ReactNode }) {
  const dotClass = tone === "good" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : "bg-slate-500";
  const textClass = tone === "good" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-slate-400";
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
      <span className={textClass}>{children}</span>
    </span>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="text-xs text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">{message}</div>
  );
}
