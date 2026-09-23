/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Dosing reference compiled from peptidedosages.com, offered as a toggleable alternative to the
// pep-pedia.org data in peptides.ts. Vial-size pages on that site repeat the same week-by-week mg
// progression across different concentrations (this app doesn't model reconstitution/concentration),
// so each peptide here collapses to one dosing table — one goalDoseOption per titration phase,
// matching how pep-pedia's own multi-phase entries (e.g. Retatrutide) are already represented.

import { GoalDoseOption } from "../types";

export const PEPTIDEDOSAGES_GOAL_OPTIONS: Record<string, GoalDoseOption[]> = {
  retatrutide: [
    { id: "retatrutide-pd-1", label: "Weeks 1-4", source: "peptidedosages", doseText: "2 mg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "2", unit: "mg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 1-4." } },
    { id: "retatrutide-pd-2", label: "Weeks 5-8", source: "peptidedosages", doseText: "4 mg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "4", unit: "mg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 5-8." } },
    { id: "retatrutide-pd-3", label: "Weeks 9-12", source: "peptidedosages", doseText: "6 mg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "6", unit: "mg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 9-12." } },
    { id: "retatrutide-pd-4", label: "Weeks 13+", source: "peptidedosages", doseText: "8 mg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "8", unit: "mg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 13+. Minimum 24-week cycle; trials extended to 48 weeks." } }
  ],
  "mots-c": [
    { id: "mots-c-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "200 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "200", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 1-2." } },
    { id: "mots-c-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "400 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "400", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 3-4." } },
    { id: "mots-c-pd-3", label: "Weeks 5-6", source: "peptidedosages", doseText: "600 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "600", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 5-6." } },
    { id: "mots-c-pd-4", label: "Weeks 7-8", source: "peptidedosages", doseText: "800 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "800", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 7-8." } },
    { id: "mots-c-pd-5", label: "Weeks 9-10+", source: "peptidedosages", doseText: "1000 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "1000", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 9-10+. 8-12 week cycle, optional extension to 16." } }
  ],
  glow: [
    { id: "glow-pd-1", label: "Standard Protocol", source: "peptidedosages", doseText: "2,330 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "2330", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com GLOW blend (GHK-Cu + BPC-157 + TB-500), 4 weeks daily then 2-4 weeks off." } }
  ],
  semax: [
    { id: "semax-pd-1", label: "200 mcg/day", source: "peptidedosages", doseText: "200 mcg daily", route: "Nasal", frequencyText: "Once daily", timelineSchedule: { amount: "200", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com intranasal spray reference." } },
    { id: "semax-pd-2", label: "300 mcg/day", source: "peptidedosages", doseText: "300 mcg daily", route: "Nasal", frequencyText: "Once daily", timelineSchedule: { amount: "300", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com intranasal spray reference." } },
    { id: "semax-pd-3", label: "500 mcg/day", source: "peptidedosages", doseText: "500 mcg daily", route: "Nasal", frequencyText: "Once daily", timelineSchedule: { amount: "500", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com intranasal spray reference." } }
  ],
  "nad-plus": [
    { id: "nad-plus-pd-1", label: "Week 1", source: "peptidedosages", doseText: "50 mg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "50", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, week 1." } },
    { id: "nad-plus-pd-2", label: "Week 2", source: "peptidedosages", doseText: "75 mg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "75", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, week 2." } },
    { id: "nad-plus-pd-3", label: "Weeks 3-16", source: "peptidedosages", doseText: "100 mg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "100", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 3-16." } }
  ],
  tirzepatide: [
    { id: "tirzepatide-pd-1", label: "Weeks 1-4", source: "peptidedosages", doseText: "2.5 mg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "2.5", unit: "mg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 1-4." } },
    { id: "tirzepatide-pd-2", label: "Weeks 5-8", source: "peptidedosages", doseText: "5 mg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "5", unit: "mg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 5-8." } },
    { id: "tirzepatide-pd-3", label: "Weeks 9-12", source: "peptidedosages", doseText: "7.5 mg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "7.5", unit: "mg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 9-12." } },
    { id: "tirzepatide-pd-4", label: "Weeks 13-16", source: "peptidedosages", doseText: "10 mg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "10", unit: "mg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 13-16." } }
  ],
  semaglutide: [
    { id: "semaglutide-pd-1", label: "Weeks 1-4", source: "peptidedosages", doseText: "250 mcg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "250", unit: "mcg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 1-4." } },
    { id: "semaglutide-pd-2", label: "Weeks 5-8", source: "peptidedosages", doseText: "500 mcg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "500", unit: "mcg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 5-8." } },
    { id: "semaglutide-pd-3", label: "Weeks 9-12", source: "peptidedosages", doseText: "1000 mcg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "1000", unit: "mcg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 9-12." } },
    { id: "semaglutide-pd-4", label: "Weeks 13-16", source: "peptidedosages", doseText: "1700 mcg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "1700", unit: "mcg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 13-16." } },
    { id: "semaglutide-pd-5", label: "Weeks 17+ (Maintenance)", source: "peptidedosages", doseText: "2400 mcg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "2400", unit: "mcg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com maintenance dose, weeks 17+." } }
  ],
  "bpc-157": [
    { id: "bpc-157-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "200 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "200", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 1-2." } },
    { id: "bpc-157-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "400 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "400", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 3-4." } },
    { id: "bpc-157-pd-3", label: "Weeks 5-8+", source: "peptidedosages", doseText: "600 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "600", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 5-8+. 8-12 week cycle, optional extension to 16." } }
  ],
  "tb-500": [
    { id: "tb-500-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "500 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "500", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 1-2." } },
    { id: "tb-500-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "600 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "600", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 3-4." } },
    { id: "tb-500-pd-3", label: "Weeks 5-8", source: "peptidedosages", doseText: "750 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "750", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 5-8." } },
    { id: "tb-500-pd-4", label: "Weeks 9-12", source: "peptidedosages", doseText: "1000 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "1000", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 9-12. Optional extension to 16 weeks." } }
  ],
  "ghk-cu": [
    { id: "ghk-cu-pd-1", label: "Standard — Weeks 1-4", source: "peptidedosages", doseText: "1.0 mg, 5x/week", route: "SubQ", frequencyText: "5x weekly", timelineSchedule: { amount: "1", unit: "mg", frequency: "daily", days: ["MON", "TUE", "WED", "THU", "FRI"], note: "peptidedosages.com standard protocol, weeks 1-4." } },
    { id: "ghk-cu-pd-2", label: "Standard — Weeks 5-8", source: "peptidedosages", doseText: "1.5 mg, 5x/week", route: "SubQ", frequencyText: "5x weekly", timelineSchedule: { amount: "1.5", unit: "mg", frequency: "daily", days: ["MON", "TUE", "WED", "THU", "FRI"], note: "peptidedosages.com standard protocol, weeks 5-8." } },
    { id: "ghk-cu-pd-3", label: "Standard — Weeks 9-12+", source: "peptidedosages", doseText: "2.0 mg, 5x/week", route: "SubQ", frequencyText: "5x weekly", timelineSchedule: { amount: "2", unit: "mg", frequency: "daily", days: ["MON", "TUE", "WED", "THU", "FRI"], note: "peptidedosages.com standard protocol, weeks 9-12+." } },
    { id: "ghk-cu-pd-4", label: "Alternative — 3x Weekly", source: "peptidedosages", doseText: "2.0 mg, 3x/week", route: "SubQ", frequencyText: "3x weekly", timelineSchedule: { amount: "2", unit: "mg", frequency: "3x/week", days: ["MON", "WED", "FRI"], note: "peptidedosages.com alternative protocol, weeks 1-12+." } }
  ],
  klow: [
    { id: "klow-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "2 mg daily (combined)", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "2", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com KLOW blend (TB-500 + BPC-157 + KPV 250mcg each + GHK-Cu 1.25mg), weeks 1-2." } },
    { id: "klow-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "4 mg daily (combined)", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "4", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com KLOW blend, weeks 3-4 (500mcg each + GHK-Cu 2.5mg)." } },
    { id: "klow-pd-3", label: "Weeks 5-8", source: "peptidedosages", doseText: "6 mg daily (combined)", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "6", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com KLOW blend, weeks 5-8 (750mcg each + GHK-Cu 3.75mg)." } },
    { id: "klow-pd-4", label: "Weeks 9-12 (Maintenance)", source: "peptidedosages", doseText: "4 mg daily (combined)", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "4", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com KLOW blend maintenance, weeks 9-12 (500mcg each + GHK-Cu 2.5mg)." } }
  ],
  "5-amino-1mq": [
    { id: "5-amino-1mq-pd-1", label: "Days 1-2 (Tolerance)", source: "peptidedosages", doseText: "2.5 mg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "2.5", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com tolerance dose, days 1-2." } },
    { id: "5-amino-1mq-pd-2", label: "Day 3+ (Standard)", source: "peptidedosages", doseText: "5 mg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "5", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com standard dose from day 3 onward." } }
  ],
  epitalon: [
    { id: "epitalon-pd-1", label: "Days 1-20 (Cycle On)", source: "peptidedosages", doseText: "5 mg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "5", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com 20-day on-cycle, then 4-6 months off (~2 cycles/year)." } }
  ],
  "cjc-ipamorelin": [
    { id: "cjc-ipamorelin-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "100 mcg daily + CJC-1295 DAC 1mg weekly", route: "SubQ", frequencyText: "Ipamorelin daily, CJC-1295 DAC weekly", timelineSchedule: { amount: "100", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com CJC-1295 DAC + Ipamorelin stack, weeks 1-2. Separate weekly CJC-1295 DAC injection (1000mcg) alongside daily Ipamorelin." } },
    { id: "cjc-ipamorelin-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "150 mcg daily + CJC-1295 DAC 1mg weekly", route: "SubQ", frequencyText: "Ipamorelin daily, CJC-1295 DAC weekly", timelineSchedule: { amount: "150", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com stack, weeks 3-4." } },
    { id: "cjc-ipamorelin-pd-3", label: "Weeks 5+", source: "peptidedosages", doseText: "200 mcg daily + CJC-1295 DAC 1mg weekly", route: "SubQ", frequencyText: "Ipamorelin daily, CJC-1295 DAC weekly", timelineSchedule: { amount: "200", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com stack maintenance, weeks 5-12." } }
  ],
  "bpc-tb": [
    { id: "bpc-tb-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "500 mcg daily (combined)", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "500", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com BPC-157 + TB-500 blend, weeks 1-2." } },
    { id: "bpc-tb-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "666 mcg daily (combined)", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "666", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com blend, weeks 3-4." } },
    { id: "bpc-tb-pd-3", label: "Weeks 5-8", source: "peptidedosages", doseText: "1000 mcg daily (combined)", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "1000", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com blend, weeks 5-8. 4-8 week cycle, optional 6-week break between courses." } }
  ],
  hgh: [
    { id: "hgh-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "200 mcg daily", route: "SubQ", frequencyText: "Once daily (bedtime)", timelineSchedule: { amount: "200", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com HGH 191AA titration, weeks 1-2." } },
    { id: "hgh-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "400 mcg daily", route: "SubQ", frequencyText: "Once daily (bedtime)", timelineSchedule: { amount: "400", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 3-4." } },
    { id: "hgh-pd-3", label: "Weeks 5-6", source: "peptidedosages", doseText: "600 mcg daily", route: "SubQ", frequencyText: "Once daily (bedtime)", timelineSchedule: { amount: "600", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 5-6." } },
    { id: "hgh-pd-4", label: "Weeks 7-8", source: "peptidedosages", doseText: "800 mcg daily", route: "SubQ", frequencyText: "Once daily (bedtime)", timelineSchedule: { amount: "800", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 7-8. 8-12 week cycle, optional extension to 16." } }
  ],
  cagrilintide: [
    { id: "cagrilintide-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "0.6 mg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "0.6", unit: "mg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 1-2." } },
    { id: "cagrilintide-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "1.2 mg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "1.2", unit: "mg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 3-4." } },
    { id: "cagrilintide-pd-3", label: "Weeks 5-6", source: "peptidedosages", doseText: "2.4 mg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "2.4", unit: "mg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com titration, weeks 5-6." } },
    { id: "cagrilintide-pd-4", label: "Weeks 7-16 (Maintenance)", source: "peptidedosages", doseText: "4.5 mg weekly", route: "SubQ", frequencyText: "Once weekly", timelineSchedule: { amount: "4.5", unit: "mg", frequency: "weekly", days: ["MON"], note: "peptidedosages.com maintenance, weeks 7-16." } }
  ],
  tesamorelin: [
    { id: "tesamorelin-pd-1", label: "Week 1", source: "peptidedosages", doseText: "1 mg daily", route: "SubQ", frequencyText: "Once daily (evening)", timelineSchedule: { amount: "1", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, week 1." } },
    { id: "tesamorelin-pd-2", label: "Weeks 2+", source: "peptidedosages", doseText: "2 mg daily", route: "SubQ", frequencyText: "Once daily (evening)", timelineSchedule: { amount: "2", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com maintenance dose. 12-26 week cycle; trials support up to 52 weeks with monitoring." } }
  ],
  ipamorelin: [
    { id: "ipamorelin-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "100 mcg daily", route: "SubQ", frequencyText: "Once daily (bedtime)", timelineSchedule: { amount: "100", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 1-2." } },
    { id: "ipamorelin-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "150 mcg daily", route: "SubQ", frequencyText: "Once daily (bedtime)", timelineSchedule: { amount: "150", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 3-4." } },
    { id: "ipamorelin-pd-3", label: "Weeks 5-8", source: "peptidedosages", doseText: "200 mcg daily", route: "SubQ", frequencyText: "Once daily (bedtime)", timelineSchedule: { amount: "200", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 5-8." } },
    { id: "ipamorelin-pd-4", label: "Weeks 9-12", source: "peptidedosages", doseText: "250 mcg daily", route: "SubQ", frequencyText: "Once daily (bedtime)", timelineSchedule: { amount: "250", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 9-12. 8-12 week cycle, optional extension to 16, then 2-4 week off-cycle." } }
  ],
  "cjc-1295-no-dac": [
    { id: "cjc-1295-no-dac-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "100 mcg daily", route: "SubQ", frequencyText: "Once daily (bedtime)", timelineSchedule: { amount: "100", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 1-2." } },
    { id: "cjc-1295-no-dac-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "150 mcg daily", route: "SubQ", frequencyText: "Once daily (bedtime)", timelineSchedule: { amount: "150", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 3-4." } },
    { id: "cjc-1295-no-dac-pd-3", label: "Weeks 5-6", source: "peptidedosages", doseText: "200 mcg daily", route: "SubQ", frequencyText: "Once daily (bedtime)", timelineSchedule: { amount: "200", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 5-6." } },
    { id: "cjc-1295-no-dac-pd-4", label: "Weeks 7-12", source: "peptidedosages", doseText: "250 mcg daily", route: "SubQ", frequencyText: "Once daily (bedtime)", timelineSchedule: { amount: "250", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 7-12 (250-300mcg range). 8-12 week cycle, optional extension to 16." } }
  ],
  "cjc-1295-dac": [
    { id: "cjc-1295-dac-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "300 mcg per injection, 2x/week", route: "SubQ", frequencyText: "2x weekly", timelineSchedule: { amount: "300", unit: "mcg", frequency: "2x/week", days: ["MON", "THU"], note: "peptidedosages.com titration, weeks 1-2 (600mcg/week total)." } },
    { id: "cjc-1295-dac-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "500 mcg per injection, 2x/week", route: "SubQ", frequencyText: "2x weekly", timelineSchedule: { amount: "500", unit: "mcg", frequency: "2x/week", days: ["MON", "THU"], note: "peptidedosages.com titration, weeks 3-4 (1000mcg/week total)." } },
    { id: "cjc-1295-dac-pd-3", label: "Weeks 5-6", source: "peptidedosages", doseText: "750 mcg per injection, 2x/week", route: "SubQ", frequencyText: "2x weekly", timelineSchedule: { amount: "750", unit: "mcg", frequency: "2x/week", days: ["MON", "THU"], note: "peptidedosages.com titration, weeks 5-6 (1500mcg/week total)." } },
    { id: "cjc-1295-dac-pd-4", label: "Weeks 7-12", source: "peptidedosages", doseText: "1000 mcg per injection, 2x/week", route: "SubQ", frequencyText: "2x weekly", timelineSchedule: { amount: "1000", unit: "mcg", frequency: "2x/week", days: ["MON", "THU"], note: "peptidedosages.com titration, weeks 7-12 (2000mcg/week total). 8-12 week cycle, optional extension to 16." } }
  ],
  hcg: [
    { id: "hcg-pd-1", label: "Standard Maintenance", source: "peptidedosages", doseText: "500 IU, 3x/week", route: "SubQ", frequencyText: "3x weekly", timelineSchedule: { amount: "500", unit: "IU", frequency: "3x/week", days: ["MON", "WED", "FRI"], note: "peptidedosages.com standard maintenance protocol, weeks 1-12 (1,500 IU/week total)." } },
    { id: "hcg-pd-2", label: "High-Dose Recovery — Weeks 5-8", source: "peptidedosages", doseText: "2,000 IU, 3x/week", route: "SubQ", frequencyText: "3x weekly", timelineSchedule: { amount: "2000", unit: "IU", frequency: "3x/week", days: ["MON", "WED", "FRI"], note: "peptidedosages.com high-dose recovery protocol, peak weeks 5-8. 8-12 week cycle, extend to 16+ for severe suppression." } }
  ],
  "ss-31": [
    { id: "ss-31-pd-1", label: "Standard — Weeks 1-2", source: "peptidedosages", doseText: "5 mg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "5", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com standard protocol, weeks 1-2." } },
    { id: "ss-31-pd-2", label: "Standard — Weeks 3-8", source: "peptidedosages", doseText: "10 mg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "10", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com standard protocol, weeks 3-8." } },
    { id: "ss-31-pd-3", label: "Advanced — Weeks 5-8", source: "peptidedosages", doseText: "15 mg daily (split)", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "15", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com advanced protocol, weeks 5-8 — split into two injections, medical supervision recommended." } },
    { id: "ss-31-pd-4", label: "Advanced — Weeks 9-12", source: "peptidedosages", doseText: "20 mg daily (split)", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "20", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com advanced protocol, weeks 9-12 — split into two injections, medical supervision recommended." } }
  ],
  kpv: [
    { id: "kpv-pd-1", label: "Week 1", source: "peptidedosages", doseText: "200 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "200", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, week 1." } },
    { id: "kpv-pd-2", label: "Week 2", source: "peptidedosages", doseText: "300 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "300", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, week 2." } },
    { id: "kpv-pd-3", label: "Week 3", source: "peptidedosages", doseText: "400 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "400", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, week 3." } },
    { id: "kpv-pd-4", label: "Weeks 4-8", source: "peptidedosages", doseText: "500 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "500", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 4-8. 8-12 week cycle, optional extension to 16." } }
  ],
  "pt-141": [
    { id: "pt-141-pd-1", label: "Weeks 1-8", source: "peptidedosages", doseText: "500 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "500", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 1-8." } },
    { id: "pt-141-pd-2", label: "Weeks 9-12", source: "peptidedosages", doseText: "1000 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "1000", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 9-12." } },
    { id: "pt-141-pd-3", label: "Weeks 13-16", source: "peptidedosages", doseText: "1500 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "1500", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 13-16." } }
  ],
  "melanotan-ii": [
    { id: "melanotan-ii-pd-1", label: "Week 1", source: "peptidedosages", doseText: "250 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "250", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com loading titration, week 1." } },
    { id: "melanotan-ii-pd-2", label: "Week 2", source: "peptidedosages", doseText: "500 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "500", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com loading titration, week 2." } },
    { id: "melanotan-ii-pd-3", label: "Weeks 3-8 (Loading)", source: "peptidedosages", doseText: "750-1000 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "1000", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com loading phase, weeks 3-8. Do not exceed 2mg/day. Followed by 500-1000mcg 1-2x/week maintenance." } }
  ],
  glutathione: [
    { id: "glutathione-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "100 mg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "100", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 1-2." } },
    { id: "glutathione-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "150 mg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "150", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 3-4." } },
    { id: "glutathione-pd-3", label: "Weeks 5-8", source: "peptidedosages", doseText: "200 mg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "200", unit: "mg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 5-8. 4-8 week cycle with optional 2-4 week off." } }
  ],
  selank: [
    { id: "selank-pd-1", label: "300 mcg/day", source: "peptidedosages", doseText: "300 mcg daily", route: "Nasal", frequencyText: "Once daily", timelineSchedule: { amount: "300", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com intranasal reference dose." } },
    { id: "selank-pd-2", label: "900 mcg/day", source: "peptidedosages", doseText: "900 mcg daily", route: "Nasal", frequencyText: "Once daily", timelineSchedule: { amount: "900", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com intranasal reference dose." } },
    { id: "selank-pd-3", label: "2,700 mcg/day", source: "peptidedosages", doseText: "2,700 mcg daily (divided)", route: "Nasal", frequencyText: "Divided across 3 doses", timelineSchedule: { amount: "2700", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com published research range; 14-day treatment duration cited in clinical studies." } }
  ],
  "igf-1-lr3": [
    { id: "igf-1-lr3-pd-1", label: "Weeks 1-2", source: "peptidedosages", doseText: "20 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "20", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 1-2." } },
    { id: "igf-1-lr3-pd-2", label: "Weeks 3-4", source: "peptidedosages", doseText: "40 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "40", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 3-4." } },
    { id: "igf-1-lr3-pd-3", label: "Weeks 5-8", source: "peptidedosages", doseText: "50 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "50", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 5-8. 8 weeks on, 4-8 weeks off." } }
  ],
  dsip: [
    { id: "dsip-pd-1", label: "Week 1", source: "peptidedosages", doseText: "100 mcg daily", route: "SubQ", frequencyText: "Once daily (evening)", timelineSchedule: { amount: "100", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, week 1." } },
    { id: "dsip-pd-2", label: "Week 2", source: "peptidedosages", doseText: "150 mcg daily", route: "SubQ", frequencyText: "Once daily (evening)", timelineSchedule: { amount: "150", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, week 2." } },
    { id: "dsip-pd-3", label: "Week 3", source: "peptidedosages", doseText: "200 mcg daily", route: "SubQ", frequencyText: "Once daily (evening)", timelineSchedule: { amount: "200", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, week 3." } },
    { id: "dsip-pd-4", label: "Weeks 4-8", source: "peptidedosages", doseText: "250-300 mcg daily", route: "SubQ", frequencyText: "Once daily (evening)", timelineSchedule: { amount: "250", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 4-8 (250-300mcg range). 8-12 week cycle." } }
  ],
  "aod-9604": [
    { id: "aod-9604-pd-1", label: "Weeks 1-4", source: "peptidedosages", doseText: "300 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "300", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 1-4." } },
    { id: "aod-9604-pd-2", label: "Weeks 5-12", source: "peptidedosages", doseText: "500 mcg daily", route: "SubQ", frequencyText: "Once daily", timelineSchedule: { amount: "500", unit: "mcg", frequency: "daily", days: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], note: "peptidedosages.com titration, weeks 5-12. 8-12 week cycle, optional extension to 16." } }
  ]
};

export const PEPTIDEDOSAGES_META: Record<string, { reconstitution: string; cycle: string }> = {
  retatrutide: { reconstitution: "1.0 mL bacteriostatic water → ~10 mg/mL (10mg vial)", cycle: "Minimum 24 weeks; clinical trials extended to 48 weeks." },
  "mots-c": { reconstitution: "3.0 mL bacteriostatic water → ~3.33 mg/mL (10mg vial)", cycle: "8-12 weeks, optional extension to 16 weeks." },
  glow: { reconstitution: "3.0 mL bacteriostatic water → ~23.3 mg/mL (70mg blend)", cycle: "4 weeks of daily dosing, followed by 2-4 weeks off." },
  semax: { reconstitution: "Intranasal — 5 mL or 10 mL sterile saline dilution options.", cycle: "Not stated on source." },
  "nad-plus": { reconstitution: "3.0 mL bacteriostatic water → 333.3 mg/mL (1000mg vial)", cycle: "8-16 weeks with gradual titration." },
  tirzepatide: { reconstitution: "2.0 mL bacteriostatic water → 5.0 mg/mL (10mg vial)", cycle: "12-16+ weeks with 4-week titration intervals." },
  semaglutide: { reconstitution: "3.0 mL bacteriostatic water → ~3.33 mg/mL (10mg vial)", cycle: "16-20+ weeks (gradual titration to maintenance)." },
  "bpc-157": { reconstitution: "3.0 mL bacteriostatic water → 3.33 mg/mL (10mg vial)", cycle: "8-12 weeks, optional extension to 16 weeks." },
  "tb-500": { reconstitution: "3.0 mL bacteriostatic water → ~3.33 mg/mL (10mg vial)", cycle: "8-12 weeks; optional extension to 16 weeks." },
  "ghk-cu": { reconstitution: "3.0 mL sterile/bacteriostatic water → 33.33 mg/mL (100mg vial)", cycle: "8-16 weeks." },
  klow: { reconstitution: "3.0 mL bacteriostatic water → ~26.7 mg/mL total (80mg blend)", cycle: "8-12 weeks; optional extension to 16 weeks." },
  "5-amino-1mq": { reconstitution: "4.0 mL bacteriostatic water → 12.5 mg/mL (50mg vial)", cycle: "A single 50mg vial provides 10-20 days of material at standard doses." },
  epitalon: { reconstitution: "2.0 mL bacteriostatic water → 5 mg/mL (10mg vial)", cycle: "20 consecutive days, then 4-6 month off-cycle (~2 cycles/year)." },
  "cjc-ipamorelin": { reconstitution: "CJC-1295 DAC: 2.0 mL bacteriostatic water → 2.5 mg/mL. Ipamorelin: 3.0 mL bacteriostatic water → 1.67 mg/mL (separate vials).", cycle: "8-12 weeks standard; extend to 16 weeks if tolerated." },
  "bpc-tb": { reconstitution: "3.0 mL bacteriostatic water → ~6.67 mg/mL total (20mg blend)", cycle: "4-8 weeks; optional cycling with 6-week breaks between courses." },
  hgh: { reconstitution: "3.0 mL bacteriostatic water → ~1.11 mg/mL (10 IU vial)", cycle: "Standard 8-12 weeks; optional extension to 16 weeks with monitoring." },
  cagrilintide: { reconstitution: "3.0 mL bacteriostatic water → ~3.33 mg/mL (10mg vial)", cycle: "12-16 weeks (or longer as appropriate)." },
  tesamorelin: { reconstitution: "3.0 mL bacteriostatic water → ~3.33 mg/mL (10mg vial)", cycle: "12-26 weeks; clinical trials support up to 52 weeks with monitoring." },
  ipamorelin: { reconstitution: "3.0 mL bacteriostatic water → ~3.33 mg/mL (10mg vial)", cycle: "8-12 weeks, optional extension to 16, then 2-4 week off-cycle." },
  "cjc-1295-no-dac": { reconstitution: "3.0 mL bacteriostatic water → ~1.67 mg/mL (5mg vial)", cycle: "8-12 weeks, optional extension to 16 weeks." },
  "cjc-1295-dac": { reconstitution: "2.0 mL bacteriostatic water → 2.5 mg/mL (5mg vial)", cycle: "8-12 weeks, optional extension to 16 weeks." },
  hcg: { reconstitution: "2.0 mL bacteriostatic water → 2,500 IU/mL (5000 IU vial)", cycle: "8-12 weeks typical; extend to 16+ for severe suppression cases." },
  "ss-31": { reconstitution: "1.0 mL bacteriostatic water → 10 mg/mL (10mg vial)", cycle: "8-12 weeks." },
  kpv: { reconstitution: "3.0 mL bacteriostatic water → ~3.33 mg/mL (10mg vial)", cycle: "8-12 weeks; optional extension to 16 weeks." },
  "pt-141": { reconstitution: "3.0 mL bacteriostatic water → ~3.33 mg/mL (10mg vial)", cycle: "8-16 weeks total (gradual titration)." },
  "melanotan-ii": { reconstitution: "3.0 mL bacteriostatic water → 3.33 mg/mL (10mg vial)", cycle: "6-8 weeks loading phase, then ongoing 1-2x weekly maintenance." },
  glutathione: { reconstitution: "2.0 mL bacteriostatic water → 300 mg/mL (600mg vial)", cycle: "4-8 weeks, with optional 2-4 week cycle-off." },
  selank: { reconstitution: "Intranasal — 5 mL or 10 mL sterile vehicle dilution options.", cycle: "14-day treatment duration cited in clinical studies." },
  "igf-1-lr3": { reconstitution: "3.0 mL bacteriostatic water → ~0.333 mg/mL (1mg vial)", cycle: "8 weeks on, 4-8 weeks off." },
  dsip: { reconstitution: "3.0 mL bacteriostatic water → ~3.33 mg/mL (10mg vial)", cycle: "8-12 weeks with gradual titration; consider a break after the cycle." },
  "aod-9604": { reconstitution: "3.0 mL bacteriostatic water → ~1.67 mg/mL (5mg vial)", cycle: "8-12 weeks; optional extension to 16 weeks." }
};
