/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/react";
import { getUserState, putUserState } from "../lib/userStateApi";
import { Info, AlertTriangle, Calculator, CheckCircle2, Plus, X } from "lucide-react";

type VialContentType = "mass" | "blend" | "potency";

type DeviceType = "30u" | "50u" | "100u" | "1mL" | "3mL" | "60u-pen" | "80u-pen";

// One peptide in a blend vial. The anchor is the compound the entered dose refers to.
type BlendCompound = { id: string; name: string; mg: number };

const DEFAULT_BLEND: BlendCompound[] = [
  { id: "blend-1", name: "BPC-157", mg: 5 },
  { id: "blend-2", name: "TB-500", mg: 5 },
];

type DoseUnit = "MG" | "MCG" | "IU";
type TabDose = { value: number; unit: DoseUnit };

// Each calculator tab keeps its own dose, so e.g. 250 mcg on Single peptide never turns into 250 IU.
const DEFAULT_DOSES: Record<VialContentType, TabDose> = {
  mass: { value: 250, unit: "MCG" },
  blend: { value: 250, unit: "MCG" },
  potency: { value: 2, unit: "IU" },
};

const CALCULATOR_TABS: { key: VialContentType; label: string; sub: string }[] = [
  { key: "mass", label: "Single peptide", sub: "One peptide, labelled in mg" },
  { key: "blend", label: "Blend", sub: "2+ peptides in one vial" },
  { key: "potency", label: "IU peptides", sub: "HGH, HCG — labelled in IU" },
];

type ReconstitutionPersistedState = {
  vialContentType?: VialContentType;
  dosesByTab?: Partial<Record<VialContentType, TabDose>>;
  blendCompounds?: BlendCompound[];
  blendAnchorId?: string;
  vialWeightMg: number;
  vialPotencyIu?: number;
  potencyCompound?: "hgh" | "hcg" | "other";
  vialMgEquivalent?: number;
  vialSizeMl: number;
  bacWaterMl: number;
  doseValue: number;
  doseUnit: "MG" | "MCG" | "IU";
  syringeType: DeviceType;
};

