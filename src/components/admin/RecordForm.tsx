import React from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { inputClass, secondaryButton } from "./ui";

// A form built from a description of a record's fields, used to edit the large, nested peptide library
// records without a hand-made screen for each part. Values are edited in place on a plain object.

export type FieldSpec =
  | { key: string; label: string; type: "text" | "longtext"; hint?: string; placeholder?: string; lockedWhenEditing?: boolean }
  | { key: string; label: string; type: "number"; hint?: string }
  | { key: string; label: string; type: "boolean"; hint?: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; hint?: string; lockedWhenEditing?: boolean }
  | { key: string; label: string; type: "lines"; hint?: string } // string[], one per line
  | { key: string; label: string; type: "days"; hint?: string } // ["MON", "WED"]
  | { key: string; label: string; type: "group"; fields: FieldSpec[]; optional?: boolean; hint?: string }
  | { key: string; label: string; type: "list"; fields: FieldSpec[]; itemLabel: string; titleKey?: string; hint?: string };

// A titled, collapsible part of a form.
export interface FormSection {
  title: string;
  fields: FieldSpec[];
  open?: boolean;
}

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// An empty value for each field, for new list items and newly added optional groups.
export function blankFor(fields: FieldSpec[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "group") {
      if (!field.optional) out[field.key] = blankFor(field.fields);
    } else if (field.type === "list" || field.type === "lines" || field.type === "days") out[field.key] = [];
    else if (field.type === "number") out[field.key] = 0;
    else if (field.type === "boolean") out[field.key] = false;
    else if (field.type === "select") out[field.key] = field.options[0]?.value ?? "";
    else out[field.key] = "";
  }
  return out;
}

type Obj = Record<string, any>;

export function RecordFormSections({
  sections,
  value,
  onChange,
  isNew,
}: {
  sections: FormSection[];
  value: Obj;
  onChange: (next: Obj) => void;
  isNew: boolean;
}) {
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <details key={section.title} open={section.open} className="group bg-slate-900/40 border border-slate-800 rounded-2xl">
          <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between gap-2 select-none">
            <span className="text-[11px] font-black uppercase tracking-widest text-gold-400">{section.title}</span>
            <ChevronDown size={14} className="text-slate-500 transition group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4">
            <Fields fields={section.fields} value={value} onChange={onChange} isNew={isNew} />
          </div>
        </details>
      ))}
    </div>
  );
}

function Fields({ fields, value, onChange, isNew }: { fields: FieldSpec[]; value: Obj; onChange: (next: Obj) => void; isNew: boolean }) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <FieldEditor key={field.key} field={field} value={value?.[field.key]} onChange={(v) => set(field.key, v)} isNew={isNew} />
      ))}
    </div>
  );
}

function Label({ field }: { field: FieldSpec }) {
  return (
    <span className="block text-[11px] font-bold text-white mb-1">
      {field.label}
      {field.hint && <span className="block font-normal text-slate-500 leading-snug">{field.hint}</span>}
    </span>
  );
}

