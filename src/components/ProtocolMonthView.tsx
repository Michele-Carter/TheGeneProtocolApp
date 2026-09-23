/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Check } from "lucide-react";
import { ProtocolBuilderState } from "../hooks/useProtocolBuilderState";
import { getAccentHex, getColorClasses, toIsoDate } from "../lib/protocolBuilderUtils";
import { getHghDoseEquivalent } from "../lib/doseParsing";

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ProtocolMonthView({ state }: { state: ProtocolBuilderState }) {
  const { selectedDate, getMonthGrid, setSelectedDate, setTimelineViewMode, isDoseCompleted, toggleDoseCompletion } = state;
  const cells = getMonthGrid(selectedDate);
  const todayIso = toIsoDate(new Date());

  const goToDay = (iso: string) => {
    setSelectedDate(iso);
    setTimelineViewMode("day");
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
        {DAY_HEADERS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((cell) => {
          const isToday = cell.iso === todayIso;
          return (
            <div
              key={cell.iso}
              className={`min-h-[56px] sm:min-h-[112px] rounded-xl border p-2 flex flex-col items-start text-left transition ${
                cell.inMonth ? "bg-slate-950/60 border-slate-800 hover:border-gold-500/50" : "bg-slate-950/20 border-slate-900 opacity-40"
              } ${isToday ? "!border-gold-500/70" : ""}`}
            >
              <button
                type="button"
                onClick={() => goToDay(cell.iso)}
                className="flex items-center justify-between w-full cursor-pointer"
              >
                <span className={`text-xs font-mono ${isToday ? "text-gold-400 font-bold" : "text-slate-400"}`}>{cell.date.getDate()}</span>
                {cell.doses.length > 0 && <span className="text-[11px] font-mono font-bold text-gold-400">{cell.doses.length}</span>}
              </button>

              {/* Mobile: dot indicators only — tap the day to see/check off the full list. */}
              {cell.doses.length > 0 && (
                <div className="flex sm:hidden flex-wrap gap-1 mt-1.5">
                  {cell.doses.slice(0, 6).map((d) => (
                    <span key={d.id} className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: getAccentHex(d.id) }} />
                  ))}
                </div>
              )}

              {/* Desktop/tablet: full checklist with names. */}
              <div className="hidden sm:flex w-full flex-col gap-1 mt-1">
                {cell.doses.map((d) => {
                  const completed = isDoseCompleted(cell.iso, d.id);
                  const colors = getColorClasses(d.id);
                  const hghEquivalent = getHghDoseEquivalent(d.amount, d.unit, d.pep.id);
                  return (
                    <div key={d.id} className="flex items-center gap-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleDoseCompletion(cell.iso, d.id)}
                        aria-pressed={completed}
                        aria-label={completed ? `Mark ${d.name} as not done` : `Mark ${d.name} as done`}
                        className={`protocol-dose-checkbox w-3 h-3 flex-shrink-0 rounded-sm border flex items-center justify-center transition cursor-pointer ${
                          completed
                            ? "border-gold-400 bg-gold-500/20 text-gold-400"
                            : "border-gold-700/60 text-transparent hover:border-gold-500/80"
                        }`}
                      >
                        <Check size={8} strokeWidth={4} />
                      </button>
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${completed ? "opacity-40" : ""}`}
                        style={{ backgroundColor: getAccentHex(d.id) }}
                      />
                      <span className="text-[10px] break-words">
                        <span className={completed ? "text-slate-500 line-through" : "text-slate-300"}>{d.name}</span>{" "}
                        <span className={completed ? "text-slate-500 line-through" : colors.text}>
                          {d.amount}
                          {d.unit}
                          {hghEquivalent && `/${hghEquivalent}`}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
