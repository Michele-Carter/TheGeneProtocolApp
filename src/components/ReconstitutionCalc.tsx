/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/react";
import { getUserState, putUserState } from "../lib/userStateApi";
import { Info, AlertTriangle, Calculator, CheckCircle2, ChevronDown } from "lucide-react";

type ReconstitutionPersistedState = {
  vialContentType?: "mass" | "potency";
  vialWeightMg: number;
  vialPotencyIu?: number;
  potencyCompound?: "hgh" | "hcg" | "other";
  vialMgEquivalent?: number;
  vialSizeMl: number;
  bacWaterMl: number;
  doseValue: number;
  doseUnit: "MG" | "MCG" | "IU";
  frequency: "daily" | "twice" | "weekly" | "custom";
  customFrequencyType: "perDay" | "perWeek";
  customFrequencyValue: number;
  syringeType: "30u" | "50u" | "100u" | "1mL" | "3mL" | "pen";
};

// Semicircle "speedometer" dial: needle sweeps left (0 clicks) to right (max clicks), matching
// the physical dial on an auto-injector pen. Uses pathLength=100 on both arcs so the progress
// arc's dash offset is just "100 - fillPercentage", no arc-length trig required.
function PenDialGauge({
  clicksToShow,
  maxUnits,
  fillPercentage
}: {
  clicksToShow: number;
  maxUnits: number;
  fillPercentage: number;
}) {
  const needleRotation = -90 + (fillPercentage / 100) * 180;

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 200 115" className="w-[92px] shrink-0">
        <path
          d="M 15 105 A 85 85 0 0 1 185 105"
          fill="none"
          stroke="#1e293b"
          strokeWidth={16}
          strokeLinecap="round"
          pathLength={100}
        />
        <path
          d="M 15 105 A 85 85 0 0 1 185 105"
          fill="none"
          stroke="#dba931"
          strokeWidth={16}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - fillPercentage}
          style={{ filter: "drop-shadow(0 0 4px rgba(219,169,49,0.55))", transition: "stroke-dashoffset 300ms ease" }}
        />
        <line
          x1={100}
          y1={105}
          x2={100}
          y2={26}
          stroke="#e2e8f0"
          strokeWidth={4}
          strokeLinecap="round"
          style={{ transform: `rotate(${needleRotation}deg)`, transformOrigin: "100px 105px", transition: "transform 300ms ease" }}
        />
        <circle cx={100} cy={105} r={7} fill="#e2e8f0" />
        <text x={15} y={112} fontSize={11} fill="#64748b" fontFamily="monospace">0</text>
        <text x={185} y={112} fontSize={11} fill="#64748b" fontFamily="monospace" textAnchor="end">
          {maxUnits}
        </text>
      </svg>
      <div className="min-w-0 text-base font-bold text-white">
        Dial to <span className="text-gold-400 font-mono">{clicksToShow}</span> on your pen
      </div>
    </div>
  );
}

