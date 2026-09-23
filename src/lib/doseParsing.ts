/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PeptideProtocolInfo } from "../types";

export type DoseUnit = PeptideProtocolInfo["dosingSchedule"]["unit"];
export type DoseFrequency = PeptideProtocolInfo["dosingSchedule"]["frequency"];

export const parseDoseParts = (doseText: string): { amount: string; unit: DoseUnit } | null => {
  const normalized = doseText.replace(/μg/gi, "mcg");
  const match = normalized.match(/(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?)\s*(mg|mcg|iu|ml)\b/i);
  if (!match) return null;

  const unit = match[2].toLowerCase();
  const mappedUnit: DoseUnit = unit === "iu" ? "IU" : unit === "ml" ? "mL" : (unit as "mg" | "mcg");

  return {
    amount: match[1],
    unit: mappedUnit
  };
};

export const parseFrequency = (frequencyText: string): DoseFrequency | null => {
  const text = frequencyText.toLowerCase();
  if (/(twice daily|2x daily|2 times daily|1-2x daily|once or twice daily)/.test(text)) return "2x/daily";
  if (/(3x weekly|3 times weekly|2-3x weekly|2-3 times weekly|every other day)/.test(text)) return "3x/week";
  if (/(twice weekly|2x weekly|2 times weekly|1-2x weekly)/.test(text)) return "2x/week";
  if (/(once weekly|weekly|per week)/.test(text)) return "weekly";
  if (/(daily|once daily|nightly)/.test(text)) return "daily";
  return null;
};

export const getDaysForFrequency = (frequency: DoseFrequency): string[] => {
  if (frequency === "weekly") return ["MON"];
  if (frequency === "2x/week") return ["MON", "THU"];
  if (frequency === "3x/week") return ["MON", "WED", "FRI"];
  return ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
};

// HGH/Somatropin has an accepted potency standard of 3 IU = 1mg (same ratio used in
// ReconstitutionCalc's Potency-vial "HGH" product mode) — safe to hard-code only for this one
// peptide. No other peptide gets a mg<->IU conversion here: HCG's potency is bioassay-defined with
// no fixed mass equivalent, and every other IU-labeled product would need its own verified ratio.
const HGH_IU_PER_MG = 3;

// Calendar dose amounts are free-text and may be a single value ("1") or a range ("0.15-0.3").
const parseAmountRange = (amount: string): number[] | null => {
  const match = amount.trim().match(/^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?$/);
  if (!match) return null;
  return match[2] !== undefined ? [Number(match[1]), Number(match[2])] : [Number(match[1])];
};

const formatDoseNumber = (n: number): string => Number(n.toFixed(3)).toString();

// Returns the HGH dose's equivalent reading in the other unit (mg<->IU), formatted for display
// next to the scheduled dose, e.g. "≈3IU" for a 1mg dose or "≈0.05-0.1mg" for a 0.15-0.3 IU range.
// Returns null for any peptide other than HGH, for mL-based doses (no fixed concentration to
// convert from), or for amount text that isn't a plain number/range.
export const getHghDoseEquivalent = (amount: string, unit: string, peptideId: string): string | null => {
  if (peptideId !== "hgh" || (unit !== "mg" && unit !== "mcg" && unit !== "IU")) return null;

  const values = parseAmountRange(amount);
  if (!values) return null;

  const toIu = (value: number) => (unit === "IU" ? value : unit === "mg" ? value * HGH_IU_PER_MG : (value / 1000) * HGH_IU_PER_MG);
  const converted = values.map(toIu).sort((a, b) => a - b);
  const targetUnit = unit === "IU" ? "mg" : "IU";
  const toTarget = unit === "IU" ? (iu: number) => iu / HGH_IU_PER_MG : (iu: number) => iu;

  const formatted = converted.map((v) => formatDoseNumber(toTarget(v))).join("-");
  return `${formatted}${targetUnit}`;
};

// Extracts the starting week number out of a GoalDoseOption label, e.g. "Conservative Starting
// Dose (Week 1-4)" -> 1, "Weeks 5-8" -> 5, "Maximum Efficacy (Week 20+)" -> 20. Used to detect
// titration sequences: a peptide's option list where 2+ options carry a week number is treated as
// an ordered dose-escalation schedule rather than a set of unrelated flat alternatives.
export const parseWeekStart = (label: string): number | null => {
  const match = label.match(/\bweeks?\s*(\d+)/i);
  if (!match) return null;
  const week = Number(match[1]);
  return Number.isFinite(week) && week > 0 ? week : null;
};
