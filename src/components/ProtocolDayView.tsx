/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Check } from "lucide-react";
import { ProtocolBuilderState } from "../hooks/useProtocolBuilderState";
import { getColorClasses, getTimeOfDayBucket, formatSiteName } from "../lib/protocolBuilderUtils";
import { getHghDoseEquivalent } from "../lib/doseParsing";

const BUCKET_ORDER = ["Morning", "Afternoon", "Evening"] as const;

export default function ProtocolDayView({ state }: { state: ProtocolBuilderState }) {
  const { selectedDate, getDosesForDate, isDoseCompleted, toggleDoseCompletion } = state;
  const doses = getDosesForDate(selectedDate);

  const buckets = BUCKET_ORDER.map((bucket) => ({
    bucket,
    doses: doses.filter((d) => getTimeOfDayBucket(d.pep.bestTime) === bucket)
  })).filter((b) => b.doses.length > 0);

  if (doses.length === 0) {
    return (
      <div className="p-10 text-center bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl">
        <p className="text-sm text-slate-400">No doses scheduled for this day.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {buckets.map(({ bucket, doses: bucketDoses }) => (
        <div key={bucket} className="space-y-2">
          <div className="flex items-center gap-2 text-[12px] font-mono tracking-wider uppercase text-slate-500">
            <span>{bucket}</span>
            <span className="text-slate-700">·</span>
            <span>
              {bucketDoses.length} dose{bucketDoses.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-2">
            {bucketDoses.map((d) => {
              const colors = getColorClasses(d.id);
              const completed = isDoseCompleted(selectedDate, d.id);
              const siteName = formatSiteName(d.site);
              const hghEquivalent = getHghDoseEquivalent(d.amount, d.unit, d.pep.id);
              return (
                <div
                  key={d.id}
                  className={`p-4 rounded-xl border flex items-center gap-3 transition ${
                    completed ? "border-gold-500/50 bg-gold-950/10" : "border-slate-800 bg-slate-900/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleDoseCompletion(selectedDate, d.id)}
                    aria-pressed={completed}
                    aria-label={completed ? `Mark ${d.name} as not done` : `Mark ${d.name} as done`}
                    className={`protocol-dose-checkbox w-6 h-6 flex-shrink-0 rounded-md border-2 flex items-center justify-center transition cursor-pointer ${
                      completed
                        ? "border-gold-400 bg-gold-500/15 text-gold-400"
                        : "border-gold-700/60 text-transparent hover:border-gold-500/80"
                    }`}
                  >
                    <Check size={14} strokeWidth={3} />
                  </button>

                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />

                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-bold ${completed ? "text-slate-400 line-through" : "text-white"}`}>{d.name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {d.amount} {d.unit}
                      {hghEquivalent ? `/${hghEquivalent}` : ""} · {d.route}
                      {siteName ? ` · ${siteName}` : ""}
                    </div>
                  </div>

                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 flex-shrink-0">
                    {d.frequency.toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
