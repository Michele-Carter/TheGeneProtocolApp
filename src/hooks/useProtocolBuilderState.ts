/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PEPTIDES_DATABASE, PEPTIDE_INTERACTIONS } from "../data/peptides";
import { PEPTIDEDOSAGES_META } from "../data/peptideDosagesSource";
import { PEPTIDEDB_META } from "../data/peptideDbSource";
import { DosingSourceId, GoalDoseOption, PeptideDoseConfig, PeptideProtocolInfo, PersistedProtocolBuilderPayload, ProtocolRecord } from "../types";
import { JS_DAY_SHORT, addDays, parseIsoDate, startOfWeek, toIsoDate } from "../lib/protocolBuilderUtils";
import { parseWeekStart } from "../lib/doseParsing";

const PERSIST_DEBOUNCE_MS = 400;

export const DOSING_SOURCE_LABELS: Record<DosingSourceId, string> = {
  "pep-pedia": "Pep-Pedia",
  peptidedosages: "Peptide Dosages",
  "peptide-db": "Peptide DB"
};

// The free-text cycle description for a peptide, as published by the currently-active dosing
// source — used both for calendar on/off-cycle scheduling and for the manual-mode "use source
// default" cycle control. Not every source publishes cycle data for every peptide.
const getSourceCycleText = (peptide: PeptideProtocolInfo, source: DosingSourceId): string | undefined => {
  if (source === "peptidedosages") return PEPTIDEDOSAGES_META[peptide.id]?.cycle;
  if (source === "peptide-db") return PEPTIDEDB_META[peptide.id]?.cycleDuration;
  return peptide.cycle;
};

const DEFAULT_DAYS_BY_FREQUENCY: Record<PeptideDoseConfig["frequency"], string[]> = {
  daily: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
  "2x/daily": ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
  "3x/week": ["MON", "WED", "FRI"],
  "2x/week": ["MON", "THU"],
  weekly: ["MON"]
};

// Filters a peptide's goalDoseOptions to the currently-selected dosing source; falls back to the
// full unfiltered list if that source has no tagged options for this peptide (defensive — with the
// current catalog every peptide has both, but new peptides may not).
const getGoalOptionsForSource = (peptide: PeptideProtocolInfo, source: DosingSourceId) => {
  const all = peptide.goalDoseOptions ?? [];
  const filtered = all.filter((option) => (option.source ?? "pep-pedia") === source);
  return filtered.length > 0 ? filtered : all;
};

// Detects a titration sequence within one source's goal options for a peptide: any option whose
// label carries a parseable week number (e.g. "Conservative Starting Dose (Week 1-4)", "Weeks
// 5-8") is a step in an ordered dose-escalation schedule rather than a standalone alternative.
// Requires 2+ such options — a single week-labeled option is just a normal one-off choice, not a
// sequence. Verified this signal alone is enough to separate titration steps from same-peptide
// alternatives that don't carry week numbers (e.g. Retatrutide's "Type 2 Diabetes" / "Clinical
// Trial" pep-pedia rows) without needing any additional hand-authored tagging.
const getTitrationTrackForSource = (peptide: PeptideProtocolInfo, source: DosingSourceId): GoalDoseOption[] | null => {
  const seenWeeks = new Set<number>();
  const steps = getGoalOptionsForSource(peptide, source)
    .filter((option): option is GoalDoseOption & { timelineSchedule: NonNullable<GoalDoseOption["timelineSchedule"]> } => {
      if (!option.timelineSchedule) return false;
      const week = parseWeekStart(option.label);
      if (week === null || seenWeeks.has(week)) return false;
      seenWeeks.add(week);
      return true;
    })
    .sort((a, b) => parseWeekStart(a.label)! - parseWeekStart(b.label)!);

  return steps.length >= 2 ? steps : null;
};

// A peptide's dose for a given protocol week — either its flat amount/unit, or (when titrating)
// the last titrationSteps entry whose startWeek has been reached. Shared by the calendar and any
// UI that needs to show "the dose that currently applies."
export const resolveDoseForWeek = (
  config: Pick<PeptideDoseConfig, "amount" | "unit" | "titrationSteps">,
  week: number
): { amount: string; unit: PeptideDoseConfig["unit"] } => {
  if (!config.titrationSteps || config.titrationSteps.length === 0) {
    return { amount: config.amount, unit: config.unit };
  }
  // Sorted defensively rather than trusting array order — hand-authored steps (added/edited one
  // field at a time in the UI) can briefly sit out of week order before the user finishes typing.
  const sorted = [...config.titrationSteps].sort((a, b) => a.startWeek - b.startWeek);
  const step = [...sorted].reverse().find((s) => week >= s.startWeek) ?? sorted[0];
  return { amount: step.amount, unit: step.unit };
};

const DURATION_UNIT_TO_WEEKS: Record<string, number> = {
  day: 1 / 7,
  days: 1 / 7,
  wk: 1,
  wks: 1,
  week: 1,
  weeks: 1,
  month: 4.345,
  months: 4.345
};

