import React, { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { DEFAULT_SHOP_CATEGORIES, normalizeCategories } from "../../../shared/shop";
import { inputClass, secondaryButton } from "./ui";

// Tick any number of shop categories. `known` adds categories already used elsewhere (including custom ones).
export default function CategoryPicker({
  value,
  known,
  onChange,
}: {
  value: string[];
  known: string[];
  onChange: (categories: string[]) => void;
}) {
  const [custom, setCustom] = useState("");
  const options = useMemo(
    () => normalizeCategories([...DEFAULT_SHOP_CATEGORIES, ...known, ...value]).sort((a, b) => a.localeCompare(b)),
    [known, value]
  );
  const selected = new Set(value.map((c) => c.toLowerCase()));

  const toggle = (category: string) =>
    onChange(
      selected.has(category.toLowerCase())
        ? value.filter((c) => c.toLowerCase() !== category.toLowerCase())
        : [...value, category]
    );

  const addCustom = () => {
    if (!custom.trim()) return;
    onChange(normalizeCategories([...value, custom]));
    setCustom("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((category) => {
          const on = selected.has(category.toLowerCase());
          return (
            <button
              key={category}
              type="button"
              onClick={() => toggle(category)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                on
                  ? "border-gold-500/70 text-gold-400 bg-gold-500/10"
                  : "border-slate-800 text-slate-400 hover:text-white hover:border-slate-600"
              }`}
            >
              {on && <Check size={11} />}
              {category}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder="Add another category…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <button type="button" className={secondaryButton} onClick={addCustom} disabled={!custom.trim()}>
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}
