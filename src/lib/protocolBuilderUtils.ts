/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PeptideProtocolInfo } from "../types";

export const JS_DAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const JS_DAY_FULL = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
export const DAYS_OF_WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseIsoDate = (isoDate: string) => {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return new Date();
  }
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
};

export const getDateParts = (dateStr: string) => {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  return {
    year: Number(parts[0]),
    month: Number(parts[1]) - 1,
    day: Number(parts[2])
  };
};

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const formatShortDate = (date: Date) => {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short"
  }).format(date);
};

export const formatLongDate = (date: Date) => {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
};

// Best-effort grouping for the Day view — the data model only has a free-text `bestTime` field.
export const getTimeOfDayBucket = (bestTime: string): "Morning" | "Afternoon" | "Evening" => {
  const text = (bestTime || "").toLowerCase();
  if (text.includes("morning") || text.includes("pre-workout") || text.includes("pre-exercise") || text.includes("waking")) {
    return "Morning";
  }
  if (text.includes("night") || text.includes("evening") || text.includes("bed")) {
    return "Evening";
  }
  if (text.includes("afternoon")) {
    return "Afternoon";
  }
  return "Morning";
};

export const startOfWeek = (date: Date) => {
  const day = date.getDay();
  const start = new Date(date);
  start.setDate(start.getDate() - day);
  return start;
};

export const isSameDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const formatSiteName = (siteStr: string) => {
  if (!siteStr) return "";
  const firstWord = siteStr.split(" ")[0].toUpperCase();
  if (firstWord.startsWith("ABDOMEN")) return "Abdomen";
  if (firstWord.startsWith("OUTER")) return "Outer Thigh";
  if (firstWord.startsWith("VENTROGLUTEAL")) return "Ventrogluteal";
  if (firstWord.startsWith("DELTOID")) return "Deltoid";
  if (firstWord.startsWith("INTRANASAL")) return "Nasal";
  return siteStr;
};

// Every peptide gets a bright color — never a grey fallback. A handful of peptides have a
// specific hand-picked color; everything else deterministically hashes into the same palette.
// borderStrong exists alongside border because the /40-opacity border reads fine on larger
// elements (a whole card edge) but is nearly invisible for cool hues (sky/cyan/teal/blue) on thin
// small-chip outlines — use borderStrong wherever the border itself needs to read clearly.
const PEPTIDE_COLOR_PALETTE: { hex: string; border: string; borderStrong: string; borderL: string; text: string; bg: string; dot: string }[] = [
  { hex: "#f97316", border: "border-orange-500/40", borderStrong: "border-orange-500/70", borderL: "border-l-orange-500", text: "text-orange-400", bg: "bg-orange-500/10", dot: "bg-orange-500" },
  { hex: "#22c55e", border: "border-emerald-500/40", borderStrong: "border-emerald-500/70", borderL: "border-l-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10", dot: "bg-emerald-500" },
  { hex: "#f59e0b", border: "border-amber-500/40", borderStrong: "border-amber-500/70", borderL: "border-l-amber-500", text: "text-amber-400", bg: "bg-amber-500/10", dot: "bg-amber-500" },
  { hex: "#0ea5e9", border: "border-sky-500/40", borderStrong: "border-sky-500/70", borderL: "border-l-sky-500", text: "text-sky-400", bg: "bg-sky-500/10", dot: "bg-sky-500" },
  { hex: "#d946ef", border: "border-fuchsia-500/40", borderStrong: "border-fuchsia-500/70", borderL: "border-l-fuchsia-500", text: "text-fuchsia-400", bg: "bg-fuchsia-500/10", dot: "bg-fuchsia-500" },
  { hex: "#06b6d4", border: "border-cyan-500/40", borderStrong: "border-cyan-500/70", borderL: "border-l-cyan-500", text: "text-cyan-400", bg: "bg-cyan-500/10", dot: "bg-cyan-500" },
  { hex: "#14b8a6", border: "border-teal-500/40", borderStrong: "border-teal-500/70", borderL: "border-l-teal-500", text: "text-teal-400", bg: "bg-teal-500/10", dot: "bg-teal-500" },
  { hex: "#3b82f6", border: "border-blue-500/40", borderStrong: "border-blue-500/70", borderL: "border-l-blue-500", text: "text-blue-400", bg: "bg-blue-500/10", dot: "bg-blue-500" },
  { hex: "#6366f1", border: "border-indigo-500/40", borderStrong: "border-indigo-500/70", borderL: "border-l-indigo-500", text: "text-indigo-400", bg: "bg-indigo-500/10", dot: "bg-indigo-500" },
  { hex: "#ec4899", border: "border-pink-500/40", borderStrong: "border-pink-500/70", borderL: "border-l-pink-500", text: "text-pink-400", bg: "bg-pink-500/10", dot: "bg-pink-500" },
  { hex: "#a855f7", border: "border-purple-500/40", borderStrong: "border-purple-500/70", borderL: "border-l-purple-500", text: "text-purple-400", bg: "bg-purple-500/10", dot: "bg-purple-500" },
  { hex: "#f43f5e", border: "border-rose-500/40", borderStrong: "border-rose-500/70", borderL: "border-l-rose-500", text: "text-rose-400", bg: "bg-rose-500/10", dot: "bg-rose-500" },
  { hex: "#8b5cf6", border: "border-violet-500/40", borderStrong: "border-violet-500/70", borderL: "border-l-violet-500", text: "text-violet-400", bg: "bg-violet-500/10", dot: "bg-violet-500" },
  { hex: "#84cc16", border: "border-lime-500/40", borderStrong: "border-lime-500/70", borderL: "border-l-lime-500", text: "text-lime-400", bg: "bg-lime-500/10", dot: "bg-lime-500" }
];

const NAMED_PEPTIDE_PALETTE_INDEX: Record<string, number> = {
  retatrutide: 0,
  "mots-c": 1,
  glow: 2,
  semax: 3,
  "nad-plus": 4,
  tirzepatide: 5,
  semaglutide: 6,
  "bpc-157": 7,
  "tb-500": 8,
  "ghk-cu": 9,
  klow: 10,
  "5-amino-1mq": 11,
  epitalon: 12,
  "cjc-ipamorelin": 13
};

const hashPeptideId = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % PEPTIDE_COLOR_PALETTE.length;
};

const getPeptidePaletteEntry = (id: string) =>
  PEPTIDE_COLOR_PALETTE[NAMED_PEPTIDE_PALETTE_INDEX[id] ?? hashPeptideId(id)];

export const getAccentHex = (id: string) => getPeptidePaletteEntry(id).hex;

export const getColorClasses = (id: string) => {
  const { border, borderStrong, borderL, text, bg, dot } = getPeptidePaletteEntry(id);
  return { border, borderStrong, borderL, text, bg, dot };
};

// A peptide's full route list across every dosing source (pep-pedia + peptidedosages + peptide-db
// are already merged onto goalDoseOptions by the time this runs — see peptides.ts). Distinct from
// standardRoute, which is only ever one hardcoded value chosen at authoring time.
export const getDistinctRoutes = (peptide: PeptideProtocolInfo): string[] => {
  const routes = (peptide.goalDoseOptions ?? [])
    .map((option) => option.route)
    .filter((route): route is string => !!route);
  const distinct = Array.from(new Set(routes));
  return distinct.length > 0 ? distinct : [peptide.standardRoute];
};