function FieldEditor({ field, value, onChange, isNew }: { field: FieldSpec; value: any; onChange: (v: unknown) => void; isNew: boolean }) {
  const locked = "lockedWhenEditing" in field && field.lockedWhenEditing && !isNew;

  switch (field.type) {
    case "text":
      return (
        <label className="block">
          <Label field={field} />
          <input
            className={`${inputClass} ${locked ? "opacity-60" : ""}`}
            value={value ?? ""}
            placeholder={field.placeholder}
            disabled={locked}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
    case "longtext":
      return (
        <label className="block">
          <Label field={field} />
          <textarea className={`${inputClass} min-h-[5rem] resize-y`} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
    case "number":
      return (
        <label className="block">
          <Label field={field} />
          <input
            type="number"
            className={inputClass}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </label>
      );
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="accent-amber-500" />
          {field.label}
        </label>
      );
    case "select":
      return (
        <label className="block">
          <Label field={field} />
          <select className={inputClass} value={value ?? ""} disabled={locked} onChange={(e) => onChange(e.target.value)}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "lines":
      return <LinesEditor field={field} value={value} onChange={onChange} />;
    case "days": {
      const days: string[] = Array.isArray(value) ? value : [];
      return (
        <div>
          <Label field={field} />
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((day) => {
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => onChange(on ? days.filter((d) => d !== day) : DAYS.filter((d) => d === day || days.includes(d)))}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold border cursor-pointer transition ${
                    on ? "border-gold-500/60 text-gold-400 bg-gold-500/10" : "border-slate-800 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case "group": {
      if (field.optional && (value == null || typeof value !== "object")) {
        return (
          <div>
            <Label field={field} />
            <button type="button" className={secondaryButton} onClick={() => onChange(blankFor(field.fields))}>
              <Plus size={13} /> Add {field.label.toLowerCase()}
            </button>
          </div>
        );
      }
      return (
        <div className="border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label field={field} />
            {field.optional && (
              <button type="button" className="text-[11px] text-red-400 hover:text-red-300 cursor-pointer" onClick={() => onChange(undefined)}>
                Remove
              </button>
            )}
          </div>
          <Fields fields={field.fields} value={value ?? {}} onChange={onChange} isNew={isNew} />
        </div>
      );
    }
    case "list": {
      const items: Obj[] = Array.isArray(value) ? value : [];
      const setItem = (index: number, next: Obj) => onChange(items.map((item, i) => (i === index ? next : item)));
      const move = (index: number, by: number) => {
        const next = [...items];
        const [item] = next.splice(index, 1);
        next.splice(index + by, 0, item);
        onChange(next);
      };
      return (
        <div>
          <Label field={field} />
          <div className="space-y-2">
            {items.map((item, index) => (
              <details key={index} className="group/item border border-slate-800 rounded-xl">
                <summary className="list-none cursor-pointer px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 truncate">
                    {(field.titleKey && String(item?.[field.titleKey] ?? "").trim()) || `${field.itemLabel} ${index + 1}`}
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      className="text-[11px] text-slate-500 hover:text-slate-300 disabled:opacity-30 cursor-pointer"
                      disabled={index === 0}
                      onClick={(e) => {
                        e.preventDefault();
                        move(index, -1);
                      }}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="text-[11px] text-slate-500 hover:text-slate-300 disabled:opacity-30 cursor-pointer"
                      disabled={index === items.length - 1}
                      onClick={(e) => {
                        e.preventDefault();
                        move(index, 1);
                      }}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${field.itemLabel.toLowerCase()}`}
                      className="text-red-400 hover:text-red-300 cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        onChange(items.filter((_, i) => i !== index));
                      }}
                    >
                      <X size={13} />
                    </button>
                    <ChevronDown size={13} className="text-slate-500 transition group-open/item:rotate-180" />
                  </span>
                </summary>
                <div className="px-3 pb-3">
                  <Fields fields={field.fields} value={item ?? {}} onChange={(next) => setItem(index, next)} isNew={isNew} />
                </div>
              </details>
            ))}
            <button type="button" className={secondaryButton} onClick={() => onChange([...items, blankFor(field.fields)])}>
              <Plus size={13} /> Add {field.itemLabel.toLowerCase()}
            </button>
          </div>
        </div>
      );
    }
  }
}

// One item per line. Kept as typed (including blank lines) while editing; blanks are dropped on save
// by cleanRecord.
function LinesEditor({ field, value, onChange }: { field: FieldSpec; value: any; onChange: (v: unknown) => void }) {
  const lines: string[] = Array.isArray(value) ? value : [];
  return (
    <label className="block">
      <Label field={{ ...field, hint: field.hint ?? "One per line." }} />
      <textarea
        className={`${inputClass} min-h-[4.5rem] resize-y`}
        value={lines.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
      />
    </label>
  );
}

// Tidies a record before saving: trims text, drops blank lines from line lists.
export function cleanRecord<T>(value: T): T {
  if (Array.isArray(value)) {
    const items = value.map(cleanRecord);
    return (items.every((i) => typeof i === "string") ? items.filter((i) => i !== "") : items) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, cleanRecord(v)])
    ) as T;
  }
  return (typeof value === "string" ? value.trim() : value) as T;
}
