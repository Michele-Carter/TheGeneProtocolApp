/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Plus, X, Search, Sparkles } from "lucide-react";
import { ProtocolBuilderState, DOSING_SOURCE_LABELS } from "../hooks/useProtocolBuilderState";
import { ProtocolSubView } from "./ProtocolBuilder";
import { getColorClasses, JS_DAY_SHORT } from "../lib/protocolBuilderUtils";
import { DosingSourceId, PeptideDoseConfig } from "../types";
import StyledDatePicker from "./StyledDatePicker";

const FREQUENCY_OPTIONS: PeptideDoseConfig["frequency"][] = ["daily", "2x/daily", "3x/week", "2x/week", "weekly"];
const UNIT_OPTIONS: PeptideDoseConfig["unit"][] = ["mcg", "mg", "IU", "mL"];
const TIMEFRAME_OPTIONS = [4, 8, 12, 24, 52] as const;
const TITRATION_OPTION_VALUE = "__TITRATE__";

const clearZeroOnFocus = (event: React.FocusEvent<HTMLInputElement>) => {
  if (event.currentTarget.value === "0") {
    event.currentTarget.value = "";
  }
};

export default function ProtocolCreate({
  state,
  onNavigate,
  onBack
}: {
  state: ProtocolBuilderState;
  onNavigate: (view: ProtocolSubView) => void;
  onBack: () => void;
}) {
  const {
    searchQuery,
    setSearchQuery,
    selectedPeptides,
    doseConfigByPeptide,
    builderMode,
    setBuilderMode,
    protocolDataSource,
    sourceOverrideByPeptide,
    setPeptideSourceOverride,
    selectedGoalOptionByPeptide,
    setGoalDoseOption,
    getGoalOptionsForCurrentSource,
    getTitrationTrackForCurrentSource,
    setTitrationTrack,
    switchToManualTitration,
    addTitrationStep,
    updateTitrationStep,
    removeTitrationStep,
    clearTitrationSteps,
    getSourceCycleInfo,
    filteredPeptides,
    suggestions,
    timeframeWeeks,
    setTimeframeWeeks,
    bodyWeight,
    setBodyWeight,
    setBodyWeightTouched,
    weightUnit,
    setWeightUnit,
    protocolStartDate,
    setProtocolStartDate,
    timelineFormError,
    addPeptide,
    removePeptide,
    updateDoseConfig,
    setFrequency,
    toggleDoseDay,
    handleGenerateTimeline,
    handleClearProtocol
  } = state;

  const onGenerate = () => {
    if (handleGenerateTimeline()) {
      onNavigate("current");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider uppercase text-gold-400 hover:text-gold-300 transition cursor-pointer"
          >
            <ArrowLeft size={12} />
            Protocol Builder
          </button>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Create Protocol</h1>
          <p className="text-sm text-slate-400">
            {builderMode === "automatic"
              ? "Pick your peptides and a protocol goal for each — we'll handle the dosing."
              : "Search peptides, set a start day and dose, then generate your schedule."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleClearProtocol}
            className="app-action-button px-3 py-2.5 font-bold rounded-xl text-xs cursor-pointer"
          >
            Clear protocol
          </button>
          <button
            type="button"
            onClick={onGenerate}
            className="app-action-button app-action-button-active bg-gold-500/15 border-gold-400/70 text-gold-300 hover:border-gold-300 hover:bg-gold-500/20 px-4 py-2.5 font-bold rounded-xl text-xs cursor-pointer inline-flex items-center gap-1.5"
          >
            <Sparkles size={13} />
            Generate protocol
          </button>
        </div>
      </div>

      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 w-fit">
        {(["automatic", "manual"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setBuilderMode(mode)}
            aria-pressed={builderMode === mode}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer ${
              builderMode === mode
                ? "bg-gold-500/15 border border-gold-500/60 text-gold-300"
                : "border border-transparent text-slate-400 hover:text-white hover:border-slate-700"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {timelineFormError && <div className="text-xs text-red-400 font-medium">{timelineFormError}</div>}

      {/* Compact parameters row */}
      <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono tracking-wider uppercase text-slate-500">Timeframe</label>
          <div className="flex flex-wrap items-center gap-1">
            {TIMEFRAME_OPTIONS.map((weeks) => (
              <button
                key={weeks}
                type="button"
                onClick={() => setTimeframeWeeks(weeks)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition cursor-pointer ${
                  timeframeWeeks === weeks
                    ? "bg-gold-500/15 border-gold-500/60 text-gold-300"
                    : "border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                }`}
              >
                {weeks}wk
              </button>
            ))}
            <div className="flex items-center gap-1 pl-1">
              <input
                type="number"
                min={1}
                value={timeframeWeeks}
                onChange={(e) => setTimeframeWeeks(Math.max(1, Number(e.target.value) || 1))}
                className={`w-14 bg-slate-950 border rounded-lg py-1 px-2 text-[11px] font-mono font-bold text-white outline-none focus:border-gold-500 ${
                  TIMEFRAME_OPTIONS.includes(timeframeWeeks as (typeof TIMEFRAME_OPTIONS)[number]) ? "border-slate-800" : "border-gold-500/60"
                }`}
              />
              <span className="text-[11px] text-slate-500">wk custom</span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-mono tracking-wider uppercase text-slate-500">Body weight</label>
          <div className="flex bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-1">
            <input
              type="number"
              min="30"
              value={bodyWeight}
              onFocus={clearZeroOnFocus}
              onChange={(e) => {
                setBodyWeight(Number(e.target.value));
                setBodyWeightTouched(true);
              }}
              className="w-full bg-transparent px-3 py-1.5 text-sm text-white outline-none"
            />
            <button
              type="button"
              onClick={() => setWeightUnit("kg")}
              className={`protocol-unit-toggle px-2 py-1 rounded-lg font-mono font-bold text-xs ${weightUnit === "kg" ? "bg-gold-500 text-white" : "text-slate-500"}`}
            >
              kg
            </button>
            <button
              type="button"
              onClick={() => setWeightUnit("lbs")}
              className={`protocol-unit-toggle px-2 py-1 rounded-lg font-mono font-bold text-xs ${weightUnit === "lbs" ? "bg-gold-500 text-white" : "text-slate-500"}`}
            >
              lbs
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-mono tracking-wider uppercase text-slate-500">Protocol start date</label>
          <StyledDatePicker value={protocolStartDate} onChange={setProtocolStartDate} />
        </div>
      </div>

      {/* Add peptides — search bar across the top */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-gold-400 uppercase tracking-wider">1 · Add Peptides</span>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <Search size={18} />
          </div>
          <input
            type="text"
            className="w-full bg-slate-950 border border-slate-800 focus:border-gold-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition"
            placeholder="Search peptides — e.g. BPC-157, tirzepatide, epitalon..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <AnimatePresence>
            {searchQuery && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute z-50 mt-2 w-full bg-slate-950 border border-slate-800 rounded-xl shadow-2xl max-h-64 overflow-y-auto scrollbar-thin"
              >
                {filteredPeptides.length > 0 ? (
                  filteredPeptides.map((pep) => (
                    <button
                      key={pep.id}
                      type="button"
                      onClick={() => addPeptide(pep)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-slate-900 transition"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${getColorClasses(pep.id).dot}`} />
                          <span>{pep.name}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{pep.category}</div>
                      </div>
                      <Plus size={16} className="text-slate-400" />
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-xs text-slate-500 text-center">No exact matches. Try another search term.</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 8).map((pep) => {
              const colors = getColorClasses(pep.id);
              return (
                <button
                  key={pep.id}
                  type="button"
                  onClick={() => addPeptide(pep)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 text-xs text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                  <span className="font-semibold">{pep.name}</span>
                  <Plus size={12} className="text-slate-500" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Schedule & dose — cards for every added peptide */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-gold-400 uppercase tracking-wider">2 · Schedule &amp; Dose</span>
          <span className="text-xs font-mono text-slate-500">{selectedPeptides.length} peptides</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {selectedPeptides.map((pep) => {
              const colors = getColorClasses(pep.id);
              const config = doseConfigByPeptide[pep.id];
              if (!config) return null;

              // Route follows whichever goal-dose option is currently selected (a multi-route
              // peptide like 5-Amino-1MQ or Semax has options tagged with different routes), not
              // the peptide's single fixed standardRoute.
              const sourceOptions = getGoalOptionsForCurrentSource(pep);
              const selectedOptionId = selectedGoalOptionByPeptide[pep.id] ?? sourceOptions[0]?.id;
              const selectedOption = sourceOptions.find((option) => option.id === selectedOptionId);
              const currentRoute = selectedOption?.route ?? pep.standardRoute;

              return (
                <div key={pep.id} className="p-4 bg-slate-900/60 rounded-xl border border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                      {pep.name}
                      <span className="text-[11px] font-mono text-slate-500 uppercase">{currentRoute}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removePeptide(pep.id)}
                      className="p-1 text-slate-500 hover:text-slate-200 transition cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">Database</label>
                    <select
                      value={sourceOverrideByPeptide[pep.id] ?? ""}
                      onChange={(e) =>
                        setPeptideSourceOverride(pep.id, e.target.value ? (e.target.value as DosingSourceId) : null)
                      }
                      className="bg-slate-950 border border-slate-800 rounded-lg py-1 px-1.5 text-[10px] font-mono text-slate-300 outline-none focus:border-gold-500 cursor-pointer"
                    >
                      <option value="">Default ({DOSING_SOURCE_LABELS[protocolDataSource]})</option>
                      {(Object.keys(DOSING_SOURCE_LABELS) as DosingSourceId[]).map((sourceId) => (
                        <option key={sourceId} value={sourceId}>
                          {DOSING_SOURCE_LABELS[sourceId]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const track = getTitrationTrackForCurrentSource(pep);
                    const isTitrating = !!config.titrationSteps?.length;
                    const isManualTitration = isTitrating && config.titrationMode === "manual";
                    const value = isTitrating ? TITRATION_OPTION_VALUE : selectedGoalOptionByPeptide[pep.id] ?? sourceOptions[0]?.id ?? "";

                    return (
                      <>
                        {/* Manual editing replaces the Protocol goal dropdown entirely — showing both
                            at once was confusing, since the dropdown's own "Auto-titrate" option is
                            not what's actually active while hand-editing. */}
                        {!isManualTitration && (sourceOptions.length > 0 || track) && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">
                              Protocol goal{builderMode === "manual" ? " (optional preset)" : ""}
                            </label>
                            <select
                              value={value}
                              onChange={(e) =>
                                e.target.value === TITRATION_OPTION_VALUE
                                  ? setTitrationTrack(pep.id)
                                  : setGoalDoseOption(pep.id, e.target.value)
                              }
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-white outline-none focus:border-gold-500"
                            >
                              {track && (
                                <option value={TITRATION_OPTION_VALUE}>
                                  Auto-titrate in calendar: {track[0].timelineSchedule.amount}
                                  {track[0].timelineSchedule.unit} → {track[track.length - 1].timelineSchedule.amount}
                                  {track[track.length - 1].timelineSchedule.unit}
                                </option>
                              )}
                              {sourceOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.route ? `[${option.route}] ` : ""}
                                  {option.label} — {option.doseText}
                                </option>
                              ))}
                            </select>
                            {!isTitrating && builderMode === "manual" && (
                              <p className="text-sm text-slate-500">
                                Fills dose, frequency, and days below from this preset — still fully editable after.
                              </p>
                            )}
                          </div>
                        )}

                        {isManualTitration ? (
                          <div className="space-y-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/70">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-mono font-bold text-gold-400">Create manual titration schedule</span>
                              <button
                                type="button"
                                onClick={() => (track ? setTitrationTrack(pep.id) : clearTitrationSteps(pep.id))}
                                className="text-[10px] font-mono font-bold text-slate-500 hover:text-gold-300 cursor-pointer"
                              >
                                {track ? "Use automated titration schedule instead" : "Use flat dose instead"}
                              </button>
                            </div>
                            <div className="space-y-1.5">
                              {config.titrationSteps!.map((step, index) => (
                                <div key={index} className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono text-slate-500 shrink-0">Wk</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={step.startWeek}
                                    onChange={(e) => updateTitrationStep(pep.id, index, { startWeek: Math.max(1, Number(e.target.value) || 1) })}
                                    className="w-12 bg-slate-950 border border-slate-800 rounded-lg py-1 px-1.5 text-xs text-white outline-none focus:border-gold-500"
                                  />
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={step.amount}
                                    onChange={(e) => updateTitrationStep(pep.id, index, { amount: e.target.value })}
                                    className="w-16 bg-slate-950 border border-slate-800 rounded-lg py-1 px-1.5 text-xs text-white outline-none focus:border-gold-500"
                                  />
                                  <select
                                    value={step.unit}
                                    onChange={(e) => updateTitrationStep(pep.id, index, { unit: e.target.value as PeptideDoseConfig["unit"] })}
                                    className="bg-slate-950 border border-slate-800 rounded-lg py-1 px-1.5 text-xs text-white outline-none focus:border-gold-500 cursor-pointer"
                                  >
                                    {UNIT_OPTIONS.map((unit) => (
                                      <option key={unit} value={unit}>
                                        {unit}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => removeTitrationStep(pep.id, index)}
                                    title="Remove step"
                                    className="p-1 text-slate-500 hover:text-red-400 transition cursor-pointer"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => addTitrationStep(pep.id)}
                              className="text-[10px] font-mono font-bold text-gold-400 hover:text-gold-300 cursor-pointer inline-flex items-center gap-1"
                            >
                              <Plus size={11} />
                              Add step
                            </button>
                            <p className="text-sm text-slate-500">
                              The calendar uses each step's dose starting the week you set, until the next step begins.
                            </p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => switchToManualTitration(pep.id)}
                            className="text-[10px] font-mono font-bold text-gold-400 hover:text-gold-300 cursor-pointer inline-flex items-center gap-1 w-fit"
                          >
                            <Plus size={11} />
                            {isTitrating ? "Create manual titration schedule" : "Build custom titration schedule"}
                          </button>
                        )}
                      </>
                    );
                  })()}

                  {builderMode === "automatic" ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">Dose</label>
                          <div className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-white">
                            {config.amount}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">Unit</label>
                          <div className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-white">
                            {config.unit}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">Start date</label>
                          <StyledDatePicker
                            value={config.startDay}
                            onChange={(isoDate) => updateDoseConfig(pep.id, { startDay: isoDate })}
                            buttonClassName="w-full flex items-center justify-between gap-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-gold-500 rounded-lg py-1.5 px-2 text-xs text-white outline-none transition cursor-pointer"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">Frequency</label>
                          <div className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-white">
                            {config.frequency}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">Dosing days</label>
                        <div className="flex flex-wrap gap-1.5">
                          {JS_DAY_SHORT.map((day) => {
                            const active = config.days.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleDoseDay(pep.id, day)}
                                className={`w-8 h-8 rounded-lg text-[11px] font-mono font-bold border transition cursor-pointer ${
                                  active
                                    ? "bg-gold-500/15 border-gold-500/50 text-gold-400"
                                    : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                                }`}
                              >
                                {day.slice(0, 1)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">Dose</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={config.amount}
                            onChange={(e) => updateDoseConfig(pep.id, { amount: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-white outline-none focus:border-gold-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">Unit</label>
                          <select
                            value={config.unit}
                            onChange={(e) => updateDoseConfig(pep.id, { unit: e.target.value as PeptideDoseConfig["unit"] })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-white outline-none focus:border-gold-500"
                          >
                            {UNIT_OPTIONS.map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">Start date</label>
                          <StyledDatePicker
                            value={config.startDay}
                            onChange={(isoDate) => updateDoseConfig(pep.id, { startDay: isoDate })}
                            buttonClassName="w-full flex items-center justify-between gap-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-gold-500 rounded-lg py-1.5 px-2 text-xs text-white outline-none transition cursor-pointer"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">Frequency</label>
                          <input
                            type="text"
                            value={config.frequency}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Typing one of the known presets exactly also resets Dosing Days to
                              // that preset's default; any other custom text only updates the label
                              // — the days below stay exactly as the user last set them.
                              if ((FREQUENCY_OPTIONS as string[]).includes(value)) {
                                setFrequency(pep.id, value);
                              } else {
                                updateDoseConfig(pep.id, { frequency: value });
                              }
                            }}
                            placeholder="e.g. daily, every 3 days, 2x/week"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-gold-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">Dosing days</label>
                        <div className="flex flex-wrap gap-1.5">
                          {JS_DAY_SHORT.map((day) => {
                            const active = config.days.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleDoseDay(pep.id, day)}
                                className={`w-8 h-8 rounded-lg text-[11px] font-mono font-bold border transition cursor-pointer ${
                                  active
                                    ? "bg-gold-500/15 border-gold-500/50 text-gold-400"
                                    : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                                }`}
                              >
                                {day.slice(0, 1)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-mono tracking-wider uppercase text-slate-500">Cycle</label>
                      <button
                        type="button"
                        onClick={() =>
                          updateDoseConfig(
                            pep.id,
                            config.cycleOnWeeks
                              ? { cycleOnWeeks: undefined, cycleOffWeeks: undefined }
                              : { cycleOnWeeks: 4, cycleOffWeeks: 2 }
                          )
                        }
                        className="text-[10px] font-mono font-bold text-gold-400 hover:text-gold-300 cursor-pointer"
                      >
                        {config.cycleOnWeeks ? `Use ${getSourceCycleInfo(pep).sourceLabel} default` : "Customize cycle"}
                      </button>
                    </div>
                    {config.cycleOnWeeks ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={config.cycleOnWeeks}
                          onChange={(e) => updateDoseConfig(pep.id, { cycleOnWeeks: Math.max(1, Number(e.target.value)) })}
                          className="w-16 bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-white outline-none focus:border-gold-500"
                        />
                        <span className="text-[11px] text-slate-500">wk on</span>
                        <input
                          type="number"
                          min={0}
                          value={config.cycleOffWeeks ?? 0}
                          onChange={(e) => updateDoseConfig(pep.id, { cycleOffWeeks: Math.max(0, Number(e.target.value)) })}
                          className="w-16 bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-white outline-none focus:border-gold-500"
                        />
                        <span className="text-[11px] text-slate-500">wk off</span>
                      </div>
                    ) : (
                      (() => {
                        const { text, parsed, sourceLabel } = getSourceCycleInfo(pep);
                        if (parsed) {
                          return (
                            <p className="text-sm text-slate-500">
                              {sourceLabel} default: {text}
                            </p>
                          );
                        }
                        if (text) {
                          return (
                            <p className="text-sm text-slate-500">
                              {sourceLabel}: {text}
                            </p>
                          );
                        }
                        return <p className="text-sm text-slate-500">No cycle info from {sourceLabel}.</p>;
                      })()
                    )}
                  </div>
                </div>
              );
            })}

          {selectedPeptides.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-500 italic border border-dashed border-slate-800 rounded-xl sm:col-span-2">
              No peptides added yet — add some from the library above.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={onGenerate}
          className="app-action-button app-action-button-active bg-gold-500/15 border-gold-400/70 text-gold-300 hover:border-gold-300 hover:bg-gold-500/20 px-5 py-2.5 font-bold rounded-xl text-xs cursor-pointer inline-flex items-center gap-1.5"
        >
          <Sparkles size={13} />
          Generate new protocol
        </button>
        <button
          type="button"
          onClick={() => onNavigate("current")}
          className="app-action-button px-5 py-2.5 font-bold rounded-xl text-xs cursor-pointer"
        >
          View Your Calendar
        </button>
      </div>
    </div>
  );
}