// Side-on auto-injector pen in the same style as SyringeIllustration: the dose window shows the
// number to dial (with its neighbours on the drum, faded), and the dial sleeve + grip slide out of
// the end of the pen in proportion to the clicks dialled, like the real pen.
function PenIllustration({
  clicks,
  ticks,
  maxUnits
}: {
  clicks: number;
  ticks: number[];
  maxUnits: number;
}) {
  const clipId = `pen-window-${React.useId().replace(/:/g, "")}`;
  const centerY = 55;
  const bodyX = 40;
  const bodyEnd = 340;
  const bodyY = 31;
  const bodyHeight = 48;
  const maxTravel = 150; // how far the grip sits out at the pen's maximum clicks
  const shown = Math.max(0, Math.round(clicks));
  const travel = (Math.min(shown, maxUnits) / maxUnits) * maxTravel;
  const sleeveY = 39;
  const sleeveHeight = 32;
  const windowX = 250;
  const windowY = 35;
  const windowWidth = 64;
  const windowHeight = 40;
  const windowCenter = windowX + windowWidth / 2;
  const slide = { transform: `translateX(${travel}px)`, transition: "transform 300ms ease" };

  return (
    <svg viewBox="0 0 560 120" className="w-full">
      <defs>
        <clipPath id={clipId}>
          <rect x={windowX} y={windowY} width={windowWidth} height={windowHeight} rx={6} />
        </clipPath>
      </defs>

      {/* Needle + hub */}
      <line x1={0} y1={centerY} x2={22} y2={centerY} stroke="#94a3b8" strokeWidth={2} />
      <path d={`M 22 ${centerY - 6} L ${bodyX} ${centerY - 12} L ${bodyX} ${centerY + 12} L 22 ${centerY + 6} Z`} fill="#c2911f" />

      {/* Dial sleeve + grip: drawn first so they slide out from behind the pen body */}
      <g style={slide}>
        <rect x={bodyEnd - maxTravel} y={sleeveY} width={maxTravel + 4} height={sleeveHeight} fill="#1e293b" stroke="#334155" strokeWidth={1.5} />
        {Array.from({ length: 12 }, (_, i) => bodyEnd - maxTravel + 8 + i * 12).map((x) => (
          <line key={x} x1={x} y1={sleeveY + 8} x2={x} y2={sleeveY + sleeveHeight - 8} stroke="#475569" strokeWidth={1.5} />
        ))}
        {/* Grip */}
        <rect x={bodyEnd} y={bodyY - 4} width={36} height={bodyHeight + 8} rx={8} fill="#1f2937" stroke="#475569" strokeWidth={2} />
        {Array.from({ length: 5 }, (_, i) => bodyEnd + 6 + i * 5).map((x) => (
          <line key={x} x1={x} y1={bodyY + 2} x2={x} y2={bodyY + bodyHeight - 2} stroke="#334155" strokeWidth={1.5} />
        ))}
        <rect x={bodyEnd + 31} y={bodyY - 4} width={5} height={bodyHeight + 8} rx={2} fill="#c2911f" />
      </g>

      {/* Pen body */}
      <rect x={bodyX} y={bodyY} width={bodyEnd - bodyX} height={bodyHeight} rx={10} fill="#0b1220" stroke="#334155" strokeWidth={2} />
      {/* Cartridge holder: window onto the reconstituted solution, then the join to the dosing body */}
      <rect x={bodyX + 14} y={centerY - 11} width={92} height={22} rx={5} fill="#111827" stroke="#475569" strokeWidth={1.5} />
      <rect x={bodyX + 16} y={centerY - 9} width={88} height={18} rx={4} fill="#c2911f" opacity={0.5} />
      <line x1={bodyX + 124} y1={bodyY + 1} x2={bodyX + 124} y2={bodyY + bodyHeight - 1} stroke="#334155" strokeWidth={2} />

      {/* Dose window: the number to dial, with the drum's neighbouring numbers faded */}
      <rect x={windowX} y={windowY} width={windowWidth} height={windowHeight} rx={6} fill="#111827" stroke="#475569" strokeWidth={1.5} />
      <g clipPath={`url(#${clipId})`}>
        {shown >= 2 ? (
          <text x={windowCenter} y={windowY + 10} fontSize={11} fill="#64748b" fontFamily="monospace" textAnchor="middle">
            {shown - 2}
          </text>
        ) : null}
        <text x={windowCenter} y={centerY + 6} fontSize={18} fontWeight={700} fill="#dba931" fontFamily="monospace" textAnchor="middle">
          {shown}
        </text>
        <text x={windowCenter} y={windowY + windowHeight + 5} fontSize={11} fill="#64748b" fontFamily="monospace" textAnchor="middle">
          {shown + 2}
        </text>
      </g>
      {/* Pointer beside the window */}
      <path d={`M ${windowX - 9} ${centerY - 5} L ${windowX - 3} ${centerY} L ${windowX - 9} ${centerY + 5} Z`} fill="#e8c05a" />

      {/* Travel scale: where the grip sits for each click count, gold mark = your dose */}
      {ticks.map((t) => {
        const x = bodyEnd + (t / maxUnits) * maxTravel;
        return (
          <g key={t}>
            <line x1={x} y1={bodyY + bodyHeight + 10} x2={x} y2={bodyY + bodyHeight + 16} stroke="#64748b" strokeWidth={1.5} />
            <text x={x} y={bodyY + bodyHeight + 30} fontSize={10} fill="#94a3b8" fontFamily="monospace" textAnchor="middle">
              {t}
            </text>
          </g>
        );
      })}
      <line
        x1={bodyEnd}
        y1={bodyY + bodyHeight + 7}
        x2={bodyEnd}
        y2={bodyY + bodyHeight + 19}
        stroke="#e8c05a"
        strokeWidth={2.5}
        style={slide}
      />
    </svg>
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
  const [vialContentType, setVialContentType] = useState<VialContentType>("mass");
  const [vialWeightMg, setVialWeightMg] = useState<number>(10);
  // A blend vial holds several peptides. Blend protocols are dosed by one compound (e.g. "250 mcg
  // BPC-157"), so the draw is worked out from that anchor's own concentration and the others
  // simply come along in the same draw, in proportion to their mg in the vial.
  const [blendCompounds, setBlendCompounds] = useState<BlendCompound[]>(DEFAULT_BLEND);
  const [blendAnchorId, setBlendAnchorId] = useState<string>(DEFAULT_BLEND[0].id);
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
  const [doseUnit, setDoseUnit] = useState<DoseUnit>("MCG");
  // Doses of the tabs that aren't showing (the showing tab's dose is doseValue/doseUnit).
  const [dosesByTab, setDosesByTab] = useState<Partial<Record<VialContentType, TabDose>>>({});

  // Syringe Type Selector on the right recipe card
  const [syringeType, setSyringeType] = useState<DeviceType>("100u");
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

  // Each tab is its own calculator with its own dose: the leaving tab's dose is kept and the
  // arriving tab's comes back. A potency (IU) vial is dosed in IU and a mass (mg) vial has no safe
  // universal IU conversion, so a dose never carries across tabs.
  const handleVialContentTypeChange = (nextType: VialContentType) => {
    if (nextType === vialContentType) return;
    const next = dosesByTab[nextType] ?? DEFAULT_DOSES[nextType];
    setDosesByTab((saved) => ({ ...saved, [vialContentType]: { value: doseValue, unit: doseUnit } }));
    setVialContentType(nextType);
    setDoseValue(next.value);
    setDoseUnit(next.unit);
  };

  // Reset to default states
  // Resets the calculator you're looking at; the other tabs keep what's entered in them.
  const handleReset = () => {
    if (vialContentType === "mass") setVialWeightMg(10);
    if (vialContentType === "blend") {
      setBlendCompounds(DEFAULT_BLEND);
      setBlendAnchorId(DEFAULT_BLEND[0].id);
    }
    if (vialContentType === "potency") {
      setVialPotencyIu(5000);
      setPotencyCompound("hgh");
      setVialMgEquivalent(0);
    }
    setVialSizeMl(3);
    setBacWaterMl(2);
    setDoseValue(DEFAULT_DOSES[vialContentType].value);
    setDoseUnit(DEFAULT_DOSES[vialContentType].unit);
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

        const restoredVialContentType: VialContentType =
          parsed.vialContentType === "potency" || parsed.vialContentType === "blend" ? parsed.vialContentType : "mass";
        setVialContentType(restoredVialContentType);
        const restoredBlend = Array.isArray(parsed.blendCompounds)
          ? parsed.blendCompounds.filter(
              (c): c is BlendCompound => c && typeof c.id === "string" && typeof c.name === "string" && typeof c.mg === "number"
            )
          : [];
        if (restoredBlend.length >= 2) {
          setBlendCompounds(restoredBlend);
          setBlendAnchorId(
            restoredBlend.some((c) => c.id === parsed.blendAnchorId) ? parsed.blendAnchorId! : restoredBlend[0].id
          );
        }
        if (typeof parsed.vialWeightMg === "number") setVialWeightMg(parsed.vialWeightMg);
        if (typeof parsed.vialPotencyIu === "number") setVialPotencyIu(parsed.vialPotencyIu);
        if (parsed.potencyCompound === "hgh" || parsed.potencyCompound === "hcg" || parsed.potencyCompound === "other") {
          setPotencyCompound(parsed.potencyCompound);
        }
        if (typeof parsed.vialMgEquivalent === "number") setVialMgEquivalent(parsed.vialMgEquivalent);
        if (typeof parsed.vialSizeMl === "number") setVialSizeMl(parsed.vialSizeMl);
        if (typeof parsed.bacWaterMl === "number") setBacWaterMl(parsed.bacWaterMl);
        if (restoredVialContentType !== "potency" && parsed.doseUnit === "IU") {
          // Pre-fix saves used a flat, incorrect "1 IU = 10 mcg" rule for a mass (mg) vial.
          // Migrate the stored dose to its old numeric mcg equivalent so the draw volume a
          // returning user sees doesn't silently change, while dropping the unsafe IU label.
          if (typeof parsed.doseValue === "number") setDoseValue(parsed.doseValue * 10);
          setDoseUnit("MCG");
        } else {
          if (typeof parsed.doseValue === "number") setDoseValue(parsed.doseValue);
          if (parsed.doseUnit === "MG" || parsed.doseUnit === "MCG" || parsed.doseUnit === "IU") setDoseUnit(parsed.doseUnit);
        }
        if (parsed.dosesByTab && typeof parsed.dosesByTab === "object") {
          const restoredDoses: Partial<Record<VialContentType, TabDose>> = {};
          for (const key of ["mass", "blend", "potency"] as const) {
            const d = parsed.dosesByTab[key];
            const unitOk = key === "potency" ? d?.unit === "IU" || d?.unit === "MG" || d?.unit === "MCG" : d?.unit === "MG" || d?.unit === "MCG";
            if (d && typeof d.value === "number" && unitOk) restoredDoses[key] = { value: d.value, unit: d.unit };
          }
          setDosesByTab(restoredDoses);
        }
        const rawSyringeType = parsed.syringeType as string;
        if (rawSyringeType === "pen") {
          // Some builds had a single size-less "pen"; map it to the 60-unit pen (the smaller limit).
          setSyringeType("60u-pen");
        } else if (
          parsed.syringeType === "30u" ||
          parsed.syringeType === "50u" ||
          parsed.syringeType === "100u" ||
          parsed.syringeType === "1mL" ||
          parsed.syringeType === "3mL" ||
          parsed.syringeType === "60u-pen" ||
          parsed.syringeType === "80u-pen"
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
      dosesByTab,
      blendCompounds,
      blendAnchorId,
      vialWeightMg,
      vialPotencyIu,
      potencyCompound,
      vialMgEquivalent,
      vialSizeMl,
      bacWaterMl,
      doseValue,
      doseUnit,
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
    blendAnchorId,
    blendCompounds,
    dosesByTab,
    doseUnit,
    doseValue,
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
      const remainingIu = Math.max(0, vialIu - dosesPerVial * doseIu);
      const vialUsedPercent = vialIu > 0 ? (doseIu / vialIu) * 100 : 0;

      return {
        concentrationDisplay: `${concentrationIuPerMl.toLocaleString(undefined, { maximumFractionDigits: 1 })} IU/mL`,
        concentrationSecondaryDisplay: null as string | null,
        drawVolumeMl,
        insulinUnits,
        dosesPerVial,
        // Forward: dosed in IU, show the mg/mcg equivalent (null if no ratio supplied).
        doseMassDisplay: doseUnit === "IU" && doseMg !== null ? formatMg(doseMg) : null,
        // Reverse: dosed in mg/mcg, show the IU equivalent the draw math actually used.
        doseIuEquivalentDisplay: doseUnit !== "IU" && ratioKnown ? `${doseIu.toFixed(2)} IU` : null,
        doseAmountDisplay: `${rawDoseValue.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${doseUnit}`,
        remainingAfterFullDosesDisplay: `${remainingIu.toFixed(2)} IU`,
        vialUsedPercent,
        blendBreakdown: null as { name: string; mgPerMl: number; doseMcg: number }[] | null
      };
    }

    if (vialContentType === "blend") {
      const compounds = blendCompounds.map((c) => ({ ...c, mg: Number(c.mg) || 0 }));
      const anchor = compounds.find((c) => c.id === blendAnchorId) ?? compounds[0];
      const anchorMg = anchor?.mg ?? 0;
      const totalMg = compounds.reduce((total, c) => total + c.mg, 0);
      const tDoseMcg = targetDoseMcg; // dose of the anchor compound

      // Everything is dissolved in the same water, so the anchor's concentration alone decides the draw.
      const anchorMcgPerMl = (anchorMg * 1000) / bWater;
      const drawVolumeMl = anchorMcgPerMl > 0 ? tDoseMcg / anchorMcgPerMl : 0;
      const insulinUnits = drawVolumeMl * 100;
      // Each draw takes the same share of every compound, so the anchor runs out exactly when the vial does.
      const share = anchorMg > 0 ? tDoseMcg / (anchorMg * 1000) : 0;
      const dosesPerVial = share > 0 ? Math.floor(1 / share + 1e-9) : 0;
      const remainingMg = Math.max(0, totalMg - dosesPerVial * share * totalMg);
      const blendBreakdown = compounds.map((c) => ({
        name: c.name.trim() || "Unnamed",
        mgPerMl: c.mg / bWater,
        doseMcg: share * c.mg * 1000,
      }));
      const anchorName = anchor?.name.trim() || "anchor";

      return {
        concentrationDisplay: `${(totalMg / bWater).toFixed(3)} mg/mL total`,
        concentrationSecondaryDisplay: `${anchorName} ${(anchorMg / bWater).toFixed(3)} mg/mL`,
        drawVolumeMl,
        insulinUnits,
        dosesPerVial,
        doseMassDisplay: `${formatMg(tDoseMcg / 1000)} ${anchorName}`,
        doseIuEquivalentDisplay: null as string | null,
        doseAmountDisplay: `${formatMg(share * totalMg)} total blend`,
        remainingAfterFullDosesDisplay: `${formatMg(remainingMg)} total blend`,
        vialUsedPercent: share * 100,
        blendBreakdown
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
      doseMassDisplay: formatMg(tDoseMcg / 1000),
      doseIuEquivalentDisplay: null as string | null,
      doseAmountDisplay: formatMg(tDoseMcg / 1000),
      remainingAfterFullDosesDisplay: formatMg(remainingMcg / 1000),
      vialUsedPercent,
      blendBreakdown: null as { name: string; mgPerMl: number; doseMcg: number }[] | null
    };
  }, [vialContentType, blendCompounds, blendAnchorId, vialWeightMg, vialPotencyIu, potencyCompound, vialMgEquivalent, bacWaterMl, doseValue, doseUnit, targetDoseMcg]);

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
      case "60u-pen":
      case "80u-pen": {
        // Clicks come from the same 100-units/mL maths for both pens; the size only sets how far
        // the dial goes, i.e. the biggest single dose the pen can give.
        const maxUnits = syringeType === "80u-pen" ? 80 : 60;
        return {
          maxUnits,
          maxVolumeMl: maxUnits / 100,
          label: `${maxUnits}-unit auto-injector pen (3 mL cartridge)`,
          ticks: Array.from({ length: maxUnits / 10 + 1 }, (_, i) => i * 10),
          isPen: true,
          cartridgeMl: 3 as number | undefined
        };
      }
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

  const blendAnchorName =
    (blendCompounds.find((c) => c.id === blendAnchorId) ?? blendCompounds[0])?.name.trim() || "anchor peptide";
  const blendTotalMg = Number(blendCompounds.reduce((total, c) => total + (Number(c.mg) || 0), 0).toFixed(3));

  const isPenSelected = syringeConfig.isPen;
  const unitLabel = isPenSelected ? "clicks" : "units";

  // Syringe/pen display details. A pen's dial only moves in whole clicks, so the displayed
  // number is rounded — a syringe barrel has fine enough markings that the fractional draw is
  // actually usable, so that stays precise.
  const fillPercentage = Math.min(100, (calculations.drawVolumeMl / syringeConfig.maxVolumeMl) * 100);
  const unitsDisplay = isPenSelected ? String(Math.round(calculations.insulinUnits)) : calculations.insulinUnits.toFixed(1);
  // A dose the chosen device can't hold in one go isn't a usable answer, so it's flagged as an error
  // everywhere instead of being shown as a draw. Pens dial whole clicks, so they're judged on the rounded number.
  const unitsNeeded = isPenSelected ? Math.round(calculations.insulinUnits) : calculations.insulinUnits;
  const overCapacity = unitsNeeded > syringeConfig.maxUnits + 1e-9;
  const deviceName = isPenSelected ? `${syringeConfig.maxUnits}-unit pen` : syringeConfig.label;
  const biggestDevice = syringeType === "80u-pen" || syringeType === "3mL";
  const overCapacityMessage = `This dose needs ${unitsDisplay} ${unitLabel}, but your ${deviceName} holds ${syringeConfig.maxUnits} ${unitLabel}. Lower the dose, use less BAC water (a stronger mix), or ${
    biggestDevice ? "split it into two injections" : `choose a bigger ${isPenSelected ? "pen" : "syringe"}`
  }.`;
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

      {/* CALCULATOR TABS */}
      <div role="tablist" aria-label="Calculator type" className="grid grid-cols-3 gap-2">
        {CALCULATOR_TABS.map((t) => {
          const isActive = vialContentType === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleVialContentTypeChange(t.key)}
              className={`p-3 sm:px-4 rounded-xl border text-left flex flex-col gap-0.5 transition cursor-pointer ${isActive
                ? "bg-gold-500/10 border-gold-500 ring-1 ring-gold-500/30"
                : "bg-slate-950 border-slate-800 hover:border-gold-500/50"
                }`}
            >
              <span className={`text-sm font-black ${isActive ? "text-gold-400" : "text-white"}`}>{t.label}</span>
              <span className="text-[11px] sm:text-[12px] font-mono text-slate-500 leading-snug">{t.sub}</span>
            </button>
          );
        })}
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
              {vialContentType === "potency" ? (
                <p className="text-[12px] text-slate-500 leading-relaxed">
                  Some vials (HGH, HCG) are labeled by IU potency instead of mg. The math stays in IU
                  throughout — a mg equivalent is only ever shown when one actually exists for the selected
                  product below, never guessed.
                </p>
              ) : vialContentType === "blend" ? (
                <p className="text-[12px] text-slate-500 leading-relaxed">
                  Enter each peptide in the vial and tick the one your dose is written for (the anchor, e.g. "250 mcg
                  BPC-157"). Every draw also gives you the other peptides, in proportion to their mg.
                </p>
              ) : (
                <p className="text-[12px] text-slate-500 leading-relaxed">
                  For a vial holding one peptide, labelled in mg. Got two or more peptides in the vial? Use the Blend tab.
                </p>
              )}
            </div>

            {vialContentType === "blend" ? (
              <div className="space-y-1.5">
                <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_3.5rem_2rem] gap-2 items-end">
                  <label className="text-[12px] font-mono tracking-wider uppercase text-white">PEPTIDE</label>
                  <label className="text-[12px] font-mono tracking-wider uppercase text-white">AMOUNT</label>
                  <label className="text-[12px] font-mono tracking-wider uppercase text-white text-center">DOSE BY</label>
                  <span />
                </div>
                {blendCompounds.map((c, index) => (
                  <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_6.5rem_3.5rem_2rem] gap-2 items-center">
                    <input
                      type="text"
                      value={c.name}
                      onChange={(e) =>
                        setBlendCompounds((list) => list.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))
                      }
                      aria-label={`Peptide ${index + 1} name`}
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-xl py-3 px-4 text-slate-400 font-mono text-sm focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/50 transition"
                      placeholder="e.g. BPC-157"
                    />
                    <div className="relative flex items-center bg-slate-950 border border-slate-800/80 rounded-xl focus-within:border-gold-500/50 focus-within:ring-1 focus-within:ring-gold-500/50 transition">
                      <input
                        type="number"
                        value={c.mg || ""}
                        onFocus={clearZeroOnFocus}
                        onChange={(e) =>
                          setBlendCompounds((list) =>
                            list.map((x) => (x.id === c.id ? { ...x, mg: Math.max(0, Number(e.target.value)) } : x))
                          )
                        }
                        aria-label={`${c.name || `Peptide ${index + 1}`} amount in mg`}
                        className="w-full bg-transparent border-0 py-3 pl-3 pr-9 text-slate-400 font-mono text-sm focus:outline-none"
                        placeholder="0"
                      />
                      <span className="absolute right-3 text-xs font-mono font-bold text-slate-500">mg</span>
                    </div>
                    <label className="flex justify-center cursor-pointer" title="Your dose is for this peptide">
                      <input
                        type="radio"
                        name="blend-anchor"
                        checked={blendAnchorId === c.id}
                        onChange={() => setBlendAnchorId(c.id)}
                        aria-label={`Dose is for ${c.name || `peptide ${index + 1}`}`}
                        className="h-4 w-4 accent-[#c2911f] cursor-pointer"
                      />
                    </label>
                    {blendCompounds.length > 2 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const next = blendCompounds.filter((x) => x.id !== c.id);
                          setBlendCompounds(next);
                          if (blendAnchorId === c.id) setBlendAnchorId(next[0].id);
                        }}
                        className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800/60 transition cursor-pointer"
                        aria-label={`Remove ${c.name || "peptide"}`}
                      >
                        <X size={14} />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setBlendCompounds((list) => [...list, { id: `blend-${Date.now()}`, name: "", mg: 0 }])}
                  className="inline-flex items-center gap-1 text-[12px] font-mono font-bold text-slate-400 hover:text-gold-400 transition cursor-pointer pt-1"
                >
                  <Plus size={13} /> Add peptide
                </button>
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {vialContentType !== "blend" ? (
              <div className="space-y-1.5">
                <label className="text-[12px] font-mono tracking-wider uppercase text-white block">
                  {vialContentType === "potency" ? "VIAL POTENCY" : "PEPTIDE AMOUNT"}
                </label>
                {vialContentType === "potency" ? (
                  <div className="relative flex items-center bg-slate-950 border border-slate-800/80 rounded-xl focus-within:border-gold-500/50 focus-within:ring-1 focus-within:ring-gold-500/50 transition">
                    <input
                      type="number"
                      value={vialPotencyIu || ""}
                      onFocus={clearZeroOnFocus}
                      onChange={(e) => setVialPotencyIu(Math.max(0, Number(e.target.value)))}
                      className="w-full bg-transparent border-0 py-3 pl-4 pr-12 text-slate-400 font-mono text-sm focus:outline-none"
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
                      className="w-full bg-transparent border-0 py-3 pl-4 pr-12 text-slate-400 font-mono text-sm focus:outline-none"
                      placeholder="0"
                    />
                    <span className="absolute right-4 text-xs font-mono font-bold text-slate-500">
                      mg
                    </span>
                  </div>
                )}
              </div>
              ) : null}

              <div className="space-y-1.5">
                <label className="text-[12px] font-mono tracking-wider uppercase text-white block">
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
                <label className="text-[12px] font-mono tracking-wider uppercase text-white block">
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
                        className="w-full bg-transparent border-0 py-3 pl-4 pr-12 text-slate-400 font-mono text-sm focus:outline-none"
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
              <label className="text-[12px] font-mono tracking-wider uppercase text-white block">
                BAC WATER TO ADD
              </label>
              <div className="relative flex items-center bg-slate-950 border border-slate-800/80 rounded-xl focus-within:border-gold-500/50 focus-within:ring-1 focus-within:ring-gold-500/50 transition">
                <input
                  type="number"
                  step="0.1"
                  value={bacWaterMl || ""}
                  onFocus={clearZeroOnFocus}
                  onChange={(e) => setBacWaterMl(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-transparent border-0 py-3 pl-4 pr-12 text-slate-400 font-mono text-sm focus:outline-none"
                  placeholder="0.0"
                />
                <span className="absolute right-4 text-xs font-mono font-bold text-slate-500">
                  mL
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 3 */}
          <div className="space-y-4 pt-6">
            <span className="text-xs md:text-sm font-black text-white tracking-wide uppercase font-mono block">
              What's your dose per injection?
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-8 space-y-1.5">
                <label className="text-[12px] font-mono tracking-wider uppercase text-white block">
                  {vialContentType === "blend" ? `YOUR ${blendAnchorName} DOSE` : "YOUR DOSE"}
                </label>
                <input
                  type="number"
                  value={doseValue || ""}
                  onFocus={clearZeroOnFocus}
                  onChange={(e) => setDoseValue(Math.max(0, Number(e.target.value)))}
                  aria-invalid={overCapacity}
                  className={`w-full bg-slate-950 border rounded-xl py-3 px-4 text-slate-400 font-mono text-sm focus:outline-none focus:ring-1 transition ${overCapacity
                    ? "border-red-500/70 focus:border-red-500 focus:ring-red-500/50"
                    : "border-slate-800/80 focus:border-gold-500/50 focus:ring-gold-500/50"
                    }`}
                  placeholder="0"
                />
              </div>

              <div className="sm:col-span-4 space-y-1.5">
                <label className="text-[12px] font-mono tracking-wider uppercase text-white block">
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
                <label className="text-[12px] font-mono tracking-wider uppercase text-white block">
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
            {overCapacity ? (
              <div role="alert" className="p-3 bg-red-950/20 border border-red-900/40 rounded-xl text-[12px] text-red-400 font-medium flex items-start gap-1.5 leading-normal">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{overCapacityMessage}</span>
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

        </div>

        {/* RIGHT COLUMN: CALCULATION RESULTS */}
        <div className="lg:col-span-5 space-y-4">

          {/* Big result card */}
          <div className="relative rounded-2xl p-6 bg-slate-900/60 border border-gold-500/20 shadow-[0_0_30px_rgba(194,145,31,0.12)] space-y-5">
            <h2 className="text-[12px] font-mono font-bold tracking-widest text-white uppercase">
              Calculation results
            </h2>

            <div className="text-center space-y-1 py-1">
              <div className="text-[11px] font-mono text-white uppercase tracking-widest">
                Calculated draw amount
              </div>
              {overCapacity ? (
                <>
                  <div className="text-2xl font-black text-red-400 leading-tight">Too much for your {isPenSelected ? "pen" : "syringe"}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    Needs {unitsDisplay} {unitLabel} · max {syringeConfig.maxUnits}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-end justify-center gap-2">
                    <span className="text-5xl font-black text-gold-400 font-mono leading-none">
                      {unitsDisplay}
                    </span>
                    <span className="text-sm font-bold text-slate-400 pb-1.5">
                      {isPenSelected ? unitLabel : "syringe units"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono">{calculations.drawVolumeMl.toFixed(3)} mL</div>
                </>
              )}
            </div>

            {/* Recipe outcome summary */}
            <div className="space-y-3 pt-1 border-t border-slate-800/70">
              <div className="flex items-start space-x-2.5 pt-3">
                <span className="w-5 h-5 rounded-full bg-gold-400/10 border border-gold-500/20 text-gold-400 flex items-center justify-center text-[12px] font-bold font-mono mt-0.5">
                  1
                </span>
                <div className="text-sm text-white">
                  Add <span className="text-gold-400 font-bold">{bacWaterMl.toFixed(2)} mL</span> diluent into your{" "}
                  {vialContentType === "potency"
                    ? `${vialPotencyIu || 0} IU`
                    : vialContentType === "blend"
                      ? `${blendTotalMg} mg blend`
                      : `${vialWeightMg || 0} mg`}{" "}
                  vial → {calculations.concentrationDisplay}
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
              {calculations.blendBreakdown ? (
                <div className="flex items-start space-x-2.5">
                  <span className="w-5 h-5 rounded-full bg-gold-400/10 border border-gold-500/20 text-gold-400 flex items-center justify-center text-[12px] font-bold font-mono mt-0.5">
                    3
                  </span>
                  <div className="text-sm text-white space-y-0.5">
                    <div>Each draw gives you:</div>
                    {calculations.blendBreakdown.map((c, i) => (
                      <div key={i} className="text-slate-400">
                        <span className="text-gold-400 font-bold">{formatMg(c.doseMcg / 1000)}</span> {c.name}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Injection device: pick the device, see the draw on it */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-white uppercase tracking-wide">Injection device</span>
              <span className="text-[11px] font-mono text-slate-500">{syringeConfig.maxVolumeMl} mL capacity</span>
            </div>

            <div className="space-y-2 pb-3 border-b border-slate-800/70">
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
                  onClick={() => { if (!isPenSelected) setSyringeType("60u-pen"); }}
                  className={`py-1.5 rounded-lg border text-[12px] font-mono font-bold text-center transition cursor-pointer ${isPenSelected
                    ? "bg-gold-500/10 border-gold-500 text-gold-400 shadow-[0_0_8px_rgba(194,145,31,0.15)]"
                    : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                    }`}
                >
                  Auto-Injector Pen
                </button>
              </div>
              {isPenSelected ? (
                <div className="grid grid-cols-2 gap-1">
                  {(["60u-pen", "80u-pen"] as const).map((pen) => (
                    <button
                      key={pen}
                      type="button"
                      onClick={() => setSyringeType(pen)}
                      className={`py-1.5 rounded-lg border text-[12px] font-mono font-bold text-center transition cursor-pointer ${syringeType === pen
                        ? "bg-gold-500/10 border-gold-500 text-gold-400 shadow-[0_0_8px_rgba(194,145,31,0.15)]"
                        : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                        }`}
                    >
                      {pen === "60u-pen" ? "60 unit pen" : "80 unit pen"}
                    </button>
                  ))}
                </div>
              ) : null}
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

            <div className={`text-center font-black font-mono text-base ${overCapacity ? "text-red-400" : "text-gold-400"}`}>
              {overCapacity
                ? `Over the ${syringeConfig.maxUnits}-${isPenSelected ? "click" : "unit"} limit`
                : isPenSelected
                  ? `Dial to ${unitsDisplay} ${unitLabel}`
                  : `${unitsDisplay} ${unitLabel}`}
            </div>
            {isPenSelected ? (
              <PenIllustration clicks={Number(unitsDisplay)} ticks={syringeConfig.ticks} maxUnits={syringeConfig.maxUnits} />
            ) : (
              <SyringeIllustration fillPercentage={fillPercentage} ticks={syringeConfig.ticks} maxUnits={syringeConfig.maxUnits} />
            )}
            <div className="text-center text-[11px] font-mono text-slate-500 uppercase tracking-wide">
              {unitLabel} · schematic scale
            </div>
            <div className="text-center text-[11px] font-mono text-gold-500/80">
              {isPenSelected
                ? "Window shows the number to dial · the grip comes out further for bigger doses"
                : "Gold edge marks the calculated draw"}
            </div>

            <div className="text-center text-[11px] text-slate-500 font-mono">
              Illustration only; use the markings on your actual device.
            </div>

            {isPenSelected && cartridgeFillsNeeded !== null ? (
              <div className="flex items-center justify-between pt-3 border-t border-slate-800/70 text-sm">
                <span className="text-white">Pen fills needed</span>
                <span className="font-bold text-slate-400 font-mono">{cartridgeFillsNeeded}</span>
              </div>
            ) : null}

            {/* Validation alerts */}
            {overCapacity ? (
              <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-xl text-[12px] text-red-400 font-medium flex items-start gap-1.5 text-left leading-normal">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{overCapacityMessage}</span>
              </div>
            ) : calculations.insulinUnits < 3 && calculations.insulinUnits > 0 ? (
              <div className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-xl text-[12px] text-amber-400 font-medium flex items-center space-x-1.5 text-left leading-normal">
                <AlertTriangle size={14} className="shrink-0" />
                <span>Draw amount is very low ({unitsDisplay} {unitLabel}). Add more BAC water diluent for easier dosing precision.</span>
              </div>
            ) : null}
          </div>

        </div>

      </div>

      {/* DOSE CALCULATIONS + HOW IT WORKS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5">
          <h2 className="text-xs font-black text-white uppercase tracking-wide pb-2">Dose calculations</h2>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-white">Dose amount</span>
              <span className="text-sm font-bold text-slate-400 font-mono text-right">{calculations.doseAmountDisplay}</span>
            </div>
            <div className="h-px bg-slate-800/70" />
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-white">Water / solution volume</span>
              <span className="text-sm font-bold text-slate-400 font-mono text-right">{bacWaterMl.toFixed(2)} mL</span>
            </div>
            <div className="h-px bg-slate-800/70" />
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-white">Concentration</span>
              <div className="text-right">
                <div className="text-sm font-bold text-slate-400 font-mono">{calculations.concentrationDisplay}</div>
                {calculations.concentrationSecondaryDisplay ? (
                  <div className="text-[11px] text-slate-500 font-mono">{calculations.concentrationSecondaryDisplay}</div>
                ) : null}
              </div>
            </div>
            <div className="h-px bg-slate-800/70" />
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-white">Full doses per vial</span>
              <span className="text-sm font-bold text-slate-400 font-mono text-right">{calculations.dosesPerVial > 0 ? calculations.dosesPerVial : "—"}</span>
            </div>
            <div className="h-px bg-slate-800/70" />
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-white">Remaining after full doses</span>
              <span className="text-sm font-bold text-slate-400 font-mono text-right">{calculations.remainingAfterFullDosesDisplay}</span>
            </div>
            <div className="h-px bg-slate-800/70" />
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-white">Vial used per dose</span>
              <span className="text-sm font-bold text-slate-400 font-mono text-right">{calculations.vialUsedPercent > 0 ? `${calculations.vialUsedPercent.toFixed(1)}%` : "—"}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed pt-3">
            Theoretical amounts before device losses. Values are rounded only for display — no dose is rounded to a
            device marking.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5">
          <h2 className="text-xs font-black text-white uppercase tracking-wide pb-3">How the calculation works</h2>
          <div className="text-sm text-slate-400 leading-relaxed space-y-3">
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
            ) : vialContentType === "blend" ? (
              <>
                <p>
                  All the peptides dissolve in the same water, so the draw is worked out from the peptide your dose
                  is for: its concentration = its mg ÷ water added (mL), and draw volume = your dose ÷ that
                  concentration, shown in syringe units at 100 units per mL.
                </p>
                <p>
                  That draw takes the same share of every peptide in the vial, so each one's amount per draw = its mg
                  × (your dose ÷ the dosed peptide's mg). Full doses per vial, remaining and vial-used-per-dose all
                  follow from that share.
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
        </div>
      </div>

      {/* Research Use Only Caption */}
      <div className="text-center text-[12px] text-slate-500/80 font-mono tracking-wide uppercase font-semibold select-none">
        Research use only • not medical advice
      </div>

    </div>
  );
}