// Cycle text across all three sources is freeform (e.g. "4 wk on / 2 wk off", "6-8 weeks on / 2
// weeks off", "8 weeks on, 4-8 weeks off.", "10-20 days on / 6 months off"). Extracts an "on N
// weeks / off M weeks" pair from any of those phrasings, converting day/month units to weeks so
// the on/off clauses don't have to share a unit; returns null for genuinely non-cycling text
// ("Ongoing wellness support", "8-12 weeks continuous", etc.) so those peptides correctly stay
// continuous. The separator between the on and off clauses is a "/" or "," since sources use both.
// When a value is a range, takes the shorter "on" duration and the longer "off" duration — the
// more conservative reading — since sources often give a range rather than one exact number.
const parseCycleOnOffText = (cycleText: string): { onWeeks: number; offWeeks: number } | null => {
  const match = cycleText.match(
    /(\d+)(?:-(\d+))?\s*(day|days|wk|wks|week|weeks|month|months)\s*on\s*(?:\/|,)\s*(\d+)(?:-(\d+))?\s*(day|days|wk|wks|week|weeks|month|months)\s*off/i
  );
  if (!match) return null;

  const onAmount = Number(match[1]);
  const offAmount = Number(match[5] ?? match[4]);
  if (!Number.isFinite(onAmount) || !Number.isFinite(offAmount) || onAmount <= 0) return null;

  const onWeeksRaw = onAmount * DURATION_UNIT_TO_WEEKS[match[3].toLowerCase()];
  const offWeeksRaw = offAmount * DURATION_UNIT_TO_WEEKS[match[6].toLowerCase()];

  const onWeeks = Math.max(1, Math.round(onWeeksRaw));
  const offWeeks = Math.round(offWeeksRaw);

  return { onWeeks, offWeeks };
};

// Builds a dose config that titrates through `track` week-by-week, starting from its first step.
// Shared by every place that needs to switch a peptide onto auto-titration: manual selection,
// adding a peptide, and switching database sources — so "has a titration track" always produces
// the same config shape.
const buildTitratedDoseConfig = (track: GoalDoseOption[], startDay: string): PeptideDoseConfig => {
  const firstSchedule = track[0].timelineSchedule;
  const days = firstSchedule.days.length > 0 ? [...firstSchedule.days] : DEFAULT_DAYS_BY_FREQUENCY[firstSchedule.frequency];
  return {
    amount: firstSchedule.amount,
    unit: firstSchedule.unit,
    frequency: firstSchedule.frequency,
    days,
    startDay,
    titrationSteps: track.map((step) => ({
      startWeek: parseWeekStart(step.label)!,
      amount: step.timelineSchedule.amount,
      unit: step.timelineSchedule.unit
    })),
    titrationMode: "auto"
  };
};

// A newly-added peptide (or one switching dosing source) defaults onto its detected titration
// track whenever one exists — that's the database's recommended schedule, so the calendar should
// step through it automatically rather than sitting flat on the first stage. Only peptides/sources
// with no real week-by-week ladder (a single protocol, or same-peptide alternatives with no week
// numbers) fall back to a flat dose.
const buildDefaultDoseConfig = (
  peptide: PeptideProtocolInfo,
  defaultStartDate: string,
  source: DosingSourceId = "pep-pedia"
): PeptideDoseConfig => {
  const track = getTitrationTrackForSource(peptide, source);
  if (track) return buildTitratedDoseConfig(track, defaultStartDate);

  const schedule = getGoalOptionsForSource(peptide, source)[0]?.timelineSchedule ?? peptide.dosingSchedule;
  const days = schedule.days.length > 0 ? [...schedule.days] : DEFAULT_DAYS_BY_FREQUENCY[schedule.frequency];
  return {
    amount: schedule.amount,
    unit: schedule.unit,
    frequency: schedule.frequency,
    days,
    startDay: defaultStartDate
  };
};

export type ProtocolTimelineDose = {
  id: string;
  name: string;
  amount: string;
  unit: string;
  frequency: string;
  days: string[];
  route: string;
  peptideWeek: number;
  site: string;
  pep: PeptideProtocolInfo;
};