// Horizontal syringe illustration: barrel + plunger with a gold fill showing the calculated
// draw against the device's full capacity, plus tick marks along the barrel matching the
// device's own unit scale (e.g. 0/10/20.../100 for a 100u syringe).
function SyringeIllustration({
  fillPercentage,
  ticks,
  maxUnits
}: {
  fillPercentage: number;
  ticks: number[];
  maxUnits: number;
}) {
  const barrelX = 70;
  const barrelWidth = 400;
  const barrelY = 40;
  const barrelHeight = 34;
  const fillWidth = (Math.min(100, Math.max(0, fillPercentage)) / 100) * barrelWidth;

  return (
    <svg viewBox="0 0 560 110" className="w-full">
      {/* Needle */}
      <line x1={0} y1={barrelY + barrelHeight / 2} x2={30} y2={barrelY + barrelHeight / 2} stroke="#94a3b8" strokeWidth={2} />
      {/* Hub */}
      <path
        d={`M 30 ${barrelY + 6} L ${barrelX} ${barrelY} L ${barrelX} ${barrelY + barrelHeight} L 30 ${barrelY + barrelHeight - 6} Z`}
        fill="#c2911f"
      />
      {/* Barrel outline */}
      <rect x={barrelX} y={barrelY} width={barrelWidth} height={barrelHeight} rx={6} fill="#0b1220" stroke="#334155" strokeWidth={2} />
      {/* Gold fill representing the calculated draw */}
      <rect
        x={barrelX}
        y={barrelY}
        width={fillWidth}
        height={barrelHeight}
        rx={6}
        fill="#c2911f"
        opacity={0.85}
        style={{ transition: "width 300ms ease" }}
      />
      {/* Gold edge marking the calculated draw */}
      <line
        x1={barrelX + fillWidth}
        y1={barrelY - 4}
        x2={barrelX + fillWidth}
        y2={barrelY + barrelHeight + 4}
        stroke="#e8c05a"
        strokeWidth={2}
        style={{ transition: "x1 300ms ease, x2 300ms ease" }}
      />
      {/* Plunger rod + flange */}
      <rect x={barrelX + barrelWidth} y={barrelY + 10} width={40} height={barrelHeight - 20} fill="#94a3b8" />
      <rect x={barrelX + barrelWidth + 38} y={barrelY - 6} width={6} height={barrelHeight + 12} rx={2} fill="#cbd5e1" />

      {/* Tick marks + labels */}
      {ticks.map((t) => {
        const x = barrelX + (t / maxUnits) * barrelWidth;
        return (
          <g key={t}>
            <line x1={x} y1={barrelY + barrelHeight} x2={x} y2={barrelY + barrelHeight + 6} stroke="#64748b" strokeWidth={1.5} />
            <text x={x} y={barrelY + barrelHeight + 20} fontSize={10} fill="#94a3b8" fontFamily="monospace" textAnchor="middle">
              {t}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ReconstitutionCalc() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  // 1. What's in your vial? Most peptides are labeled by mass (mg); a few products (HGH, HCG)
  // are labeled by potency instead (IU per vial). Whether a mass equivalent even exists depends
  // on the specific compound (HGH: yes, a real standard; HCG: no, never) - see potencyCompound -
  // so this needs its own concentration math rather than being forced through one fake ratio.
  const [vialContentType, setVialContentType] = useState<"mass" | "potency">("mass");
  const [vialWeightMg, setVialWeightMg] = useState<number>(10);
  const [vialPotencyIu, setVialPotencyIu] = useState<number>(5000);
  // Which IU-to-mg ratio applies depends entirely on which compound this is - HGH has a
  // well-established standard (3 IU = 1mg), HCG has none at all (potency-only, no fixed mass
  // equivalent), and anything else needs whatever ratio its own box happens to print.
  const [potencyCompound, setPotencyCompound] = useState<"hgh" | "hcg" | "other">("hgh");
  // Only used by the "other" compound path: the mass equivalent printed on that specific vial's
  // box (e.g. "10 IU (3.3mg)"). Never assumed - if it's blank, there's no known ratio.
  const [vialMgEquivalent, setVialMgEquivalent] = useState<number>(0);
  const [vialSizeMl, setVialSizeMl] = useState<number>(3);

  // 2. How much diluent?
  const [bacWaterMl, setBacWaterMl] = useState<number>(2);

  // 3. What's your dose per injection?
  const [doseValue, setDoseValue] = useState<number>(250);
  const [doseUnit, setDoseUnit] = useState<"MG" | "MCG" | "IU">("MCG");

  // 4. How often will you inject?
  const [frequency, setFrequency] = useState<"daily" | "twice" | "weekly" | "custom">("daily");
  const [customFrequencyType, setCustomFrequencyType] = useState<"perDay" | "perWeek">("perWeek");
  const [customFrequencyValue, setCustomFrequencyValue] = useState<number>(3);

  // Syringe Type Selector on the right recipe card
  const [syringeType, setSyringeType] = useState<"30u" | "50u" | "100u" | "1mL" | "3mL" | "pen">("100u");
  const [showCalculationDetails, setShowCalculationDetails] = useState(false);
  const [hasHydratedPersistedState, setHasHydratedPersistedState] = useState(false);
  const persistTimeoutRef = useRef<number | null>(null);

  const clearZeroOnFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    if (event.currentTarget.value === "0") {
      event.currentTarget.value = "";
    }
  };

  const getClientToken = useCallback(async () => {
    const token = await getToken();
    return token;
  }, [getToken]);

  // Switching vial type changes which dose units are even meaningful: a potency (IU) vial can
  // only be dosed in IU (that's what's on the label), and a mass (mg) vial has no safe universal
  // IU conversion, so dose unit must follow the vial type rather than being picked independently.
  const handleVialContentTypeChange = (nextType: "mass" | "potency") => {
    setVialContentType(nextType);
    if (nextType === "potency") {
      setDoseUnit("IU");
    } else if (doseUnit === "IU") {
      setDoseUnit("MCG");
    }
  };

  // Reset to default states
  const handleReset = () => {
    setVialContentType("mass");
    setVialWeightMg(10);
    setVialPotencyIu(5000);
    setPotencyCompound("hgh");
    setVialMgEquivalent(0);
    setVialSizeMl(3);
    setBacWaterMl(2);
    setDoseValue(250);
    setDoseUnit("MCG");
    setFrequency("daily");
    setCustomFrequencyType("perWeek");
    setCustomFrequencyValue(3);
    setSyringeType("100u");
  };

  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    async function restoreState() {
      try {
        if (!isSignedIn) return;

        const parsed = await getUserState<ReconstitutionPersistedState>("reconstitution", getClientToken);
        if (!parsed || cancelled) return;

        const restoredVialContentType = parsed.vialContentType === "potency" ? "potency" : "mass";
        setVialContentType(restoredVialContentType);
        if (typeof parsed.vialWeightMg === "number") setVialWeightMg(parsed.vialWeightMg);
        if (typeof parsed.vialPotencyIu === "number") setVialPotencyIu(parsed.vialPotencyIu);
        if (parsed.potencyCompound === "hgh" || parsed.potencyCompound === "hcg" || parsed.potencyCompound === "other") {
          setPotencyCompound(parsed.potencyCompound);
        }
        if (typeof parsed.vialMgEquivalent === "number") setVialMgEquivalent(parsed.vialMgEquivalent);
        if (typeof parsed.vialSizeMl === "number") setVialSizeMl(parsed.vialSizeMl);
        if (typeof parsed.bacWaterMl === "number") setBacWaterMl(parsed.bacWaterMl);
        if (restoredVialContentType === "mass" && parsed.doseUnit === "IU") {
          // Pre-fix saves used a flat, incorrect "1 IU = 10 mcg" rule for a mass (mg) vial.
          // Migrate the stored dose to its old numeric mcg equivalent so the draw volume a
          // returning user sees doesn't silently change, while dropping the unsafe IU label.
          if (typeof parsed.doseValue === "number") setDoseValue(parsed.doseValue * 10);
          setDoseUnit("MCG");
        } else {
          if (typeof parsed.doseValue === "number") setDoseValue(parsed.doseValue);
          if (parsed.doseUnit === "MG" || parsed.doseUnit === "MCG" || parsed.doseUnit === "IU") setDoseUnit(parsed.doseUnit);
        }
        if (parsed.frequency === "daily" || parsed.frequency === "twice" || parsed.frequency === "weekly" || parsed.frequency === "custom") {
          setFrequency(parsed.frequency);
        }
        if (parsed.customFrequencyType === "perDay" || parsed.customFrequencyType === "perWeek") {
          setCustomFrequencyType(parsed.customFrequencyType);
        }
        if (typeof parsed.customFrequencyValue === "number") setCustomFrequencyValue(parsed.customFrequencyValue);
        const rawSyringeType = parsed.syringeType as string;
        if (rawSyringeType === "60u-pen" || rawSyringeType === "80u-pen") {
          // Pre-simplification builds stored a pen size; the size no longer matters (click count
          // is identical either way), so collapse both onto the single "pen" device type.
          setSyringeType("pen");
        } else if (
          parsed.syringeType === "30u" ||
          parsed.syringeType === "50u" ||
          parsed.syringeType === "100u" ||
          parsed.syringeType === "1mL" ||
          parsed.syringeType === "3mL" ||
          parsed.syringeType === "pen"
        ) {
          setSyringeType(parsed.syringeType);
        }
      } catch (error) {
        console.error("Failed to restore reconstitution state", error);
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

    const payload: ReconstitutionPersistedState = {
      vialContentType,
      vialWeightMg,
      vialPotencyIu,
      potencyCompound,
      vialMgEquivalent,
      vialSizeMl,
      bacWaterMl,
      doseValue,
      doseUnit,
      frequency,
      customFrequencyType,
      customFrequencyValue,
      syringeType,
    };

    if (persistTimeoutRef.current !== null) {
      window.clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = window.setTimeout(() => {
      void putUserState("reconstitution", payload, getClientToken).catch((error) => {
        console.error("Failed to persist reconstitution state to Neon", error);
      });
    }, 400);

    return () => {
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [
    bacWaterMl,
    customFrequencyType,
    customFrequencyValue,
    doseUnit,
    doseValue,
    frequency,
    getClientToken,
    hasHydratedPersistedState,
    isLoaded,
    isSignedIn,
    potencyCompound,
    syringeType,
    vialContentType,
    vialMgEquivalent,
    vialPotencyIu,
    vialSizeMl,
    vialWeightMg,
  ]);

  // Convert target dose value to micrograms (MCG). Only meaningful for a mass (mg) vial - a
  // potency (IU) vial's ratio (if any) is compound-specific, not universal, so that path is
  // computed separately in IU/mL below (see getMgPerVial) rather than funneled through this.
  const targetDoseMcg = useMemo(() => {
    if (vialContentType === "potency") return 0;
    const val = Number(doseValue) || 0;
    if (doseUnit === "MG") return val * 1000;
    return val; // MCG
  }, [doseValue, doseUnit, vialContentType]);

  // Injections per day implied by the selected frequency, so duration math works the same way
  // for the daily/twice/weekly presets and a custom "N times per day/week" entry.
  const dosesPerDay = useMemo(() => {
    if (frequency === "daily") return 1;
    if (frequency === "twice") return 2;
    if (frequency === "weekly") return 1 / 7;
    const val = Number(customFrequencyValue) || 0;
    return customFrequencyType === "perDay" ? val : val / 7;
  }, [frequency, customFrequencyType, customFrequencyValue]);

  // The IU-to-mg ratio depends on which compound is selected: HGH always has the accepted
  // 3 IU = 1mg potency standard, HCG never has a fixed mass equivalent at all, and "other"
  // relies entirely on whatever ratio the user manually supplies for that specific vial.
  const getMgPerVial = (compound: "hgh" | "hcg" | "other", vialIu: number, manualMg: number) => {
    if (compound === "hgh") return vialIu > 0 ? vialIu / 3 : 0;
    if (compound === "hcg") return 0;
    return manualMg;
  };

  const potencyRatioKnown =
    vialContentType === "potency" &&
    Number(vialPotencyIu) > 0 &&
    getMgPerVial(potencyCompound, Number(vialPotencyIu), Number(vialMgEquivalent)) > 0;

  // Quick-pick dose presets, sourced from this app's own peptideDosagesSource.ts titration data
  // (HGH: 200/400/600/800 mcg; HCG: 500/2000 IU) rather than inventing separate reference numbers
  // - shown in whichever unit is currently selected. "Other" has no compound-specific reference
  // doses to offer, so it falls back to typing a value directly.
  const dosePresets = useMemo(() => {
    if (vialContentType !== "potency") return null;
    if (potencyCompound === "hgh") {
      const referenceMcg = [200, 400, 600, 800];
      return referenceMcg.map((mcg) => {
        if (doseUnit === "MCG") return mcg;
        const mg = mcg / 1000;
        return doseUnit === "MG" ? Number(mg.toFixed(3)) : Number((mg * 3).toFixed(2)); // IU: 3 IU = 1mg
      });
    }
    if (potencyCompound === "hcg") {
      return [500, 2000]; // always IU - HCG dosing never converts to mg
    }
    return null;
  }, [vialContentType, potencyCompound, doseUnit]);

  // Once switching to/from Mass vs Potency, or the mg-equivalent ratio disappearing, the current
  // dose unit can become invalid (e.g. dosing in mg with no ratio to turn that back into IU for
  // the draw math) - fall back to IU, the one unit every potency vial always supports.
  useEffect(() => {
    if (vialContentType === "potency" && doseUnit !== "IU" && !potencyRatioKnown) {
      setDoseUnit("IU");
    }
  }, [vialContentType, doseUnit, potencyRatioKnown]);

  const formatMg = (mg: number) => (mg < 1 ? `${(mg * 1000).toFixed(0)} mcg` : `${mg.toFixed(3)} mg`);

  // Core calculations. Mass-vial (mg) and potency-vial (IU) products are reconstituted the same
  // physical way, but they can't share one formula: a mass vial's concentration is mg/mL and its
  // dose converts cleanly to mcg, while a potency vial's concentration is IU/mL with no general
  // mass equivalent - mixing the two paths is exactly what produced an incorrect mcg dose before.
  const calculations = useMemo(() => {
    const bWater = Number(bacWaterMl) || 0.0001; // Avoid division by zero

    if (vialContentType === "potency") {
      const vialIu = Number(vialPotencyIu) || 0;
      const mgPerVial = getMgPerVial(potencyCompound, vialIu, Number(vialMgEquivalent) || 0);
      const ratioKnown = mgPerVial > 0 && vialIu > 0;
      const rawDoseValue = Number(doseValue) || 0;

      // Dose can be entered either as IU (the vial's native unit, always available) or, once a
      // mg-equivalent ratio is known, as mg/mcg - converted back to IU here since that's what the
      // concentration math below actually needs.
      let doseIu: number;
      let doseMg: number | null;
      if (doseUnit === "IU") {
        doseIu = rawDoseValue;
        doseMg = ratioKnown ? (doseIu / vialIu) * mgPerVial : null;
      } else {
        const enteredMg = doseUnit === "MCG" ? rawDoseValue / 1000 : rawDoseValue;
        doseMg = ratioKnown ? enteredMg : null;
        doseIu = ratioKnown ? (enteredMg / mgPerVial) * vialIu : 0;
      }

      const concentrationIuPerMl = vialIu / bWater;
      const drawVolumeMl = concentrationIuPerMl > 0 ? doseIu / concentrationIuPerMl : 0;
      const insulinUnits = drawVolumeMl * 100;
      const dosesPerVial = doseIu > 0 ? Math.floor(vialIu / doseIu) : 0;
      const durationDays = dosesPerDay > 0 ? dosesPerVial / dosesPerDay : 0;
      const remainingIu = Math.max(0, vialIu - dosesPerVial * doseIu);
      const vialUsedPercent = vialIu > 0 ? (doseIu / vialIu) * 100 : 0;

      return {
        concentrationDisplay: `${concentrationIuPerMl.toLocaleString(undefined, { maximumFractionDigits: 1 })} IU/mL`,
        concentrationSecondaryDisplay: null as string | null,
        drawVolumeMl,
        insulinUnits,
        dosesPerVial,
        durationDays,
        // Forward: dosed in IU, show the mg/mcg equivalent (null if no ratio supplied).
        doseMassDisplay: doseUnit === "IU" && doseMg !== null ? formatMg(doseMg) : null,
        // Reverse: dosed in mg/mcg, show the IU equivalent the draw math actually used.
        doseIuEquivalentDisplay: doseUnit !== "IU" && ratioKnown ? `${doseIu.toFixed(2)} IU` : null,
        doseAmountDisplay: `${rawDoseValue.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${doseUnit}`,
        remainingAfterFullDosesDisplay: `${remainingIu.toFixed(2)} IU`,
        vialUsedPercent
      };
    }

    const vWeight = Number(vialWeightMg) || 0;
    const tDoseMcg = targetDoseMcg;

    const totalMcgInVial = vWeight * 1000;
    const concentrationMcgPerMl = totalMcgInVial / bWater;
    const concentrationMgPerMl = vWeight / bWater;

    // Draw volume in mL
    const drawVolumeMl = concentrationMcgPerMl > 0 ? tDoseMcg / concentrationMcgPerMl : 0;

    // Insulin units (standard 100 units = 1mL)
    const insulinUnits = drawVolumeMl * 100;

    // Doses per vial
    const dosesPerVial = tDoseMcg > 0 ? Math.floor(totalMcgInVial / tDoseMcg) : 0;

    // Duration in days
    const durationDays = dosesPerDay > 0 ? dosesPerVial / dosesPerDay : 0;

    // Leftover product after the last full dose is drawn, and what share of the whole vial
    // a single dose represents - both purely theoretical (no device-marking rounding applied).
    const remainingMcg = Math.max(0, totalMcgInVial - dosesPerVial * tDoseMcg);
    const vialUsedPercent = totalMcgInVial > 0 ? (tDoseMcg / totalMcgInVial) * 100 : 0;

    return {
      concentrationDisplay: `${concentrationMgPerMl.toFixed(3)} mg/mL`,
      concentrationSecondaryDisplay: `${(concentrationMcgPerMl).toLocaleString(undefined, { maximumFractionDigits: 0 })} mcg/mL`,
      drawVolumeMl,
      insulinUnits,
      dosesPerVial,
      durationDays,
      doseMassDisplay: formatMg(tDoseMcg / 1000),
      doseIuEquivalentDisplay: null as string | null,
      doseAmountDisplay: formatMg(tDoseMcg / 1000),
      remainingAfterFullDosesDisplay: formatMg(remainingMcg / 1000),
      vialUsedPercent
    };
  }, [vialContentType, vialWeightMg, vialPotencyIu, potencyCompound, vialMgEquivalent, bacWaterMl, doseValue, doseUnit, targetDoseMcg, dosesPerDay]);

  // Human-readable label for the FREQUENCY stat cell.
  const frequencyDisplayLabel = useMemo(() => {
    if (frequency === "daily") return "Daily";
    if (frequency === "twice") return "Twice";
    if (frequency === "weekly") return "Weekly";
    const val = customFrequencyValue || 0;
    return customFrequencyType === "perDay" ? `${val}×/day` : `${val}×/wk`;
  }, [frequency, customFrequencyType, customFrequencyValue]);

  // Configuration values for the syringe/pen gauge based on device type
  const syringeConfig = useMemo(() => {
    switch (syringeType) {
      case "30u":
        return {
          maxUnits: 30,
          maxVolumeMl: 0.3,
          label: "30-unit insulin (0.3 mL)",
          ticks: [0, 5, 10, 15, 20, 25, 30],
          isPen: false,
          cartridgeMl: undefined as number | undefined
        };
      case "50u":
        return {
          maxUnits: 50,
          maxVolumeMl: 0.5,
          label: "50-unit insulin (0.5 mL)",
          ticks: [0, 10, 20, 30, 40, 50],
          isPen: false,
          cartridgeMl: undefined as number | undefined
        };
      case "1mL":
        return {
          maxUnits: 100,
          maxVolumeMl: 1.0,
          label: "1 mL standard syringe",
          ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
          isPen: false,
          cartridgeMl: undefined as number | undefined
        };
      case "3mL":
        return {
          maxUnits: 300,
          maxVolumeMl: 3.0,
          label: "3 mL standard syringe",
          ticks: [0, 50, 100, 150, 200, 250, 300],
          isPen: false,
          cartridgeMl: undefined as number | undefined
        };
      case "pen":
        // Pen click count only depends on the 100-units/mL reconstitution math, not which
        // pen (60 or 80 click) someone owns, so there's no size to pick. 60 is used as the
        // capacity-warning threshold since it's the more conservative of the two.
        return {
          maxUnits: 60,
          maxVolumeMl: 0.6,
          label: "Auto-injector pen (3 mL cartridge)",
          ticks: [0, 10, 20, 30, 40, 50, 60],
          isPen: true,
          cartridgeMl: 3 as number | undefined
        };
      case "100u":
      default:
        return {
          maxUnits: 100,
          maxVolumeMl: 1.0,
          label: "100-unit insulin (1 mL)",
          ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
          isPen: false,
          cartridgeMl: undefined as number | undefined
        };
    }
  }, [syringeType]);

  const isPenSelected = syringeConfig.isPen;
  const unitLabel = isPenSelected ? "clicks" : "units";

  // Syringe/pen display details. A pen's dial only moves in whole clicks, so the displayed
  // number is rounded — a syringe barrel has fine enough markings that the fractional draw is
  // actually usable, so that stays precise.
  const fillPercentage = Math.min(100, (calculations.drawVolumeMl / syringeConfig.maxVolumeMl) * 100);
  const unitsDisplay = isPenSelected ? String(Math.round(calculations.insulinUnits)) : calculations.insulinUnits.toFixed(1);
  const cartridgeFillsNeeded =
    isPenSelected && syringeConfig.cartridgeMl ? Math.max(1, Math.ceil(bacWaterMl / syringeConfig.cartridgeMl)) : null;

  return (
    <div className="space-y-8">

      {/* HEADER */}
      <div className="space-y-3">
        <span className="inline-flex items-center gap-2 text-gold-400 text-[11px] font-mono font-bold tracking-widest uppercase">
          <Calculator size={13} className="text-gold-400" />
          Member Tools
        </span>
        <h1 className="text-3xl md:text-4xl font-black text-white leading-tight tracking-tight">
          Reconstitution Calculator
        </h1>
        <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
          Calculate draw volume, syringe units, and how long your vial lasts from the values you enter.
        </p>
      </div>

      {/* TWO-COLUMN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* LEFT COLUMN: RECONSTITUTION INPUTS */}
        <div className="lg:col-span-7 p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl shadow-sm">

          <div className="flex items-center justify-between gap-3 pb-5 border-b border-slate-800/70">
            <h2 className="text-lg font-black text-white">Reconstitution inputs</h2>
            <button
              type="button"
              onClick={handleReset}
              className="border border-slate-700 rounded-lg px-3 py-1.5 text-[12px] font-mono font-bold text-slate-300 hover:border-gold-500/50 hover:text-gold-400 transition cursor-pointer"
            >
              Reset calculator
            </button>
          </div>

          {/* SECTION 1 */}
          <div className="space-y-4 py-6 border-b border-slate-800/70">
            <span className="text-xs md:text-sm font-black text-white tracking-wide uppercase font-mono block">
              What's in your vial?
            </span>

            <div className="space-y-1.5">
              <label className="text-[12px] font-mono tracking-wider uppercase text-slate-400 block">
                VIAL LABEL TYPE
              </label>
              <div className="flex border border-slate-800 rounded-xl overflow-hidden bg-slate-950 h-[46px]">
                <button
                  type="button"
                  onClick={() => handleVialContentTypeChange("mass")}
                  className={`flex-1 text-xs font-mono font-bold transition cursor-pointer border-r border-slate-800/40 ${vialContentType === "mass" ? "bg-gold-500/10 text-gold-400" : "text-slate-400 hover:text-white"
                    }`}
                >
                  Mass (mg) — most peptides
                </button>
                <button
                  type="button"
                  onClick={() => handleVialContentTypeChange("potency")}
                  className={`flex-1 text-xs font-mono font-bold transition cursor-pointer ${vialContentType === "potency" ? "bg-gold-500/10 text-gold-400" : "text-slate-400 hover:text-white"
                    }`}
                >
                  Potency (IU) — HGH, HCG
                </button>
              </div>
              {vialContentType === "potency" ? (
                <p className="text-[12px] text-slate-500 leading-relaxed pt-0.5">
                  Some vials (HGH, HCG) are labeled by IU potency instead of mg. The math stays in IU
                  throughout — a mg equivalent is only ever shown when one actually exists for the selected
                  product below, never guessed.
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-mono tracking-wider uppercase text-slate-400 block">
                  {vialContentType === "potency" ? "VIAL POTENCY" : "PEPTIDE AMOUNT"}
                </label>
                {vialContentType === "potency" ? (
                  <div className="relative flex items-center bg-slate-950 border border-slate-800/80 rounded-xl focus-within:border-gold-500/50 focus-within:ring-1 focus-within:ring-gold-500/50 transition">
                    <input
                      type="number"
                      value={vialPotencyIu || ""}
                      onFocus={clearZeroOnFocus}
                      onChange={(e) => setVialPotencyIu(Math.max(0, Number(e.target.value)))}
                      className="w-full bg-transparent border-0 py-3 pl-4 pr-12 text-white font-mono text-sm focus:outline-none"
                      placeholder="0"
                    />
                    <span className="absolute right-4 text-xs font-mono font-bold text-slate-500">
                      IU
                    </span>
                  </div>
                ) : (
                  <div className="relative flex items-center bg-slate-950 border border-slate-800/80 rounded-xl focus-within:border-gold-500/50 focus-within:ring-1 focus-within:ring-gold-500/50 transition">
                    <input
                      type="number"
                      value={vialWeightMg || ""}
                      onFocus={clearZeroOnFocus}
                      onChange={(e) => setVialWeightMg(Math.max(0, Number(e.target.value)))}
                      className="w-full bg-transparent border-0 py-3 pl-4 pr-12 text-white font-mono text-sm focus:outline-none"
                      placeholder="0"
                    />
                    <span className="absolute right-4 text-xs font-mono font-bold text-slate-500">
                      mg
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-mono tracking-wider uppercase text-slate-400 block">
                  VIAL SIZE
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[2, 3, 5, 10].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVialSizeMl(v)}
                      className={`py-2.5 rounded-xl border text-xs font-mono font-bold flex flex-col items-center justify-center transition cursor-pointer ${vialSizeMl === v
                        ? "bg-gold-500/10 border-gold-500 text-gold-400"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white"
                        }`}
                    >
                      <span>{v}</span>
                      <span className="text-[12px] text-slate-500 font-normal">mL</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {vialContentType === "potency" ? (
              <div className="space-y-1.5">
                <label className="text-[12px] font-mono tracking-wider uppercase text-slate-400 block">
                  WHICH PRODUCT?
                </label>
                <div className="flex border border-slate-800 rounded-xl overflow-hidden bg-slate-950 h-[46px]">
                  {([
                    { key: "hgh" as const, label: "HGH / Somatropin" },
                    { key: "hcg" as const, label: "HCG" },
                    { key: "other" as const, label: "Other" }
                  ]).map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setPotencyCompound(c.key)}
                      className={`flex-1 text-xs font-mono font-bold transition cursor-pointer border-r last:border-r-0 border-slate-800/40 ${potencyCompound === c.key
                        ? "bg-gold-500/10 text-gold-400"
                        : "text-slate-400 hover:text-white"
                        }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {potencyCompound === "hgh" ? (
                  <p className="text-[12px] text-slate-500 leading-relaxed pt-0.5">
                    HGH has an accepted potency standard of 3 IU = 1mg, applied automatically — this vial's
                    {vialPotencyIu > 0 ? ` ${vialPotencyIu} IU ≈ ${(vialPotencyIu / 3).toFixed(2)} mg.` : " ratio will show once you enter its IU content above."}
                    {" "}If your specific box prints a different mg value, switch to "Other" and enter it directly.
                  </p>
                ) : potencyCompound === "hcg" ? (
                  <p className="text-[12px] text-slate-500 leading-relaxed pt-0.5">
                    HCG's potency is defined purely by bioassay, with no fixed mg equivalent used in the
                    industry — dosing stays in IU only, and that's not a gap this calculator can fill in.
                  </p>
                ) : (
                  <div className="space-y-1.5 pt-0.5">
                    <div className="relative flex items-center bg-slate-950 border border-slate-800/80 rounded-xl focus-within:border-gold-500/50 focus-within:ring-1 focus-within:ring-gold-500/50 transition">
                      <input
                        type="number"
                        step="0.1"
                        value={vialMgEquivalent || ""}
                        onFocus={clearZeroOnFocus}
                        onChange={(e) => setVialMgEquivalent(Math.max(0, Number(e.target.value)))}
                        className="w-full bg-transparent border-0 py-3 pl-4 pr-12 text-white font-mono text-sm focus:outline-none"
                        placeholder="e.g. 3.3"
                      />
                      <span className="absolute right-4 text-xs font-mono font-bold text-slate-500">
                        mg
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-500 leading-relaxed">
                      Enter the mg equivalent only if your box actually prints one (e.g. "10 IU (3.3mg)").
                      Leave blank if it doesn't — there's no safe generic ratio to assume here.
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* SECTION 2 */}
          <div className="space-y-4 py-6 border-b border-slate-800/70">
            <span className="text-xs md:text-sm font-black text-white tracking-wide uppercase font-mono block">
              How much diluent?
            </span>

            <div className="space-y-1.5">
              <label className="text-[12px] font-mono tracking-wider uppercase text-slate-400 block">
                BAC WATER TO ADD
              </label>
              <div className="relative flex items-center bg-slate-950 border border-slate-800/80 rounded-xl focus-within:border-gold-500/50 focus-within:ring-1 focus-within:ring-gold-500/50 transition">
                <input
                  type="number"
                  step="0.1"
                  value={bacWaterMl || ""}
                  onFocus={clearZeroOnFocus}
                  onChange={(e) => setBacWaterMl(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-transparent border-0 py-3 pl-4 pr-12 text-white font-mono text-sm focus:outline-none"
                  placeholder="0.0"
                />
                <span className="absolute right-4 text-xs font-mono font-bold text-slate-500">
                  mL
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 3 */}
          <div className="space-y-4 py-6 border-b border-slate-800/70">
            <span className="text-xs md:text-sm font-black text-white tracking-wide uppercase font-mono block">
              What's your dose per injection?
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-8 space-y-1.5">
                <label className="text-[12px] font-mono tracking-wider uppercase text-slate-400 block">
                  YOUR DOSE
                </label>
                <input
                  type="number"
                  value={doseValue || ""}
                  onFocus={clearZeroOnFocus}
                  onChange={(e) => setDoseValue(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-slate-950 border border-slate-800/80 rounded-xl py-3 px-4 text-white font-mono text-sm focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/50 transition"
                  placeholder="0"
                />
              </div>

              <div className="sm:col-span-4 space-y-1.5">
                <label className="text-[12px] font-mono tracking-wider uppercase text-slate-400 block">
                  UNIT
                </label>
                {vialContentType === "potency" ? (
                  <div className="flex border border-slate-800 rounded-xl overflow-hidden bg-slate-950 h-[46px]">
                    {(["IU", "MG", "MCG"] as const).map((u) => {
                      const disabled = u !== "IU" && !potencyRatioKnown;
                      return (
                        <button
                          key={u}
                          type="button"
                          disabled={disabled}
                          onClick={() => setDoseUnit(u)}
                          className={`flex-1 text-xs font-mono font-bold transition border-r last:border-r-0 border-slate-800/40 ${disabled
                            ? "text-slate-700 cursor-not-allowed"
                            : doseUnit === u
                              ? "bg-gold-500/10 text-gold-400 cursor-pointer"
                              : "text-slate-400 hover:text-white cursor-pointer"
                            }`}
                        >
                          {u}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex border border-slate-800 rounded-xl overflow-hidden bg-slate-950 h-[46px]">
                    {(["MG", "MCG"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setDoseUnit(u)}
                        className={`flex-1 text-xs font-mono font-bold transition cursor-pointer border-r last:border-r-0 border-slate-800/40 ${doseUnit === u
                          ? "bg-gold-500/10 text-gold-400"
                          : "text-slate-400 hover:text-white"
                          }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {dosePresets ? (
              <div className="space-y-1.5">
                <label className="text-[12px] font-mono tracking-wider uppercase text-slate-400 block">
                  COMMON DOSES
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {dosePresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDoseValue(preset)}
                      className={`px-3 py-1.5 rounded-lg border text-[12px] font-mono font-bold transition cursor-pointer ${Math.abs((Number(doseValue) || 0) - preset) < 0.0005
                        ? "bg-gold-500/10 border-gold-500 text-gold-400"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white"
                        }`}
                    >
                      {preset} {doseUnit}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {vialContentType === "potency" ? (
              <p className="text-[12px] text-slate-500 leading-relaxed">
                {potencyRatioKnown
                  ? "IU always matches the vial's label directly. MG/MCG convert through the ratio set above."
                  : "Dosing is IU-only — no mg ratio is available for this product selection above, so there's nothing for MG/MCG to convert through."}
              </p>
            ) : null}
          </div>

          {/* SECTION 4 */}
          <div className="space-y-4 pt-6">
            <span className="text-xs md:text-sm font-black text-white tracking-wide uppercase font-mono block">
              How often will you inject?
            </span>

            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "daily", label: "Daily", sub: "1×/day" },
                { key: "twice", label: "Twice", sub: "2×/day" },
                { key: "weekly", label: "Weekly", sub: "1×/wk" },
                { key: "custom", label: "Custom", sub: "Set your own" }
              ].map((f) => (
                (() => {
                  const isActive = frequency === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFrequency(f.key as "daily" | "twice" | "weekly" | "custom")}
                      className={`p-3.5 rounded-xl border text-left flex flex-col space-y-1 transition cursor-pointer ${isActive
                        ? "bg-gold-500/10 border-gold-500 ring-1 ring-gold-500/30"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                        }`}
                    >
                      <span className={`text-xs font-bold ${isActive ? "text-gold-300" : "text-white"}`}>{f.label}</span>
                      <span className={`text-[12px] font-mono font-semibold ${isActive ? "text-gold-400" : "text-slate-500"}`}>{f.sub}</span>
                    </button>
                  );
                })()
              ))}
            </div>

            {frequency === "custom" ? (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end pt-1">
                <div className="sm:col-span-6 space-y-1.5">
                  <label className="text-[12px] font-mono tracking-wider uppercase text-slate-400 block">
                    TIMES
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={customFrequencyValue || ""}
                    onFocus={clearZeroOnFocus}
                    onChange={(e) => setCustomFrequencyValue(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-800/80 rounded-xl py-3 px-4 text-white font-mono text-sm focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/50 transition"
                    placeholder="0"
                  />
                </div>

                <div className="sm:col-span-6 space-y-1.5">
                  <label className="text-[12px] font-mono tracking-wider uppercase text-slate-400 block">
                    PER
                  </label>
                  <div className="flex border border-slate-800 rounded-xl overflow-hidden bg-slate-950 h-[46px]">
                    {(["perDay", "perWeek"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setCustomFrequencyType(t)}
                        className={`flex-1 text-xs font-mono font-bold transition cursor-pointer border-r last:border-r-0 border-slate-800/40 ${customFrequencyType === t
                          ? "bg-gold-500/10 text-gold-400"
                          : "text-slate-400 hover:text-white"
                          }`}
                      >
                        {t === "perDay" ? "Day" : "Week"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

        </div>

        {/* RIGHT COLUMN: CALCULATION RESULTS */}
        <div className="lg:col-span-5 space-y-4">

          {/* Big result card */}
          <div className="relative rounded-2xl p-6 bg-slate-900/60 border border-gold-500/20 shadow-[0_0_30px_rgba(194,145,31,0.12)] space-y-5">
            <h2 className="text-[12px] font-mono font-bold tracking-widest text-white uppercase">
              Calculation results
            </h2>

            <div className="text-center space-y-1 py-1">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-widest">
                Calculated draw amount
              </div>
              <div className="flex items-end justify-center gap-2">
                <span className="text-5xl font-black text-gold-400 font-mono leading-none">
                  {unitsDisplay}
                </span>
                <span className="text-sm font-bold text-slate-400 pb-1.5">
                  {isPenSelected ? unitLabel : "syringe units"}
                </span>
              </div>
              <div className="text-xs text-slate-500 font-mono">{calculations.drawVolumeMl.toFixed(3)} mL</div>
            </div>

            {/* Recipe outcome summary */}
            <div className="space-y-3 pt-1 border-t border-slate-800/70">
              <div className="flex items-start space-x-2.5 pt-3">
                <span className="w-5 h-5 rounded-full bg-gold-400/10 border border-gold-500/20 text-gold-400 flex items-center justify-center text-[12px] font-bold font-mono mt-0.5">
                  1
                </span>
                <div className="text-sm text-white">
                  Add <span className="text-gold-400 font-bold">{bacWaterMl.toFixed(2)} mL</span> diluent into your{" "}
                  {vialContentType === "potency" ? `${vialPotencyIu || 0} IU` : `${vialWeightMg || 0} mg`} vial → {calculations.concentrationDisplay}
                </div>
              </div>
              <div className="flex items-start space-x-2.5">
                <span className="w-5 h-5 rounded-full bg-gold-400/10 border border-gold-500/20 text-gold-400 flex items-center justify-center text-[12px] font-bold font-mono mt-0.5">
                  2
                </span>
                <div className="text-sm text-white">
                  {calculations.doseMassDisplay !== null ? (
                    <>Dose per injection = <span className="text-gold-400 font-bold">{calculations.doseMassDisplay}</span></>
                  ) : calculations.doseIuEquivalentDisplay !== null ? (
                    <>Dose per injection = <span className="text-gold-400 font-bold">{calculations.doseIuEquivalentDisplay}</span></>
                  ) : (
                    <span className="text-slate-500">
                      Dose per injection stays in IU — no mg equivalent to show without a printed mg value above.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Syringe illustration card */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-white uppercase tracking-wide">Syringe illustration</span>
              <span className="text-[11px] font-mono text-slate-500">{syringeConfig.maxVolumeMl} mL capacity</span>
            </div>

            {isPenSelected ? (
              <PenDialGauge
                clicksToShow={Number(unitsDisplay)}
                maxUnits={syringeConfig.maxUnits}
                fillPercentage={fillPercentage}
              />
            ) : (
              <>
                <div className="text-center text-gold-400 font-black font-mono text-base">
                  {unitsDisplay} {unitLabel}
                </div>
                <SyringeIllustration fillPercentage={fillPercentage} ticks={syringeConfig.ticks} maxUnits={syringeConfig.maxUnits} />
                <div className="text-center text-[11px] font-mono text-slate-500 uppercase tracking-wide">
                  {unitLabel} · schematic scale
                </div>
                <div className="text-center text-[11px] font-mono text-gold-500/80">
                  Gold edge marks the calculated draw
                </div>
              </>
            )}

            <div className="text-center text-[11px] text-slate-500 font-mono">
              Illustration only; use the markings on your actual device.
            </div>

            {/* Validation alerts */}
            {calculations.insulinUnits > syringeConfig.maxUnits ? (
              <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-xl text-[12px] text-red-400 font-medium flex items-center space-x-1.5 text-left leading-normal">
                <AlertTriangle size={14} className="shrink-0" />
                <span>Dose exceeds device capacity! Split into multiple injections or reduce BAC diluent.</span>
              </div>
            ) : calculations.insulinUnits < 3 && calculations.insulinUnits > 0 ? (
              <div className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-xl text-[12px] text-amber-400 font-medium flex items-center space-x-1.5 text-left leading-normal">
                <AlertTriangle size={14} className="shrink-0" />
                <span>Draw amount is very low ({unitsDisplay} {unitLabel}). Add more BAC water diluent for easier dosing precision.</span>
              </div>
            ) : null}
          </div>

          {/* Calculation breakdown */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-0.5">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-slate-300">Dose amount</span>
              <span className="text-sm font-bold text-white font-mono">{calculations.doseAmountDisplay}</span>
            </div>
            <div className="h-px bg-slate-800/70" />
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-slate-300">Water / solution volume</span>
              <span className="text-sm font-bold text-white font-mono">{bacWaterMl.toFixed(2)} mL</span>
            </div>
            <div className="h-px bg-slate-800/70" />
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-slate-300">Concentration</span>
              <div className="text-right">
                <div className="text-sm font-bold text-white font-mono">{calculations.concentrationDisplay}</div>
                {calculations.concentrationSecondaryDisplay ? (
                  <div className="text-[11px] text-slate-500 font-mono">{calculations.concentrationSecondaryDisplay}</div>
                ) : null}
              </div>
            </div>
            <div className="h-px bg-slate-800/70" />
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-slate-300">Full doses per vial</span>
              <span className="text-sm font-bold text-white font-mono">
                {calculations.dosesPerVial > 0 ? calculations.dosesPerVial : "—"}
              </span>
            </div>
            <div className="h-px bg-slate-800/70" />
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-slate-300">Remaining after full doses</span>
              <span className="text-sm font-bold text-white font-mono">{calculations.remainingAfterFullDosesDisplay}</span>
            </div>
            <div className="h-px bg-slate-800/70" />
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-slate-300">Vial used per dose</span>
              <span className="text-sm font-bold text-white font-mono">
                {calculations.vialUsedPercent > 0 ? `${calculations.vialUsedPercent.toFixed(1)}%` : "—"}
              </span>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed pt-3">
              Theoretical amounts before device losses. Values are rounded only for display — no dose is rounded to a
              device marking.
            </p>

            <div className="pt-2 border-t border-slate-800/70 mt-1">
              <button
                type="button"
                onClick={() => setShowCalculationDetails((v) => !v)}
                className="flex items-center gap-1.5 text-[12px] font-mono font-bold text-gold-400 hover:text-gold-300 transition cursor-pointer py-2.5"
              >
                <ChevronDown size={14} className={`transition-transform ${showCalculationDetails ? "rotate-180" : ""}`} />
                How the calculation works
              </button>
              {showCalculationDetails ? (
                <div className="text-[12px] text-slate-400 leading-relaxed space-y-2 pb-1">
                  {vialContentType === "potency" ? (
                    <>
                      <p>
                        Concentration = vial potency (IU) ÷ water added (mL). Draw volume = your dose (converted to
                        IU) ÷ that concentration, shown in syringe units at 100 units per mL.
                      </p>
                      <p>
                        Full doses per vial = vial potency ÷ dose (IU), rounded down — a partial dose is never counted
                        as a full one. Remaining and vial-used-per-dose come from that same division, before any
                        rounding to a device marking.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        Concentration = vial amount (mg, converted to mcg) ÷ water added (mL). Draw volume = your dose
                        (converted to mcg) ÷ that concentration, shown in syringe units at 100 units per mL.
                      </p>
                      <p>
                        Full doses per vial = total product ÷ dose amount, rounded down — a partial dose is never
                        counted as a full one. Remaining and vial-used-per-dose come from that same division, before
                        any rounding to a device marking.
                      </p>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Device Type Selection */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-2">
            <label className="text-[12px] font-mono tracking-wider uppercase text-slate-400 block font-bold">
              INJECTION DEVICE
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => { if (isPenSelected) setSyringeType("100u"); }}
                className={`py-1.5 rounded-lg border text-[12px] font-mono font-bold text-center transition cursor-pointer ${!isPenSelected
                  ? "bg-gold-500/10 border-gold-500 text-gold-400 shadow-[0_0_8px_rgba(194,145,31,0.15)]"
                  : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                  }`}
              >
                Syringe
              </button>
              <button
                type="button"
                onClick={() => { if (!isPenSelected) setSyringeType("pen"); }}
                className={`py-1.5 rounded-lg border text-[12px] font-mono font-bold text-center transition cursor-pointer ${isPenSelected
                  ? "bg-gold-500/10 border-gold-500 text-gold-400 shadow-[0_0_8px_rgba(194,145,31,0.15)]"
                  : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                  }`}
              >
                Auto-Injector Pen
              </button>
            </div>
            {!isPenSelected ? (
              <div className="grid grid-cols-5 gap-1">
                {(["30u", "50u", "100u", "1mL", "3mL"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSyringeType(s)}
                    className={`py-1.5 rounded-lg border text-[12px] font-mono font-bold text-center transition cursor-pointer ${syringeType === s
                      ? "bg-gold-500/10 border-gold-500 text-gold-400 shadow-[0_0_8px_rgba(194,145,31,0.15)]"
                      : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                      }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
            <span className="text-[12px] font-mono text-slate-500 block font-semibold">
              {syringeConfig.label}
            </span>
          </div>

          {/* Stats cells */}
          <div className={`grid gap-2 ${isPenSelected ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 text-center flex flex-col justify-center space-y-0.5">
              <span className="text-xs md:text-sm font-black text-white">{frequencyDisplayLabel}</span>
              <span className="text-[8px] font-mono tracking-wider text-slate-500 uppercase font-semibold">FREQUENCY</span>
            </div>
            <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 text-center flex flex-col justify-center space-y-0.5">
              <span className="text-xs md:text-sm font-black text-white font-mono">
                {calculations.dosesPerVial > 0 ? calculations.dosesPerVial : "—"}
              </span>
              <span className="text-[8px] font-mono tracking-wider text-slate-500 uppercase font-semibold">FULL DOSES / VIAL</span>
            </div>
            <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 text-center flex flex-col justify-center space-y-0.5">
              <span className="text-xs md:text-sm font-black text-white font-mono">
                {calculations.durationDays > 0 ? (
                  dosesPerDay < 1 ? `${Math.floor(calculations.durationDays / 7)} wk` : `${Math.floor(calculations.durationDays)} d`
                ) : "—"}
              </span>
              <span className="text-[8px] font-mono tracking-wider text-slate-500 uppercase font-semibold">DURATION</span>
            </div>
            {isPenSelected && cartridgeFillsNeeded !== null ? (
              <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 text-center flex flex-col justify-center space-y-0.5">
                <span className="text-xs md:text-sm font-black text-white font-mono">{cartridgeFillsNeeded}</span>
                <span className="text-[8px] font-mono tracking-wider text-slate-500 uppercase font-semibold">PEN FILLS NEEDED</span>
              </div>
            ) : null}
          </div>

          {/* Research Use Only Caption */}
          <div className="text-center text-[12px] text-slate-500/80 font-mono tracking-wide uppercase font-semibold select-none">
            Research use only • not medical advice
          </div>
        </div>

      </div>

    </div>
  );
}
