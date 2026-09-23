/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, Settings, Sparkles } from "lucide-react";
import { ProtocolBuilderState } from "../hooks/useProtocolBuilderState";
import { ProtocolSubView } from "./ProtocolBuilder";
import { formatLongDate, formatShortDate, startOfWeek, addDays, parseIsoDate, MONTHS } from "../lib/protocolBuilderUtils";
import ProtocolDayView from "./ProtocolDayView";
import ProtocolWeekView from "./ProtocolWeekView";
import ProtocolMonthView from "./ProtocolMonthView";

const VIEW_TABS = ["day", "week", "month"] as const;

export default function CurrentProtocolView({
  state,
  onNavigate,
  onBack
}: {
  state: ProtocolBuilderState;
  onNavigate: (view: ProtocolSubView) => void;
  onBack: () => void;
}) {
  const {
    selectedPeptides,
    timelineGenerated,
    timeframeWeeks,
    protocolStartDateObj,
    timelineViewMode,
    setTimelineViewMode,
    selectedDate,
    stepDate,
    goToToday,
    getDosesForDate,
    getWeekDays,
    getMonthGrid,
    currentProtocolWeek
  } = state;

  // The calendar should always open on today, in whichever view mode (day/week/month) was last
  // used — not resume on whatever date the user last scrolled to. Runs once per mount, i.e. each
  // time the user navigates into this view (CurrentProtocolView is unmounted while another
  // sub-view is active), not on every viewMode/date change within it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    goToToday();
  }, []);

  const exportRef = useRef<HTMLDivElement>(null);
  const [exportingFormat, setExportingFormat] = useState<"jpeg" | "pdf" | null>(null);

  const handleExport = async (format: "jpeg" | "pdf") => {
    if (!exportRef.current || exportingFormat) return;
    setExportingFormat(format);
    try {
      const filename = `protocol-calendar-${timelineViewMode}-${selectedDate}`;
      // html2canvas/jsPDF are only needed here, on demand - lazy-loaded so the ~250KB they add
      // isn't part of everyone's initial bundle for a feature most page loads never touch.
      const { downloadElementAsJpeg, downloadElementAsPdf } = await import("../lib/calendarExport");
      if (format === "jpeg") {
        await downloadElementAsJpeg(exportRef.current, filename);
      } else {
        await downloadElementAsPdf(exportRef.current, filename);
      }
    } catch (error) {
      console.error("Failed to export calendar", error);
    } finally {
      setExportingFormat(null);
    }
  };

  const selectedDateObj = parseIsoDate(selectedDate);

  const activeDoseCount =
    timelineViewMode === "day"
      ? getDosesForDate(selectedDate).length
      : timelineViewMode === "week"
      ? getWeekDays(selectedDate).reduce((sum, day) => sum + day.doses.length, 0)
      : getMonthGrid(selectedDate)
          .filter((cell) => cell.inMonth)
          .reduce((sum, cell) => sum + cell.doses.length, 0);

  const dateLabel =
    timelineViewMode === "day"
      ? new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" }).format(selectedDateObj)
      : timelineViewMode === "week"
      ? (() => {
          const start = startOfWeek(selectedDateObj);
          const end = addDays(start, 6);
          return `${formatShortDate(start)} – ${formatShortDate(end)}`;
        })()
      : `${MONTHS[selectedDateObj.getMonth()]} ${selectedDateObj.getFullYear()}`;

  if (!timelineGenerated || selectedPeptides.length === 0) {
    return (
      <div className="space-y-6">
        <Header onBack={onBack} onNavigate={onNavigate} />
        <div className="p-10 text-center bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl space-y-3">
          <p className="text-sm text-slate-400">No protocol generated yet.</p>
          <button
            type="button"
            onClick={() => onNavigate("create")}
            className="app-action-button app-action-button-active bg-gold-500/15 border-gold-400/70 text-gold-300 hover:border-gold-300 hover:bg-gold-500/20 px-4 py-2.5 font-bold rounded-xl text-xs cursor-pointer inline-flex items-center gap-1.5"
          >
            <Sparkles size={13} />
            Create a protocol
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ overflowAnchor: "none" }}>
      <Header onBack={onBack} onNavigate={onNavigate} />

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Your Protocol Calendar</h1>
          <p className="text-xs text-slate-400 mt-1">
            {selectedPeptides.length} peptides · {timeframeWeeks}-week plan · week {currentProtocolWeek} of {timeframeWeeks} · start{" "}
            {formatLongDate(protocolStartDateObj)}
          </p>
        </div>
      </div>

      {/* DAY / WEEK / MONTH NAVIGATOR */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => stepDate(-1)}
              className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition cursor-pointer"
              aria-label="Previous"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => stepDate(1)}
              className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition cursor-pointer"
              aria-label="Next"
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="px-3 py-2 rounded-lg border border-gold-500/60 bg-gold-500/15 text-gold-300 text-xs font-bold cursor-pointer"
            >
              Today
            </button>
            <span className="text-sm font-bold text-white ml-1">{dateLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-full border border-zinc-700 bg-zinc-800/60 text-xs font-mono text-zinc-300">
              {activeDoseCount} dose{activeDoseCount !== 1 ? "s" : ""}
              {timelineViewMode === "day" ? " today" : ""}
            </span>
            <span className="px-3 py-1.5 rounded-full border border-gold-500/40 bg-gold-500/10 text-xs font-mono text-gold-300">
              {selectedPeptides.length} active peptides
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 w-fit">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setTimelineViewMode(tab)}
                aria-pressed={timelineViewMode === tab}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer ${
                  timelineViewMode === tab
                    ? "bg-gold-500/15 border border-gold-500/60 text-gold-300"
                    : "border border-transparent text-slate-400 hover:text-white hover:border-slate-700"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleExport("jpeg")}
              disabled={exportingFormat !== null}
              className="px-3 py-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 text-xs font-bold"
            >
              <Download size={13} />
              {exportingFormat === "jpeg" ? "Exporting…" : "JPEG"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              disabled={exportingFormat !== null}
              className="px-3 py-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 text-xs font-bold"
            >
              <FileText size={13} />
              {exportingFormat === "pdf" ? "Exporting…" : "PDF"}
            </button>
          </div>
        </div>

        <div ref={exportRef} className="bg-slate-950 p-4 rounded-2xl space-y-4">
          <div>
            <p className="text-sm font-bold text-white">{dateLabel}</p>
            <p className="text-xs text-slate-400">
              {selectedPeptides.length} peptides · {activeDoseCount} dose{activeDoseCount !== 1 ? "s" : ""}
              {timelineViewMode === "day" ? " today" : ""}
            </p>
          </div>
          {timelineViewMode === "day" && <ProtocolDayView state={state} />}
          {timelineViewMode === "week" && <ProtocolWeekView state={state} />}
          {timelineViewMode === "month" && <ProtocolMonthView state={state} />}
        </div>
      </div>
    </div>
  );
}

function Header({ onBack, onNavigate }: { onBack: () => void; onNavigate: (view: ProtocolSubView) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider uppercase text-gold-400 hover:text-gold-300 transition cursor-pointer"
      >
        <ArrowLeft size={12} />
        Protocol Builder
      </button>
      <button
        type="button"
        onClick={() => onNavigate("create")}
        className="app-action-button px-3 py-2 font-bold rounded-xl text-xs cursor-pointer inline-flex items-center gap-1.5"
      >
        <Settings size={13} />
        Edit protocol
      </button>
    </div>
  );
}
