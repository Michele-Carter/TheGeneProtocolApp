/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import { BookOpen, ArrowRight, Search, ShieldCheck } from "lucide-react";
import { PEPTIDEDB_ENTRIES } from "../../data/peptideDb";
import { getColorClasses } from "../../lib/protocolBuilderUtils";

const normalize = (text: string) => text.toLowerCase().trim();

export default function PeptideDbBrowse({ onSelect }: { onSelect: (slug: string) => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    PEPTIDEDB_ENTRIES.forEach((entry) => entry.categories.forEach((c) => set.add(c)));
    return [...set].sort();
  }, []);

  const filteredEntries = useMemo(() => {
    const query = normalize(searchQuery);
    return PEPTIDEDB_ENTRIES.filter((entry) => {
      if (activeCategory && !entry.categories.includes(activeCategory)) return false;
      if (!query) return true;
      const haystack = normalize(`${entry.name} ${entry.subtitle} ${entry.overview} ${entry.categories.join(" ")}`);
      return haystack.includes(query);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [searchQuery, activeCategory]);

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <span className="inline-flex items-center px-4 py-1.5 bg-zinc-800/60 border border-zinc-700 text-gold-400 rounded-full text-xs font-mono tracking-wider uppercase gap-2">
            <BookOpen size={13} className="text-gold-400" />
            PEPTIDE DATABASE
          </span>
        </div>
        <h1 className="text-3xl md:text-5xl font-black text-white leading-tight tracking-tight max-w-3xl mx-auto">
          Research peptides. <span className="text-gold-400">Browse the reference library.</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-2xl mx-auto leading-relaxed">
          A research reference library compiled from peptide-db.com — molecular data, dosing protocols,
          interactions, and safety information for {PEPTIDEDB_ENTRIES.length} peptides.
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search peptides by name, category, or benefit..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-gold-500"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition cursor-pointer border ${
                activeCategory === null
                  ? "bg-gold-500/15 border-gold-500/60 text-gold-300"
                  : "bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-white hover:border-slate-700"
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category === activeCategory ? null : category)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition cursor-pointer border capitalize ${
                  activeCategory === category
                    ? "bg-gold-500/15 border-gold-500/60 text-gold-300"
                    : "bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-white hover:border-slate-700"
                }`}
              >
                {category.replace(/-/g, " ")}
              </button>
            ))}
          </div>
        )}
      </div>

      {filteredEntries.length === 0 ? (
        <div className="p-10 text-center bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl">
          <p className="text-sm text-slate-400">No peptides match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredEntries.map((entry) => {
            const peptideColors = getColorClasses(entry.slug);
            return (
            <div
              key={entry.slug}
              onClick={() => onSelect(entry.slug)}
              className="p-5 bg-slate-900/40 rounded-2xl border border-slate-800/80 hover:border-gold-500/50 hover:bg-gold-950/5 transition-all duration-300 cursor-pointer flex flex-col justify-between hover:-translate-y-0.5 group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-black text-white leading-tight flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${peptideColors.dot}`} />
                    {entry.name}
                  </h3>
                  {entry.fdaApproved && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                      <ShieldCheck size={9} />
                      FDA
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-mono leading-relaxed">{entry.subtitle}</p>
                <p className="text-sm text-slate-400 leading-relaxed line-clamp-3">{entry.overview}</p>
                <div className="flex flex-wrap gap-1">
                  {entry.categories.slice(0, 3).map((category) => {
                    const categoryColors = getColorClasses(category);
                    return (
                      <span
                        key={category}
                        className={`px-1.5 py-0.5 rounded border bg-transparent ${categoryColors.borderStrong} ${categoryColors.text} text-[10px] font-mono capitalize`}
                      >
                        {category.replace(/-/g, " ")}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-900/60 space-y-2">
                <div className="text-[11px] text-slate-500">
                  <span className="text-slate-600">Typical dose: </span>
                  <span className="text-slate-300 font-mono">{entry.quickStats.typicalDose || "See protocol"}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 group-hover:text-gold-400 transition-colors">
                  <span>View Details</span>
                  <ArrowRight size={10} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
