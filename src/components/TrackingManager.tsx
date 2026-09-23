/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/react";
import { WeightEntry, ShotEntry } from "../types";
import { getUserState, putUserState } from "../lib/userStateApi";
import { Plus, Trash2, Scale, Activity, TrendingDown, ClipboardList, Calendar, ChevronLeft, ChevronRight, Pencil, Check } from "lucide-react";

type TrackingPersistedState = {
  weightEntries: WeightEntry[];
  newWeight: string;
  newWeightDate: string;
  weightGoal: number;
  weightUnit: "kg" | "lbs";
  shotEntries: ShotEntry[];
  logPeptide: string;
  logDose: string;
  logSite: string;
  logNotes: string;
  logDate: string;
  macros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
};

export default function TrackingManager() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  // --- STATE 1: WEIGHT ENTRY STATE ---
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [newWeight, setNewWeight] = useState("");
  const [newWeightDate, setNewWeightDate] = useState(new Date().toISOString().split("T")[0]);
  const [weightGoal, setWeightGoal] = useState(80.0);
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");

  // --- STATE 2: SHOT LOGGER STATE ---
  const [shotEntries, setShotEntries] = useState<ShotEntry[]>([]);
  const [logPeptide, setLogPeptide] = useState("Retatrutide");
  const [logDose, setLogDose] = useState("");
  const [logSite, setLogSite] = useState("Abdomen Left Flank");
  const [logNotes, setLogNotes] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [showWeightDatePicker, setShowWeightDatePicker] = useState(false);
  const [weightPickerYear, setWeightPickerYear] = useState<number>(new Date().getFullYear());
  const [weightPickerMonth, setWeightPickerMonth] = useState<number>(new Date().getMonth());
  const [showShotDatePicker, setShowShotDatePicker] = useState(false);
  const [shotPickerYear, setShotPickerYear] = useState<number>(new Date().getFullYear());
  const [shotPickerMonth, setShotPickerMonth] = useState<number>(new Date().getMonth());
  const weightPickerContainerRef = useRef<HTMLDivElement>(null);
  const shotPickerContainerRef = useRef<HTMLDivElement>(null);
  const weightDateButtonRef = useRef<HTMLButtonElement>(null);
  const shotDateButtonRef = useRef<HTMLButtonElement>(null);
  const persistTimeoutRef = useRef<number | null>(null);
  const [hasHydratedPersistedState, setHasHydratedPersistedState] = useState(false);
  const [editingWeightId, setEditingWeightId] = useState<string | null>(null);

  // --- STATE 3: MACROS STATE ---
  const [macros, setMacros] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  });
  const macroGoals = {
    calories: 1800,
    protein: 150,
    carbs: 130,
    fat: 55
  };

  const clearZeroOnFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    if (event.currentTarget.value === "0") {
      event.currentTarget.value = "";
    }
  };

  const getClientToken = useCallback(async () => {
    const token = await getToken();
    return token;
  }, [getToken]);

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const DAYS_OF_WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  };

  const getDateParts = (dateStr: string) => {
    const parts = dateStr.split("-");
    if (parts.length !== 3) return null;
    return {
      year: Number(parts[0]),
      month: Number(parts[1]) - 1,
      day: Number(parts[2])
    };
  };

  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    async function restoreState() {
      try {
        if (!isSignedIn) return;

        const parsed = await getUserState<TrackingPersistedState>("tracking", getClientToken);
        if (!parsed || cancelled) return;

        setWeightEntries(Array.isArray(parsed.weightEntries) ? parsed.weightEntries : []);
        setNewWeight(typeof parsed.newWeight === "string" ? parsed.newWeight : "");
        setNewWeightDate(new Date().toISOString().split("T")[0]);
        setWeightGoal(typeof parsed.weightGoal === "number" && Number.isFinite(parsed.weightGoal) ? parsed.weightGoal : 80);
        setWeightUnit(parsed.weightUnit === "lbs" ? "lbs" : "kg");
        setShotEntries(Array.isArray(parsed.shotEntries) ? parsed.shotEntries : []);
        setLogPeptide(typeof parsed.logPeptide === "string" && parsed.logPeptide ? parsed.logPeptide : "Retatrutide");
        setLogDose(typeof parsed.logDose === "string" ? parsed.logDose : "");
        setLogSite(typeof parsed.logSite === "string" && parsed.logSite ? parsed.logSite : "Abdomen Left Flank");
        setLogNotes(typeof parsed.logNotes === "string" ? parsed.logNotes : "");
        setLogDate(new Date().toISOString().split("T")[0]);

        if (parsed.macros && typeof parsed.macros === "object") {
          setMacros({
            calories: typeof parsed.macros.calories === "number" ? parsed.macros.calories : 0,
            protein: typeof parsed.macros.protein === "number" ? parsed.macros.protein : 0,
            carbs: typeof parsed.macros.carbs === "number" ? parsed.macros.carbs : 0,
            fat: typeof parsed.macros.fat === "number" ? parsed.macros.fat : 0,
          });
        }
      } catch (error) {
        console.error("Failed to restore tracking state", error);
      } finally {
        if (!cancelled) {
          setHasHydratedPersistedState(true);
        }
      }
    }

    void restoreState();

    return () => {
      cancelled = true;
    };
  }, [getClientToken, isLoaded, isSignedIn]);

  useEffect(() => {
    if (!hasHydratedPersistedState || !isLoaded || !isSignedIn) return;

    const payload: TrackingPersistedState = {
      weightEntries,
      newWeight,
      newWeightDate,
      weightGoal,
      weightUnit,
      shotEntries,
      logPeptide,
      logDose,
      logSite,
      logNotes,
      logDate,
      macros,
    };

    if (persistTimeoutRef.current !== null) {
      window.clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = window.setTimeout(() => {
      void putUserState("tracking", payload, getClientToken).catch((error) => {
        console.error("Failed to persist tracking state to Neon", error);
      });
    }, 400);

    return () => {
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [
    getClientToken,
    hasHydratedPersistedState,
    isLoaded,
    isSignedIn,
    logDate,
    logDose,
    logNotes,
    logPeptide,
    logSite,
    macros,
    newWeight,
    newWeightDate,
    shotEntries,
    weightEntries,
    weightGoal,
    weightUnit,
  ]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        showWeightDatePicker &&
        weightPickerContainerRef.current &&
        !weightPickerContainerRef.current.contains(target)
      ) {
        setShowWeightDatePicker(false);
      }
      if (
        showShotDatePicker &&
        shotPickerContainerRef.current &&
        !shotPickerContainerRef.current.contains(target)
      ) {
        setShowShotDatePicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showWeightDatePicker, showShotDatePicker]);

  // Popovers render inline as absolutely-positioned children so they scroll with the page.

  const openWeightDatePicker = () => {
    const dateParts = getDateParts(newWeightDate);
    if (dateParts) {
      setWeightPickerYear(dateParts.year);
      setWeightPickerMonth(dateParts.month);
    }
    setShowWeightDatePicker(true);
    setShowShotDatePicker(false);
  };

  const openShotDatePicker = () => {
    const dateParts = getDateParts(logDate);
    if (dateParts) {
      setShotPickerYear(dateParts.year);
      setShotPickerMonth(dateParts.month);
    }
    setShowShotDatePicker(true);
    setShowWeightDatePicker(false);
  };

  const handleWeightPrevMonth = () => {
    if (weightPickerMonth === 0) {
      setWeightPickerMonth(11);
      setWeightPickerYear(weightPickerYear - 1);
    } else {
      setWeightPickerMonth(weightPickerMonth - 1);
    }
  };

  const handleWeightNextMonth = () => {
    if (weightPickerMonth === 11) {
      setWeightPickerMonth(0);
      setWeightPickerYear(weightPickerYear + 1);
    } else {
      setWeightPickerMonth(weightPickerMonth + 1);
    }
  };

  const handleShotPrevMonth = () => {
    if (shotPickerMonth === 0) {
      setShotPickerMonth(11);
      setShotPickerYear(shotPickerYear - 1);
    } else {
      setShotPickerMonth(shotPickerMonth - 1);
    }
  };

  const handleShotNextMonth = () => {
    if (shotPickerMonth === 11) {
      setShotPickerMonth(0);
      setShotPickerYear(shotPickerYear + 1);
    } else {
      setShotPickerMonth(shotPickerMonth + 1);
    }
  };

  const handleWeightSelectDay = (day: number) => {
    const formattedMonth = String(weightPickerMonth + 1).padStart(2, "0");
    const formattedDay = String(day).padStart(2, "0");
    setNewWeightDate(`${weightPickerYear}-${formattedMonth}-${formattedDay}`);
    setShowWeightDatePicker(false);
  };

  const handleShotSelectDay = (day: number) => {
    const formattedMonth = String(shotPickerMonth + 1).padStart(2, "0");
    const formattedDay = String(day).padStart(2, "0");
    setLogDate(`${shotPickerYear}-${formattedMonth}-${formattedDay}`);
    setShowShotDatePicker(false);
  };

  const renderCalendarPopover = (
    month: number,
    year: number,
    onPrev: () => void,
    onNext: () => void,
    onSelectDay: (day: number) => void,
    selectedDate: string
  ) => {
    const selected = getDateParts(selectedDate);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();

    return (
      <div className="absolute left-0 top-full mt-2 bg-slate-950 border border-slate-800 rounded-xl p-3 shadow-2xl z-[80] w-[240px] text-xs text-white space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onPrev}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-mono font-medium text-xs">
            {MONTHS[month]} {year}
          </span>
          <button
            type="button"
            onClick={onNext}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
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
            const isSelected = selected?.year === year && selected?.month === month && selected?.day === dayNum;
            return (
              <button
                key={`day-${dayNum}`}
                type="button"
                onClick={() => onSelectDay(dayNum)}
                className={`py-1 text-center font-mono text-xs rounded transition-all hover:bg-gold-500/20 hover:text-gold-400 ${isSelected
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
    );
  };

  // --- CALCULATIONS & HANDLERS ---

  // Weight is always persisted in kg; convert only for display/input in the selected unit.
  const KG_TO_LBS = 2.2046226218;

  const kgToDisplay = useCallback((kg: number) => {
    const val = weightUnit === "lbs" ? kg * KG_TO_LBS : kg;
    return Math.round(val * 10) / 10;
  }, [weightUnit]);

  const displayToKg = useCallback((val: number) => {
    return weightUnit === "lbs" ? val / KG_TO_LBS : val;
  }, [weightUnit]);

  // Weight Metrics
  const currentWeight = useMemo(() => {
    if (weightEntries.length === 0) return 0;
    const sorted = [...weightEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted[0].weight;
  }, [weightEntries]);

  const startingWeight = useMemo(() => {
    if (weightEntries.length === 0) return 0;
    const sorted = [...weightEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return sorted[0].weight;
  }, [weightEntries]);

  const weightChange = useMemo(() => {
    if (weightEntries.length < 2) return 0;
    return Number((currentWeight - startingWeight).toFixed(1));
  }, [currentWeight, startingWeight]);

  // SVG Chart points calculation
  const svgChartPath = useMemo(() => {
    if (weightEntries.length < 2) return null;
    const sorted = [...weightEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const displayGoal = kgToDisplay(weightGoal);
    const displayWeights = sorted.map(s => kgToDisplay(s.weight));

    // Find min and max weight for scaling
    let minW = Math.min(...displayWeights, displayGoal) - 2;
    let maxW = Math.max(...displayWeights) + 2;
    const weightRange = maxW - minW;

    const width = 500;
    const height = 150;
    const padding = 20;

    const points = sorted.map((entry, idx) => {
      const x = padding + (idx * (width - padding * 2)) / (sorted.length - 1);
      const w = displayWeights[idx];
      // Invert Y so higher weight is at the top
      const y = height - padding - ((w - minW) * (height - padding * 2)) / weightRange;
      return { x, y, weight: w, date: entry.date };
    });

    // Make SVG path
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }

    // Make closed area path for fill gradient
    const areaPath = `${path} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    // Horizontal line position for Goal Weight
    const goalY = height - padding - ((displayGoal - minW) * (height - padding * 2)) / weightRange;

    return { points, path, areaPath, goalY, width, height, padding };
  }, [weightEntries, weightGoal, kgToDisplay]);

  // Add weight
  const handleAddWeight = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWeight || isNaN(Number(newWeight))) return;
    const entry: WeightEntry = {
      id: "w-new-" + Date.now(),
      date: newWeightDate,
      weight: displayToKg(Number(newWeight))
    };
    setWeightEntries([...weightEntries, entry]);
    setNewWeight("");
  };

  // Delete weight
  const handleDeleteWeight = (id: string) => {
    setWeightEntries(weightEntries.filter(w => w.id !== id));
    setEditingWeightId((prev) => (prev === id ? null : prev));
  };

  // Edit weight
  const handleUpdateWeight = (id: string, updates: Partial<WeightEntry>) => {
    setWeightEntries((prev) => prev.map((w) => (w.id === id ? { ...w, ...updates } : w)));
  };

  // Add Shot
  const handleAddShot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!logDose) return;
    const entry: ShotEntry = {
      id: "s-new-" + Date.now(),
      date: logDate,
      peptideName: logPeptide,
      dosage: logDose,
      site: logSite,
      notes: logNotes || "Logged research dosage"
    };
    setShotEntries([entry, ...shotEntries]); // add to front
    setLogDose("");
    setLogNotes("");
  };

  const handleDeleteShot = (id: string) => {
    setShotEntries(shotEntries.filter(s => s.id !== id));
  };

  const canRecordWeight = newWeight.trim() !== "" && !isNaN(Number(newWeight));
  const canRecordShot = logDose.trim() !== "";

  return (
    <div className="space-y-10">
      {/* CENTEERED TOP HEADER */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <span className="inline-flex items-center px-4 py-1.5 bg-zinc-800/60 border border-zinc-700 text-gold-400 rounded-full text-xs font-mono tracking-wider uppercase gap-2">
            <ClipboardList size={13} className="text-gold-400" />
            RESEARCH LOGS
          </span>
        </div>
        <h1 className="text-3xl md:text-5xl font-black text-white leading-tight tracking-tight max-w-3xl mx-auto">
          Track research logs. <span className="text-gold-400">Monitor your metrics.</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-2xl mx-auto leading-relaxed">
          Log research data, track body weight progression, and map daily macro nutrients.
        </p>
      </div>

      <div className="space-y-8">
        {/* TOP BENTO STATS CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {/* current weight */}
          <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-1">
            <span className="text-[12px] font-mono tracking-wider uppercase text-slate-500 block">CURRENT WEIGHT</span>
            <div className="text-2xl font-black text-white font-mono flex items-baseline space-x-1">
              <span>{currentWeight ? kgToDisplay(currentWeight) : "--"}</span>
              <span className="text-xs text-slate-400 font-normal">{weightUnit}</span>
            </div>
          </div>

          {/* weight loss change */}
          <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-1">
            <span className="text-[12px] font-mono tracking-wider uppercase text-slate-500 block">WEIGHT LOSS</span>
            <div className="text-2xl font-black text-gold-400 font-mono flex items-center space-x-1.5">
              <TrendingDown size={20} />
              <span>{weightChange ? kgToDisplay(weightChange) : "0"} {weightUnit}</span>
            </div>
          </div>

          {/* active shots total */}
          <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-1">
            <span className="text-[12px] font-mono tracking-wider uppercase text-slate-500 block">SHOTS LOGGED</span>
            <div className="text-2xl font-black text-white font-mono flex items-baseline space-x-1">
              <span>{shotEntries.length}</span>
              <span className="text-xs text-slate-400 font-normal">injections</span>
            </div>
          </div>

          {/* protein target */}
          <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-1">
            <span className="text-[12px] font-mono tracking-wider uppercase text-slate-500 block">PROTEIN TARGET</span>
            <div className="text-2xl font-black text-amber-400 font-mono flex items-baseline space-x-1">
              <span>{macros.protein} / {macroGoals.protein}</span>
              <span className="text-xs text-slate-400 font-normal">g</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT ROW: Weight Loss area chart */}
          <div className="lg:col-span-8 space-y-6">
            {/* Weight loss chart container */}
            <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800/60 pb-3 flex-wrap gap-3">
                <span className="text-xs font-extrabold text-white uppercase tracking-wider font-mono flex items-center space-x-1.5">
                  <Scale size={14} className="text-gold-400" />
                  <span>WEIGHT PROGRESSION GRAPH</span>
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden text-[11px] font-mono">
                    <button
                      type="button"
                      onClick={() => setWeightUnit("kg")}
                      className={`px-2.5 py-1 uppercase transition ${weightUnit === "kg" ? "bg-gold-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
                    >
                      Kg
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeightUnit("lbs")}
                      className={`px-2.5 py-1 uppercase transition ${weightUnit === "lbs" ? "bg-gold-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
                    >
                      Lbs
                    </button>
                  </div>
                  <div className="flex items-center space-x-2 text-[12px] font-mono text-slate-400">
                    <span className="inline-block w-2.5 h-1 bg-gold-400 rounded" />
                    <span>Weight</span>
                    <span className="inline-block w-2.5 h-1 border-t border-dashed border-red-500/60" />
                    <span>Goal ({kgToDisplay(weightGoal)}{weightUnit})</span>
                  </div>
                </div>
              </div>

              {/* SVG Chart */}
              {svgChartPath ? (
                <div className="relative">
                  <svg
                    width="100%"
                    height="180"
                    viewBox={`0 0 ${svgChartPath.width} ${svgChartPath.height}`}
                    className="text-slate-200 overflow-visible"
                  >
                    {/* Grid Lines */}
                    <line x1="20" y1="20" x2="480" y2="20" stroke="#1e293b" strokeWidth="0.5" />
                    <line x1="20" y1="52.5" x2="480" y2="52.5" stroke="#1e293b" strokeWidth="0.5" />
                    <line x1="20" y1="85" x2="480" y2="85" stroke="#1e293b" strokeWidth="0.5" />
                    <line x1="20" y1="117.5" x2="480" y2="117.5" stroke="#1e293b" strokeWidth="0.5" />
                    <line x1="20" y1="130" x2="480" y2="130" stroke="#1e293b" strokeWidth="0.5" />

                    {/* Goal Line */}
                    {svgChartPath.goalY >= 0 && svgChartPath.goalY <= svgChartPath.height && (
                      <line
                        x1="20"
                        y1={svgChartPath.goalY}
                        x2="480"
                        y2={svgChartPath.goalY}
                        stroke="#ef4444"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                        opacity="0.6"
                      />
                    )}

                    {/* Area Fill */}
                    <path
                      d={svgChartPath.areaPath}
                      fill="rgba(194, 145, 31, 0.04)"
                    />

                    {/* Line Path */}
                    <path
                      d={svgChartPath.path}
                      fill="none"
                      stroke="#c2911f"
                      strokeWidth="2"
                    />

                    {/* Nodes */}
                    {svgChartPath.points.map((pt, idx) => (
                      <g key={idx}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="4.5"
                          fill="#0f172a"
                          stroke="#c2911f"
                          strokeWidth="2.5"
                        />
                        {/* Weight text value */}
                        <text
                          x={pt.x}
                          y={pt.y - 10}
                          fill="#ffffff"
                          fontSize="8.5"
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {pt.weight}
                        </text>
                        {/* Date label at bottom */}
                        <text
                          x={pt.x}
                          y="144"
                          fill="#475569"
                          fontSize="7.5"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          {pt.date.slice(5)}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              ) : (
                <div className="text-center py-12 text-xs text-slate-500 italic">Add weight data below to initialize progress tracking graph.</div>
              )}

              {/* Weight log history — edit or delete a past entry (e.g. a test/mistaken value) */}
              {weightEntries.length > 0 && (
                <div className="overflow-x-auto border-t border-slate-800/40 pt-3">
                  <table className="w-full text-left text-xs text-slate-400 divide-y divide-slate-800/80">
                    <thead>
                      <tr className="text-[12px] font-mono uppercase tracking-wider text-slate-500">
                        <th className="pb-2">DATE</th>
                        <th className="pb-2">WEIGHT ({weightUnit.toUpperCase()})</th>
                        <th className="pb-2 text-right">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {[...weightEntries]
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((entry) => {
                          const isEditing = editingWeightId === entry.id;
                          return (
                            <tr key={entry.id} className="hover:bg-slate-950/20 transition">
                              <td className="py-2.5 font-mono text-[12px] text-slate-400">
                                {isEditing ? (
                                  <input
                                    type="date"
                                    value={entry.date}
                                    onChange={(e) => handleUpdateWeight(entry.id, { date: e.target.value })}
                                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-gold-500"
                                  />
                                ) : (
                                  entry.date
                                )}
                              </td>
                              <td className="py-2.5 text-gold-400 font-bold font-mono">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={kgToDisplay(entry.weight)}
                                    onChange={(e) => handleUpdateWeight(entry.id, { weight: displayToKg(Number(e.target.value) || 0) })}
                                    className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-gold-500"
                                  />
                                ) : (
                                  `${kgToDisplay(entry.weight)} ${weightUnit}`
                                )}
                              </td>
                              <td className="py-2.5 text-right space-x-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingWeightId(isEditing ? null : entry.id)}
                                  className={`p-1 rounded transition ${isEditing ? "text-gold-400" : "text-slate-600 hover:text-gold-400"}`}
                                  title={isEditing ? "Done editing" : "Edit entry"}
                                >
                                  {isEditing ? <Check size={13} /> : <Pencil size={13} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteWeight(entry.id)}
                                  className="text-slate-600 hover:text-red-400 p-1 rounded transition"
                                  title="Delete entry"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add weight entry inline form */}
              <form onSubmit={handleAddWeight} className="pt-2 border-t border-slate-800/40 grid grid-cols-1 sm:grid-cols-3 gap-3 overflow-visible">
                <div className="flex flex-col space-y-1.5 relative overflow-visible">
                  <label className="text-[12px] font-mono uppercase text-slate-400">RESEARCH DATE</label>
                  <div ref={weightPickerContainerRef} className="relative">
                    <button
                      type="button"
                      ref={weightDateButtonRef}
                      onClick={openWeightDatePicker}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none hover:border-gold-500 font-mono text-left flex items-center justify-between gap-2"
                    >
                      <span>{formatDateDisplay(newWeightDate)}</span>
                      <Calendar size={14} className="text-slate-500 shrink-0" />
                    </button>

                    {showWeightDatePicker && renderCalendarPopover(
                      weightPickerMonth,
                      weightPickerYear,
                      handleWeightPrevMonth,
                      handleWeightNextMonth,
                      handleWeightSelectDay,
                      newWeightDate
                    )}
                  </div>
                </div>
                <div className="flex flex-col space-y-1.5">
                  <label className="text-[12px] font-mono uppercase text-slate-400">BODY WEIGHT ({weightUnit.toUpperCase()})</label>
                  <input
                    type="text"
                    placeholder={weightUnit === "lbs" ? "e.g. 188.5" : "e.g. 85.5"}
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-gold-500 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canRecordWeight}
                  className={`app-action-button sm:self-end py-2 font-bold rounded-xl text-xs transition ${canRecordWeight ? "cursor-pointer" : "app-action-button-disabled cursor-not-allowed"}`}
                >
                  + Record Weight
                </button>
              </form>
            </div>

            {/* Shot Log database list */}
            <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4">
              <span className="text-xs font-extrabold text-white uppercase tracking-wider font-mono flex items-center space-x-1.5">
                <Activity size={14} className="text-gold-400" />
                <span>COMPREHENSIVE RESEARCH SHOT LOG</span>
              </span>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-400 divide-y divide-slate-800/80">
                  <thead>
                    <tr className="text-[12px] font-mono uppercase tracking-wider text-slate-500">
                      <th className="pb-2">DATE</th>
                      <th className="pb-2">COMPOUND</th>
                      <th className="pb-2">DOSE</th>
                      <th className="pb-2">ROTATION SITE</th>
                      <th className="pb-2">NOTES</th>
                      <th className="pb-2 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {shotEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-950/20 transition">
                        <td className="py-2.5 font-mono text-[12px] text-slate-400">{entry.date}</td>
                        <td className="py-2.5 font-bold text-slate-200">{entry.peptideName}</td>
                        <td className="py-2.5 text-gold-400 font-bold font-mono">{entry.dosage}</td>
                        <td className="py-2.5 font-semibold text-slate-300">{entry.site}</td>
                        <td className="py-2.5 text-slate-500 text-[12px] max-w-[150px] truncate">{entry.notes}</td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => handleDeleteShot(entry.id)}
                            className="text-slate-600 hover:text-red-400 p-1 rounded transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {shotEntries.length === 0 && (
                  <div className="text-center py-8 text-slate-500 italic text-sm">No logged shots yet — add your first injection dose below.</div>
                )}
              </div>

              {/* Log shot builder form */}
              <form onSubmit={handleAddShot} className="pt-4 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-4 gap-3 overflow-visible">
                <div className="flex flex-col space-y-1 relative overflow-visible">
                  <label className="text-[12px] font-mono uppercase text-slate-500">DATE</label>
                  <div ref={shotPickerContainerRef} className="relative">
                    <button
                      type="button"
                      ref={shotDateButtonRef}
                      onClick={openShotDatePicker}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:border-gold-500 outline-none text-left flex items-center justify-between gap-2"
                    >
                      <span>{formatDateDisplay(logDate)}</span>
                      <Calendar size={14} className="text-slate-500 shrink-0" />
                    </button>

                    {showShotDatePicker && renderCalendarPopover(
                      shotPickerMonth,
                      shotPickerYear,
                      handleShotPrevMonth,
                      handleShotNextMonth,
                      handleShotSelectDay,
                      logDate
                    )}
                  </div>
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-[12px] font-mono uppercase text-slate-500">COMPOUND</label>
                  <select
                    value={logPeptide}
                    onChange={(e) => setLogPeptide(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:border-gold-500 outline-none"
                  >
                    <option value="Retatrutide">Retatrutide</option>
                    <option value="Tirzepatide">Tirzepatide</option>
                    <option value="Semaglutide">Semaglutide</option>
                    <option value="BPC-157">BPC-157</option>
                    <option value="TB-500">TB-500</option>
                    <option value="MOTS-c">MOTS-c</option>
                    <option value="GHK-Cu">GHK-Cu</option>
                    <option value="NAD+">NAD+</option>
                  </select>
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-[12px] font-mono uppercase text-slate-500">DOSE (AMOUNT)</label>
                  <input
                    type="text"
                    placeholder="e.g. 500 mcg"
                    value={logDose}
                    onChange={(e) => setLogDose(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:border-gold-500 outline-none font-mono"
                  />
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-[12px] font-mono uppercase text-slate-500">ROTATION SITE</label>
                  <select
                    value={logSite}
                    onChange={(e) => setLogSite(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:border-gold-500 outline-none"
                  >
                    <option value="Abdomen Left Flank">Abdomen Left Flank</option>
                    <option value="Abdomen Right Flank">Abdomen Right Flank</option>
                    <option value="Left Outer Thigh">Left Outer Thigh</option>
                    <option value="Right Outer Thigh">Right Outer Thigh</option>
                    <option value="Back of Left Arm">Back of Left Arm</option>
                    <option value="Back of Right Arm">Back of Right Arm</option>
                    <option value="Right Ventrogluteal (IM)">Right Ventrogluteal (IM)</option>
                  </select>
                </div>
                <div className="sm:col-span-3 flex flex-col space-y-1">
                  <label className="text-[12px] font-mono uppercase text-slate-500">DOSE NOTES / SAFETY REMINDERS</label>
                  <input
                    type="text"
                    placeholder="e.g. Stinging was mild. Avoided vessel."
                    value={logNotes}
                    onChange={(e) => setLogNotes(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:border-gold-500 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canRecordShot}
                  className={`app-action-button sm:self-end py-2 font-bold rounded-xl text-xs transition ${canRecordShot ? "" : "app-action-button-disabled"}`}
                >
                  + Record Shot Log
                </button>
              </form>
            </div>
          </div>

          {/* RIGHT COLUMN: MACROS DIAL TRACKER */}
          <div className="lg:col-span-4 space-y-6">
            <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-5">
              <span className="text-xs font-extrabold text-white uppercase tracking-wider font-mono flex items-center space-x-1.5">
                <Activity size={14} className="text-gold-400" />
                <span>DAILY MACRO NUTRIENTS</span>
              </span>

              <div className="space-y-4">
                {/* Calories track bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-300">Calories Intake</span>
                    <span className="font-mono text-white font-bold">{macros.calories} / {macroGoals.calories} kcal</span>
                  </div>
                  <div className="w-full bg-slate-400/20 rounded-full h-2 overflow-hidden border border-slate-600/40">
                    <div
                      className="bg-gold-400 h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, (macros.calories / macroGoals.calories) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Protein track bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-300">Protein (Target: high retention)</span>
                    <span className="font-mono text-white font-bold">{macros.protein} / {macroGoals.protein} g</span>
                  </div>
                  <div className="w-full bg-slate-400/20 rounded-full h-2 overflow-hidden border border-slate-600/40">
                    <div
                      className="bg-amber-400 h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, (macros.protein / macroGoals.protein) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Carbs track bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-300">Carbohydrates</span>
                    <span className="font-mono text-white font-bold">{macros.carbs} / {macroGoals.carbs} g</span>
                  </div>
                  <div className="w-full bg-slate-400/20 rounded-full h-2 overflow-hidden border border-slate-600/40">
                    <div
                      className="bg-gold-400 h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, (macros.carbs / macroGoals.carbs) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Fat track bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-300">Dietary Fats</span>
                    <span className="font-mono text-white font-bold">{macros.fat} / {macroGoals.fat} g</span>
                  </div>
                  <div className="w-full bg-slate-400/20 rounded-full h-2 overflow-hidden border border-slate-600/40">
                    <div
                      className="bg-gold-400 h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, (macros.fat / macroGoals.fat) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Macro tuners */}
              <div className="pt-4 border-t border-slate-800/50 space-y-3">
                <div className="text-[12px] font-mono uppercase text-slate-500">TUNE TODAY'S MACRO TRACKS</div>
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <span className="text-[12px] text-slate-400">Calories (kcal)</span>
                    <input
                      type="number"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1 px-2.5 text-xs text-white outline-none"
                      value={macros.calories}
                      onFocus={clearZeroOnFocus}
                      onChange={(e) => setMacros({ ...macros, calories: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[12px] text-slate-400">Protein (g)</span>
                    <input
                      type="number"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1 px-2.5 text-xs text-white outline-none"
                      value={macros.protein}
                      onFocus={clearZeroOnFocus}
                      onChange={(e) => setMacros({ ...macros, protein: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[12px] text-slate-400">Carbs (g)</span>
                    <input
                      type="number"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1 px-2.5 text-xs text-white outline-none"
                      value={macros.carbs}
                      onFocus={clearZeroOnFocus}
                      onChange={(e) => setMacros({ ...macros, carbs: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[12px] text-slate-400">Fat (g)</span>
                    <input
                      type="number"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1 px-2.5 text-xs text-white outline-none"
                      value={macros.fat}
                      onFocus={clearZeroOnFocus}
                      onChange={(e) => setMacros({ ...macros, fat: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
