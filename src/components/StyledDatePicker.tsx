/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { DAYS_OF_WEEK, MONTHS, getDateParts } from "../lib/protocolBuilderUtils";

// Native <input type="date"> renders its popup calendar with browser/OS chrome that can't be
// themed to match the app — this replaces it with a popover styled like the rest of the site.
export default function StyledDatePicker({
  value,
  onChange,
  className = "",
  buttonClassName,
  align = "left"
}: {
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  buttonClassName?: string;
  align?: "left" | "right";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const parsed = getDateParts(value);
  const today = new Date();
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const togglePicker = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    const parts = getDateParts(value);
    if (parts) {
      setViewYear(parts.year);
      setViewMonth(parts.month);
    }
    setIsOpen(true);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const formattedMonth = String(viewMonth + 1).padStart(2, "0");
    const formattedDay = String(day).padStart(2, "0");
    onChange(`${viewYear}-${formattedMonth}-${formattedDay}`);
    setIsOpen(false);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
  const displayLabel = parsed
    ? `${MONTHS[parsed.month].slice(0, 3)} ${String(parsed.day).padStart(2, "0")}, ${parsed.year}`
    : "Select date";

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={togglePicker}
        className={
          buttonClassName ??
          "w-full flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-gold-500 rounded-xl py-2 px-3 text-sm text-white outline-none transition cursor-pointer"
        }
      >
        <span className={parsed ? "" : "text-slate-500"}>{displayLabel}</span>
        <Calendar size={14} className="text-slate-500 flex-shrink-0" />
      </button>

      {isOpen && (
        <div
          className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-2 bg-slate-950 border border-slate-800 rounded-xl p-3 shadow-2xl z-[80] w-[240px] text-xs text-white space-y-2`}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="font-mono font-medium text-xs">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-mono text-slate-500 font-bold">
            {DAYS_OF_WEEK.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayIndex }).map((_, idx) => (
              <div key={`empty-${idx}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const isSelected = parsed?.year === viewYear && parsed?.month === viewMonth && parsed?.day === dayNum;
              return (
                <button
                  key={`day-${dayNum}`}
                  type="button"
                  onClick={() => handleSelectDay(dayNum)}
                  className={`py-1 text-center font-mono text-xs rounded transition-all hover:bg-gold-500/20 hover:text-gold-400 cursor-pointer ${
                    isSelected
                      ? "bg-gold-500 text-slate-950 font-bold hover:bg-gold-600 hover:text-slate-950"
                      : "text-slate-300"
                  }`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