export function useProtocolBuilderState(
  protocol: ProtocolRecord,
  onPersist: (data: PersistedProtocolBuilderPayload) => void
) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPeptides, setSelectedPeptides] = useState<PeptideProtocolInfo[]>([]);
  const [doseConfigByPeptide, setDoseConfigByPeptide] = useState<Record<string, PeptideDoseConfig>>({});
  const [builderMode, setBuilderMode] = useState<"automatic" | "manual">("automatic");
  const [protocolDataSource, setProtocolDataSource] = useState<DosingSourceId>("pep-pedia");
  // Per-peptide override of protocolDataSource — lets a peptide use a different dosing source
  // than the protocol's overall default. Absent entry = "follow the default".
  const [sourceOverrideByPeptide, setSourceOverrideByPeptide] = useState<Record<string, DosingSourceId>>({});
  const [selectedGoalOptionByPeptide, setSelectedGoalOptionByPeptide] = useState<Record<string, string>>({});

  const [timeframeWeeks, setTimeframeWeeks] = useState(12);
  const [bodyWeight, setBodyWeight] = useState(80);
  const [bodyWeightTouched, setBodyWeightTouched] = useState(false);
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");
  const [protocolStartDate, setProtocolStartDate] = useState(() => toIsoDate(new Date()));

  const [timelineGenerated, setTimelineGenerated] = useState(false);
  const [timelineViewMode, setTimelineViewMode] = useState<"day" | "week" | "month">("day");
  const [selectedDate, setSelectedDate] = useState(() => toIsoDate(new Date()));
  const [completedDoses, setCompletedDoses] = useState<Record<string, boolean>>({});
  const [expandedIntel, setExpandedIntel] = useState<Record<string, boolean>>({});
  const [timelineFormError, setTimelineFormError] = useState<string | null>(null);
  const [hasHydratedPersistedState, setHasHydratedPersistedState] = useState(false);
  const persistTimeoutRef = useRef<number | null>(null);

  // --- Hydrate from the protocol record passed in by useProtocols() ---
  // ProtocolBuilder remounts this hook (via key={protocol.id}) whenever the active protocol
  // changes, so this only ever needs to run once per mount against that protocol's own data.
  useEffect(() => {
    try {
      const parsed = protocol.data;
      if (!parsed) {
        setHasHydratedPersistedState(true);
        return;
      }

      let restoredPeptides: PeptideProtocolInfo[] = [];
      if (Array.isArray(parsed.selectedPeptideIds)) {
        restoredPeptides = parsed.selectedPeptideIds
          .map((id) => PEPTIDES_DATABASE.find((p) => p.id === id))
          .filter((p): p is PeptideProtocolInfo => Boolean(p));
        setSelectedPeptides(restoredPeptides);
      }

      const restoredDataSource: DosingSourceId =
        parsed.protocolDataSource === "pep-pedia" ||
        parsed.protocolDataSource === "peptidedosages" ||
        parsed.protocolDataSource === "peptide-db"
          ? parsed.protocolDataSource
          : "pep-pedia";
      setProtocolDataSource(restoredDataSource);

      const restoredSourceOverrides: Record<string, DosingSourceId> =
        parsed.sourceOverrideByPeptide && typeof parsed.sourceOverrideByPeptide === "object"
          ? parsed.sourceOverrideByPeptide
          : {};
      setSourceOverrideByPeptide(restoredSourceOverrides);

      const restoredGoalOptions: Record<string, string> =
        parsed.selectedGoalOptionByPeptide && typeof parsed.selectedGoalOptionByPeptide === "object"
          ? parsed.selectedGoalOptionByPeptide
          : {};
      setSelectedGoalOptionByPeptide(restoredGoalOptions);

      if (parsed.doseConfigByPeptide && typeof parsed.doseConfigByPeptide === "object") {
        // One-time upgrade for protocols saved before auto-titration became the default: a
        // peptide sitting flat on exactly a detected track's first step (never explicitly moved
        // to a different stage) picks up full week-by-week titration now. A peptide sitting on
        // any other stage, or with no detectable track, was a deliberate choice and is untouched.
        const upgraded: Record<string, PeptideDoseConfig> = {};
        for (const [peptideId, config] of Object.entries(parsed.doseConfigByPeptide as Record<string, PeptideDoseConfig>)) {
          const peptide = restoredPeptides.find((p) => p.id === peptideId);
          const alreadyTitrating = config.titrationSteps && config.titrationSteps.length > 0;
          if (alreadyTitrating || !peptide) {
            upgraded[peptideId] = config;
            continue;
          }
          const effectiveSource = restoredSourceOverrides[peptideId] ?? restoredDataSource;
          const track = getTitrationTrackForSource(peptide, effectiveSource);
          const firstStep = track?.[0];
          const isOnFirstStep =
            !!firstStep &&
            (restoredGoalOptions[peptideId] === firstStep.id ||
              (config.amount === firstStep.timelineSchedule.amount && config.unit === firstStep.timelineSchedule.unit));
          upgraded[peptideId] =
            track && isOnFirstStep ? buildTitratedDoseConfig(track, config.startDay) : config;
        }
        setDoseConfigByPeptide(upgraded);
      }

      if (parsed.builderMode === "automatic" || parsed.builderMode === "manual") {
        setBuilderMode(parsed.builderMode);
      }

      if (typeof parsed.timeframeWeeks === "number") {
        setTimeframeWeeks(parsed.timeframeWeeks);
      }

      if (typeof parsed.bodyWeight === "number" && Number.isFinite(parsed.bodyWeight)) {
        setBodyWeight(parsed.bodyWeight);
      }

      if (typeof parsed.bodyWeightTouched === "boolean") {
        setBodyWeightTouched(parsed.bodyWeightTouched);
      }

      if (parsed.weightUnit === "kg" || parsed.weightUnit === "lbs") {
        setWeightUnit(parsed.weightUnit);
      }

      if (typeof parsed.protocolStartDate === "string" && parsed.protocolStartDate) {
        setProtocolStartDate(parsed.protocolStartDate);
      }

      if (typeof parsed.timelineGenerated === "boolean") {
        setTimelineGenerated(parsed.timelineGenerated);
      }

      if (parsed.timelineViewMode === "day" || parsed.timelineViewMode === "week" || parsed.timelineViewMode === "month") {
        setTimelineViewMode(parsed.timelineViewMode);
      }

      if (typeof parsed.selectedDate === "string" && parsed.selectedDate) {
        setSelectedDate(parsed.selectedDate);
      }

      if (parsed.completedDoses && typeof parsed.completedDoses === "object") {
        setCompletedDoses(parsed.completedDoses);
      }

      if (parsed.expandedIntel && typeof parsed.expandedIntel === "object") {
        setExpandedIntel(parsed.expandedIntel);
      }
    } catch (error) {
      console.error("Failed to restore protocol data", error);
    } finally {
      setHasHydratedPersistedState(true);
    }
    // Intentionally runs once per mount (this hook is remounted per protocol via a `key` prop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Debounced persist to the backend ---
  useEffect(() => {
    if (!hasHydratedPersistedState) return;

    const payload: PersistedProtocolBuilderPayload = {
      selectedPeptideIds: selectedPeptides.map((p) => p.id),
      doseConfigByPeptide,
      builderMode,
      protocolDataSource,
      sourceOverrideByPeptide,
      selectedGoalOptionByPeptide,
      timeframeWeeks,
      bodyWeight,
      bodyWeightTouched,
      weightUnit,
      protocolStartDate,
      timelineGenerated,
      timelineViewMode,
      selectedDate,
      completedDoses,
      expandedIntel
    };

    if (persistTimeoutRef.current !== null) {
      window.clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = window.setTimeout(() => {
      onPersist(payload);
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [
    hasHydratedPersistedState,
    onPersist,
    selectedPeptides,
    doseConfigByPeptide,
    builderMode,
    protocolDataSource,
    sourceOverrideByPeptide,
    selectedGoalOptionByPeptide,
    timeframeWeeks,
    bodyWeight,
    bodyWeightTouched,
    weightUnit,
    protocolStartDate,
    timelineGenerated,
    timelineViewMode,
    selectedDate,
    completedDoses,
    expandedIntel
  ]);

  // --- Search ---
  const filteredPeptides = useMemo(() => {
    if (!searchQuery) return [];
    const query = searchQuery.toLowerCase();
    return PEPTIDES_DATABASE.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const suggestions = useMemo(() => {
    return PEPTIDES_DATABASE.filter((p) => !selectedPeptides.some((sel) => sel.id === p.id));
  }, [selectedPeptides]);

  // --- Stack interactions ---
  const activeInteractions = useMemo(() => {
    const list: { interaction: (typeof PEPTIDE_INTERACTIONS)[number]; nameA: string; nameB: string; idA: string; idB: string }[] = [];
    for (let i = 0; i < selectedPeptides.length; i++) {
      for (let j = i + 1; j < selectedPeptides.length; j++) {
        const idA = selectedPeptides[i].id;
        const idB = selectedPeptides[j].id;
        const match = PEPTIDE_INTERACTIONS.find(
          (inter) =>
            (inter.peptideA === idA && inter.peptideB === idB) ||
            (inter.peptideA === idB && inter.peptideB === idA)
        );
        if (match) {
          list.push({ interaction: match, nameA: selectedPeptides[i].name, nameB: selectedPeptides[j].name, idA, idB });
        }
      }
    }
    return list;
  }, [selectedPeptides]);

  // --- Stack mutation ---
  const addPeptide = (peptide: PeptideProtocolInfo) => {
    if (!selectedPeptides.some((p) => p.id === peptide.id)) {
      setSelectedPeptides((prev) => [...prev, peptide]);
      const config = buildDefaultDoseConfig(peptide, protocolStartDate, protocolDataSource);
      setDoseConfigByPeptide((prev) => ({
        ...prev,
        [peptide.id]: config
      }));
      // A titrating config has no single "selected goal option" — the Protocol goal dropdown
      // shows its Auto-titrate entry based on config.titrationSteps, not this map.
      if (!config.titrationSteps?.length) {
        const defaultGoalOptionId = getGoalOptionsForSource(peptide, protocolDataSource)[0]?.id;
        if (defaultGoalOptionId) {
          setSelectedGoalOptionByPeptide((prev) => ({ ...prev, [peptide.id]: defaultGoalOptionId }));
        }
      }
    }
    setTimelineFormError(null);
    setSearchQuery("");
  };

  const removePeptide = (id: string) => {
    setSelectedPeptides((prev) => prev.filter((p) => p.id !== id));
    setDoseConfigByPeptide((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelectedGoalOptionByPeptide((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSourceOverrideByPeptide((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const setGoalDoseOption = (peptideId: string, optionId: string) => {
    const peptide = selectedPeptides.find((p) => p.id === peptideId);
    const option = peptide?.goalDoseOptions?.find((o) => o.id === optionId);
    const schedule = option?.timelineSchedule;
    if (!schedule) return;

    setSelectedGoalOptionByPeptide((prev) => ({ ...prev, [peptideId]: optionId }));
    setDoseConfigByPeptide((prev) => ({
      ...prev,
      // A fresh object (not spreading the previous config) — picking one flat stage cancels any
      // titrationSteps that may have been active.
      [peptideId]: {
        amount: schedule.amount,
        unit: schedule.unit,
        frequency: schedule.frequency,
        days: [...schedule.days],
        startDay: prev[peptideId]?.startDay ?? protocolStartDate
      }
    }));
    setTimelineFormError(null);
  };

  // Switches a peptide to auto-titration: the calendar will step its dose through the detected
  // sequence by protocol week instead of using one flat amount. amount/unit/frequency/days are
  // seeded from the first step so the (still-visible) dose fields read correctly for week 1.
  const setTitrationTrack = (peptideId: string) => {
    const peptide = selectedPeptides.find((p) => p.id === peptideId);
    if (!peptide) return;
    const track = getTitrationTrackForSource(peptide, getEffectiveSource(peptideId));
    if (!track) return;

    setSelectedGoalOptionByPeptide((prev) => {
      const next = { ...prev };
      delete next[peptideId];
      return next;
    });
    setDoseConfigByPeptide((prev) => ({
      ...prev,
      [peptideId]: buildTitratedDoseConfig(track, prev[peptideId]?.startDay ?? protocolStartDate)
    }));
    setTimelineFormError(null);
  };

  // Enters hand-editing mode for a peptide's titration schedule — available in both Automatic and
  // Manual builder modes. Seeds the editable steps from whatever is currently active: a copy of
  // the database track's steps if one is already auto-titrating (so editing starts from something
  // sensible rather than wiping it), or a single step from the flat dose otherwise. Setting
  // titrationMode to "manual" is what hides the Protocol goal dropdown in favor of the step editor.
  const switchToManualTitration = (peptideId: string) => {
    setSelectedGoalOptionByPeptide((prev) => {
      const next = { ...prev };
      delete next[peptideId];
      return next;
    });
    setDoseConfigByPeptide((prev) => {
      const current = prev[peptideId];
      if (!current) return prev;
      const steps =
        current.titrationSteps && current.titrationSteps.length > 0
          ? current.titrationSteps.map((step) => ({ ...step }))
          : [{ startWeek: 1, amount: current.amount, unit: current.unit }];
      return {
        ...prev,
        [peptideId]: { ...current, titrationSteps: steps, titrationMode: "manual" }
      };
    });
    setTimelineFormError(null);
  };

  // The earliest-week step doubles as the config's flat amount/unit (shown in the Dose/Unit
  // fields and used as the fallback in resolveDoseForWeek), so any edit to the steps keeps
  // amount/unit mirrored to whichever step currently has the lowest startWeek.
  const withFirstStepSynced = (config: PeptideDoseConfig, steps: NonNullable<PeptideDoseConfig["titrationSteps"]>): PeptideDoseConfig => {
    const firstStep = [...steps].sort((a, b) => a.startWeek - b.startWeek)[0];
    return {
      ...config,
      amount: firstStep?.amount ?? config.amount,
      unit: firstStep?.unit ?? config.unit,
      titrationSteps: steps
    };
  };

  const addTitrationStep = (peptideId: string) => {
    setDoseConfigByPeptide((prev) => {
      const current = prev[peptideId];
      const steps = current?.titrationSteps;
      if (!current || !steps || steps.length === 0) return prev;
      const last = steps[steps.length - 1];
      const nextStep = { startWeek: last.startWeek + 1, amount: last.amount, unit: last.unit };
      return { ...prev, [peptideId]: withFirstStepSynced(current, [...steps, nextStep]) };
    });
    setTimelineFormError(null);
  };

  const updateTitrationStep = (
    peptideId: string,
    index: number,
    partial: Partial<{ startWeek: number; amount: string; unit: PeptideDoseConfig["unit"] }>
  ) => {
    setDoseConfigByPeptide((prev) => {
      const current = prev[peptideId];
      const steps = current?.titrationSteps;
      if (!current || !steps) return prev;
      const nextSteps = steps.map((step, i) => (i === index ? { ...step, ...partial } : step));
      return { ...prev, [peptideId]: withFirstStepSynced(current, nextSteps) };
    });
    setTimelineFormError(null);
  };

  const removeTitrationStep = (peptideId: string, index: number) => {
    setDoseConfigByPeptide((prev) => {
      const current = prev[peptideId];
      const steps = current?.titrationSteps;
      if (!current || !steps) return prev;
      const nextSteps = steps.filter((_, i) => i !== index);
      // Removing the last remaining step reverts the peptide to a plain flat dose.
      if (nextSteps.length === 0) {
        return { ...prev, [peptideId]: { ...current, titrationSteps: undefined } };
      }
      return { ...prev, [peptideId]: withFirstStepSynced(current, nextSteps) };
    });
    setTimelineFormError(null);
  };

  const clearTitrationSteps = (peptideId: string) => {
    setDoseConfigByPeptide((prev) => {
      const current = prev[peptideId];
      if (!current) return prev;
      return { ...prev, [peptideId]: { ...current, titrationSteps: undefined } };
    });
    setTimelineFormError(null);
  };

  const updateDoseConfig = (peptideId: string, partial: Partial<PeptideDoseConfig>) => {
    setTimelineFormError(null);
    setDoseConfigByPeptide((prev) => {
      const current = prev[peptideId];
      // A hand-edit to the dose itself is a deliberate override — it must not keep being
      // silently re-clobbered by the week-based titration lookup in getDosesForDate.
      const clearsTitration = "amount" in partial || "unit" in partial;
      return {
        ...prev,
        [peptideId]: {
          ...current,
          ...partial,
          titrationSteps: clearsTitration ? undefined : current?.titrationSteps
        }
      };
    });
  };

  const setFrequency = (peptideId: string, frequency: PeptideDoseConfig["frequency"]) => {
    updateDoseConfig(peptideId, { frequency, days: DEFAULT_DAYS_BY_FREQUENCY[frequency] });
  };

  const toggleDoseDay = (peptideId: string, day: string) => {
    setTimelineFormError(null);
    setDoseConfigByPeptide((prev) => {
      const current = prev[peptideId]?.days ?? [];
      const exists = current.includes(day);
      return {
        ...prev,
        [peptideId]: {
          ...prev[peptideId],
          days: exists ? current.filter((d) => d !== day) : [...current, day]
        }
      };
    });
  };

  const toggleIntel = (id: string) => {
    setExpandedIntel((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // A peptide follows the protocol's overall dosing reference unless it has its own override set
  // (via setPeptideSourceOverride) — lets a user pull one specific peptide from a different
  // database without changing the source for every other peptide in the protocol.
  const getEffectiveSource = (peptideId: string): DosingSourceId => sourceOverrideByPeptide[peptideId] ?? protocolDataSource;

  const setPeptideSourceOverride = (peptideId: string, source: DosingSourceId | null) => {
    setSourceOverrideByPeptide((prev) => {
      if (source === null) {
        const next = { ...prev };
        delete next[peptideId];
        return next;
      }
      return { ...prev, [peptideId]: source };
    });

    // Re-sync the goal preset and dose fields to the newly-selected source's default row, so the
    // displayed dose doesn't stay stuck on the previous source's numbers under a goal label that
    // no longer matches (the two drifted independently before this resync existed).
    const peptide = selectedPeptides.find((p) => p.id === peptideId);
    if (!peptide) return;
    const effectiveSource = source ?? protocolDataSource;

    // If the newly-selected source has its own titration ladder for this peptide, adopt it — a
    // database switch shouldn't silently drop back to a flat dose when the new source also
    // recommends stepping the dose up over time.
    const track = getTitrationTrackForSource(peptide, effectiveSource);
    if (track) {
      setSelectedGoalOptionByPeptide((prev) => {
        const next = { ...prev };
        delete next[peptideId];
        return next;
      });
      setDoseConfigByPeptide((prev) => ({
        ...prev,
        [peptideId]: buildTitratedDoseConfig(track, prev[peptideId]?.startDay ?? protocolStartDate)
      }));
      return;
    }

    const defaultOption = getGoalOptionsForSource(peptide, effectiveSource)[0];
    if (!defaultOption) return;

    setSelectedGoalOptionByPeptide((prev) => ({ ...prev, [peptideId]: defaultOption.id }));
    setDoseConfigByPeptide((prev) => ({
      ...prev,
      [peptideId]: {
        amount: defaultOption.timelineSchedule.amount,
        unit: defaultOption.timelineSchedule.unit,
        frequency: defaultOption.timelineSchedule.frequency,
        days: [...defaultOption.timelineSchedule.days],
        startDay: prev[peptideId]?.startDay ?? protocolStartDate
      }
    }));
  };

  const getGoalOptionsForCurrentSource = (peptide: PeptideProtocolInfo) =>
    getGoalOptionsForSource(peptide, getEffectiveSource(peptide.id));

  const getTitrationTrackForCurrentSource = (peptide: PeptideProtocolInfo) =>
    getTitrationTrackForSource(peptide, getEffectiveSource(peptide.id));

  // The "use source default" cycle control needs to know, per peptide, whether its effective
  // dosing source actually publishes a structured on/off cycle — most peptidedosages/peptide-db
  // cycle text doesn't (it's continuous-duration prose, not "X on / Y off").
  const getSourceCycleInfo = (peptide: PeptideProtocolInfo) => {
    const source = getEffectiveSource(peptide.id);
    const text = getSourceCycleText(peptide, source);
    const parsed = text ? parseCycleOnOffText(text) : null;
    return { text, parsed, sourceLabel: DOSING_SOURCE_LABELS[source] };
  };

  // --- Derived timeline ---
  const protocolStartDateObj = useMemo(() => parseIsoDate(protocolStartDate), [protocolStartDate]);

  // Active doses for a single calendar date — evaluated directly against each peptide's own
  // start date and cycle phase, so Day/Week/Month can page to any date, not just the nominal
  // 1..timeframeWeeks window.
  const getDosesForDate = useCallback(
    (dateIso: string): ProtocolTimelineDose[] => {
      const date = parseIsoDate(dateIso);
      const shortDay = JS_DAY_SHORT[date.getDay()];

      return selectedPeptides
        .map((pep): ProtocolTimelineDose | null => {
          const effectiveSource = getEffectiveSource(pep.id);
          const config = doseConfigByPeptide[pep.id] ?? buildDefaultDoseConfig(pep, protocolStartDate, effectiveSource);
          if (!config.days.includes(shortDay)) return null;

          const peptideStartDate = parseIsoDate(config.startDay || protocolStartDate);
          const daysFromStart = Math.floor((date.getTime() - peptideStartDate.getTime()) / (1000 * 60 * 60 * 24));
          const peptideWeek = Math.floor(daysFromStart / 7) + 1;
          if (peptideWeek < 1) return null;

          let isOnCycle = true;
          if (config.cycleOnWeeks && config.cycleOnWeeks > 0) {
            // User-defined cycle (Manual mode only) overrides the active source's default.
            const totalWeeks = config.cycleOnWeeks + (config.cycleOffWeeks ?? 0);
            isOnCycle = totalWeeks <= 0 || (peptideWeek - 1) % totalWeeks < config.cycleOnWeeks;
          } else {
            const sourceCycleText = getSourceCycleText(pep, effectiveSource);
            const sourceCycle = sourceCycleText ? parseCycleOnOffText(sourceCycleText) : null;
            if (sourceCycle) {
              const totalWeeks = sourceCycle.onWeeks + sourceCycle.offWeeks;
              isOnCycle = totalWeeks <= 0 || (peptideWeek - 1) % totalWeeks < sourceCycle.onWeeks;
            }
          }
          if (!isOnCycle) return null;

          // Oral/topical compounds legitimately have no injectionSites — don't invent an "Abdomen"
          // site for a capsule (a handful of peptide-db-only entries like MK-677 hit this).
          let site = pep.injectionSites[0] ?? "";
          if (pep.injectionSites.length > 1) {
            const siteIdx = (peptideWeek - 1) % pep.injectionSites.length;
            site = pep.injectionSites[siteIdx];
          }

          const { amount, unit } = resolveDoseForWeek(config, peptideWeek);

          // Route follows whichever goal-dose option is actually selected (e.g. a peptide-db row
          // tagged "Oral" vs "SubQ" for the same peptide) rather than the peptide's single fixed
          // standardRoute, which only ever records one route even for multi-route peptides.
          const sourceOptions = getGoalOptionsForSource(pep, effectiveSource);
          const selectedOptionId = selectedGoalOptionByPeptide[pep.id] ?? sourceOptions[0]?.id;
          const selectedOption = sourceOptions.find((option) => option.id === selectedOptionId);
          const route = selectedOption?.route ?? pep.standardRoute;

          return {
            id: pep.id,
            name: pep.name,
            amount,
            unit,
            frequency: config.frequency,
            days: config.days,
            route,
            peptideWeek,
            site,
            pep
          };
        })
        .filter((d): d is ProtocolTimelineDose => d !== null);
    },
    [selectedPeptides, doseConfigByPeptide, protocolStartDate, protocolDataSource, sourceOverrideByPeptide, selectedGoalOptionByPeptide]
  );

  const getWeekDays = useCallback(
    (dateIso: string) => {
      const anchor = startOfWeek(parseIsoDate(dateIso));
      return Array.from({ length: 7 }, (_, idx) => {
        const date = addDays(anchor, idx);
        const iso = toIsoDate(date);
        return { date, iso, shortDay: JS_DAY_SHORT[date.getDay()], doses: getDosesForDate(iso) };
      });
    },
    [getDosesForDate]
  );

  const getMonthGrid = useCallback(
    (dateIso: string) => {
      const focusDate = parseIsoDate(dateIso);
      const year = focusDate.getFullYear();
      const month = focusDate.getMonth();
      const firstOfMonth = new Date(year, month, 1);
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const gridStart = startOfWeek(firstOfMonth);
      const totalCells = Math.ceil((firstOfMonth.getDay() + daysInMonth) / 7) * 7;

      return Array.from({ length: totalCells }, (_, idx) => {
        const date = addDays(gridStart, idx);
        const iso = toIsoDate(date);
        return { date, iso, inMonth: date.getMonth() === month, doses: getDosesForDate(iso) };
      });
    },
    [getDosesForDate]
  );

  const currentProtocolWeek = useMemo(() => {
    const daysSinceStart = Math.floor((Date.now() - protocolStartDateObj.getTime()) / (1000 * 60 * 60 * 24));
    const rawWeek = Math.floor(daysSinceStart / 7) + 1;
    return Math.min(Math.max(rawWeek, 1), Math.max(timeframeWeeks, 1));
  }, [protocolStartDateObj, timeframeWeeks]);

  const dosesDueToday = useMemo(() => {
    if (!timelineGenerated) return 0;
    return getDosesForDate(toIsoDate(new Date())).length;
  }, [timelineGenerated, getDosesForDate]);

  const dosesCompletedToday = useMemo(() => {
    if (!timelineGenerated) return 0;
    const todayIso = toIsoDate(new Date());
    return getDosesForDate(todayIso).filter((d) => completedDoses[`${todayIso}:${d.id}`]).length;
  }, [timelineGenerated, getDosesForDate, completedDoses]);

  const toggleDoseCompletion = (dateIso: string, peptideId: string) => {
    const key = `${dateIso}:${peptideId}`;
    setCompletedDoses((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isDoseCompleted = (dateIso: string, peptideId: string) => !!completedDoses[`${dateIso}:${peptideId}`];

  const stepDate = (direction: 1 | -1) => {
    setSelectedDate((prev) => {
      const date = parseIsoDate(prev);
      if (timelineViewMode === "day") return toIsoDate(addDays(date, direction));
      if (timelineViewMode === "week") return toIsoDate(addDays(date, direction * 7));
      const next = new Date(date);
      next.setMonth(next.getMonth() + direction);
      return toIsoDate(next);
    });
  };

  const goToToday = () => setSelectedDate(toIsoDate(new Date()));

  const hasValidBodyWeight = Number.isFinite(bodyWeight) && bodyWeight >= 30;
  const canGenerateTimeline = selectedPeptides.length > 0 && bodyWeightTouched && hasValidBodyWeight;

  const handleGenerateTimeline = () => {
    if (!canGenerateTimeline) {
      if (!bodyWeightTouched || !hasValidBodyWeight) {
        setTimelineFormError("Before generating a protocol, enter a valid body weight (30 or more).");
      }
      return false;
    }
    setTimelineFormError(null);
    setTimelineGenerated(true);
    return true;
  };

  const handleClearProtocol = () => {
    const todayIso = toIsoDate(new Date());
    setSearchQuery("");
    setSelectedPeptides([]);
    setDoseConfigByPeptide({});
    setBuilderMode("automatic");
    setProtocolDataSource("pep-pedia");
    setSourceOverrideByPeptide({});
    setSelectedGoalOptionByPeptide({});
    setTimeframeWeeks(12);
    setBodyWeight(80);
    setBodyWeightTouched(false);
    setWeightUnit("kg");
    setProtocolStartDate(todayIso);
    setTimelineGenerated(false);
    setTimelineViewMode("day");
    setSelectedDate(todayIso);
    setCompletedDoses({});
    setExpandedIntel({});
    setTimelineFormError(null);
  };

  return {
    searchQuery,
    setSearchQuery,
    selectedPeptides,
    doseConfigByPeptide,
    builderMode,
    setBuilderMode,
    protocolDataSource,
    setProtocolDataSource,
    sourceOverrideByPeptide,
    setPeptideSourceOverride,
    getEffectiveSource,
    getGoalOptionsForCurrentSource,
    getTitrationTrackForCurrentSource,
    getSourceCycleInfo,
    selectedGoalOptionByPeptide,
    setGoalDoseOption,
    setTitrationTrack,
    switchToManualTitration,
    addTitrationStep,
    updateTitrationStep,
    removeTitrationStep,
    clearTitrationSteps,
    timeframeWeeks,
    setTimeframeWeeks,
    bodyWeight,
    setBodyWeight,
    bodyWeightTouched,
    setBodyWeightTouched,
    weightUnit,
    setWeightUnit,
    protocolStartDate,
    setProtocolStartDate,
    protocolStartDateObj,
    timelineGenerated,
    timelineViewMode,
    setTimelineViewMode,
    selectedDate,
    setSelectedDate,
    stepDate,
    goToToday,
    expandedIntel,
    toggleIntel,
    timelineFormError,
    filteredPeptides,
    suggestions,
    activeInteractions,
    getDosesForDate,
    getWeekDays,
    getMonthGrid,
    currentProtocolWeek,
    dosesDueToday,
    dosesCompletedToday,
    completedDoses,
    toggleDoseCompletion,
    isDoseCompleted,
    canGenerateTimeline,
    hasValidBodyWeight,
    addPeptide,
    removePeptide,
    updateDoseConfig,
    setFrequency,
    toggleDoseDay,
    handleGenerateTimeline,
    handleClearProtocol
  };
}

export type ProtocolBuilderState = ReturnType<typeof useProtocolBuilderState>;
