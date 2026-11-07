import React, { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { SECTION_NAME_MAX, normalizeSection, orderSections, sectionLabel, type ItemShopSection } from "../../../shared/shop";
import { inputClass, secondaryButton } from "./ui";

// Pick an item's one category - also its shop tab: Peptides, Supplies, one the owner already made, or a new one.
// `known` is every category already used by other items, so the owner's own ones are offered again.
export default function SectionPicker({
  value,
  known,
  onChange,
}: {
  value: ItemShopSection;
  known: ItemShopSection[];
  onChange: (section: ItemShopSection) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => orderSections(["peptides", "supplies", ...known, value]), [known, value]);

  const add = () => {
    const section = normalizeSection(name);
    if (!section) {
      setError(name.trim() ? "Bundles is only for bundles - choose another name." : "Enter a name for the category.");
      return;
    }
    // "skincare" picks an existing "Skincare" tab rather than making a second one.
    onChange(options.find((s) => s.toLowerCase() === section.toLowerCase()) ?? section);
    setName("");
    setError(null);
    setAdding(false);
  };

  const cancel = () => {
    setName("");
    setError(null);
    setAdding(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-pressed={value === s}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
              value === s ? "border-gold-500/60 text-gold-400 bg-gold-500/10" : "border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {sectionLabel(s)}
          </button>
        ))}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition cursor-pointer"
          >
            <Plus size={12} /> New category
          </button>
        )}
      </div>
      {adding && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <input
              autoFocus
              className={inputClass}
              placeholder="Category name, e.g. Skincare"
              maxLength={SECTION_NAME_MAX}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                } else if (e.key === "Escape") {
                  cancel();
                }
              }}
            />
            <button type="button" className={secondaryButton} onClick={add} disabled={!name.trim()}>
              <Plus size={13} /> Add
            </button>
            <button type="button" className={secondaryButton} onClick={cancel} aria-label="Cancel new category">
              <X size={13} />
            </button>
          </div>
          {error && <span className="block text-[11px] text-rose-400">{error}</span>}
        </div>
      )}
    </div>
  );
}
