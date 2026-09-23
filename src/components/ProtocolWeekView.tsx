/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Check } from "lucide-react";
import { ProtocolBuilderState } from "../hooks/useProtocolBuilderState";
import { getColorClasses, formatShortDate, toIsoDate } from "../lib/protocolBuilderUtils";
import { getHghDoseEquivalent } from "../lib/doseParsing";

export default function ProtocolWeekView({ state }: { state: ProtocolBuilderState }) {
  const { selectedDate, getWeekDays, isDoseCompleted, toggleDoseCompletion } = state;
  const days = getWeekDays(selectedDate);
  const todayIso = toIsoDate(new Date());

  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
      {days.map((day) => {
        const isToday = day.iso === todayIso;
        return (
          <div
            key={day.iso}
            className={`bg-slate-950/60 rounded-xl border p-3 flex flex-col space-y-3 min-h-[160px] ${
              isToday ? "border-gold-500/50" : "border-slate-800"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-extrabold text-slate-400 tracking-wider uppercase">{day.shortDay}</span>
              <span className={`text-[11px] font-mono ${isToday ? "text-gold-400 font-bold" : "text-slate-600"}`}>
                {formatShortDate(day.date)}
              </span>
            </div>

            <div className="flex-1 space-y-2">
              {day.doses.map((d) => {
                const colors = getColorClasses(d.id);
                const completed = isDoseCompleted(day.iso, d.id);
                const hghEquivalent = getHghDoseEquivalent(d.amount, d.unit, d.pep.id);
                return (
                  <div
                    key={d.id}
                    className={`p-2.5 rounded-xl border ${colors.border} ${colors.bg} flex items-start gap-2 text-left`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleDoseCompletion(day.iso, d.id)}
                      aria-pressed={completed}
                      aria-label={completed ? `Mark ${d.name} as not done` : `Mark ${d.name} as done`}
                      className={`protocol-dose-checkbox w-4 h-4 mt-0.5 flex-shrink-0 rounded border-2 flex items-center justify-center transition cursor-pointer ${
                        completed
                          ? "border-gold-400 bg-gold-500/15 text-gold-400"
                          : "border-gold-700/60 text-transparent hover:border-gold-500/80"
                      }`}
                    >
                      <Check size={10} strokeWidth={3} />
                    </button>
                    <div
                      className={`text-[12px] font-extrabold leading-tight flex flex-wrap items-baseline gap-x-1 ${
                        completed ? "text-slate-500 line-through" : "text-white"
                      }`}
                    >
                      <span>{d.name}</span>
                      <span className={completed ? "" : colors.text}>
                        {d.amount}
                        {d.unit}
                        {hghEquivalent && `/${hghEquivalent}`}
                      </span>
                    </div>
                  </div>
                );
              })}
              {day.doses.length === 0 && <div className="text-center py-6 text-[12px] text-slate-600 font-mono italic">No shots</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
