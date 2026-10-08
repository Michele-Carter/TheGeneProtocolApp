/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DosingSourceId = "pep-pedia" | "peptidedosages" | "peptide-db";

// The fixed set of frequency presets used by data-source-driven schedules (GoalDoseOption,
// PeptideProtocolInfo). PeptideDoseConfig.frequency is intentionally NOT this type — Manual mode
// lets a user type any custom frequency text, since the actual dosing days are independently
// driven by PeptideDoseConfig.days, not parsed from this string.
export type PresetDoseFrequency = "daily" | "2x/daily" | "3x/week" | "2x/week" | "weekly";

export interface GoalDoseOption {
  id: string;
  label: string;
  parentGoal?: string;
  doseText: string;
  route?: string;
  frequencyText?: string;
  source?: DosingSourceId; // undefined = pep-pedia (existing entries predate this tag)
  timelineSchedule?: {
    amount: string;
    unit: "mg" | "mcg" | "IU" | "mL";
    frequency: PresetDoseFrequency;
    days: string[];
    note: string;
  };
}

export interface PeptideProtocolInfo {
  id: string;
  name: string;
  category: string; // e.g. "Mitochondrial-targeted", "Copper peptide", "GLP-1/GIP/Glucagon agonist"
  description: string;
  goals: string[]; // Longevity, Fat Loss, Cognitive, Healing
  halfLife: string;
  peakTime: string;
  bestTime: string;
  bestTimeDetails: string;
  standardDose: string;
  goalDoseOptions?: GoalDoseOption[];
  standardRoute: string; // SubQ, IM, Nasal, IV
  frequencyLabel: string; // e.g. "3x/wk", "daily", "Same day weekly"
  dosingSchedule: {
    amount: string;
    unit: "mg" | "mcg" | "IU" | "mL";
    frequency: PresetDoseFrequency;
    days: string[]; // ['MON', 'WED', 'FRI'] or ['MON'] or [] for daily
    note: string;
  };
  cycle: string; // e.g. "4 wk on / 2 wk off"
  injectionSites: string[];
  expectations: { week: string; text: string }[];
  safetyProfile: {
    common: string[];
    stopAndSeekCare: string[];
    doNotUseIf: string[];
  };
}

export interface PeptideDoseConfig {
  amount: string;
  unit: "mg" | "mcg" | "IU" | "mL";
  startDay: string; // ISO date (YYYY-MM-DD) this peptide's dosing begins
  frequency: string; // preset text (PresetDoseFrequency) in Automatic mode, or free-typed custom text in Manual mode
  days: string[]; // toggled injection days, e.g. ["MON", "WED", "FRI"]
  cycleOnWeeks?: number; // Manual-only custom cycle override; unset = use the peptide's pep-pedia default cycle
  cycleOffWeeks?: number;
  // When set, the calendar steps the dose through this ordered sequence by protocol week instead
  // of using a flat `amount`/`unit` for the whole run; cleared by picking a flat goal option or
  // hand-editing amount/unit. Ordered ascending by startWeek; a given week uses the last step whose
  // startWeek <= that week.
  titrationSteps?: { startWeek: number; amount: string; unit: "mg" | "mcg" | "IU" | "mL" }[];
  // "auto" = mirrors the effective source's database track (from the Protocol goal dropdown or the
  // auto-applied default) — the Protocol goal dropdown stays the visible control. "manual" = the
  // user is hand-authoring/editing the steps — the dropdown is hidden in favor of the step editor.
  // Meaningless when titrationSteps is unset.
  titrationMode?: "auto" | "manual";
}

// The full per-protocol payload persisted server-side (one row in the `protocols` table per
// protocol). Shared between useProtocolBuilderState (which reads/writes these fields) and
// protocolsApi/useProtocols (which move the blob to and from the backend).
export interface PersistedProtocolBuilderPayload {
  selectedPeptideIds?: string[];
  doseConfigByPeptide?: Record<string, PeptideDoseConfig>;
  builderMode?: "automatic" | "manual";
  protocolDataSource?: DosingSourceId;
  sourceOverrideByPeptide?: Record<string, DosingSourceId>;
  selectedGoalOptionByPeptide?: Record<string, string>;
  timeframeWeeks?: number;
  bodyWeight?: number;
  bodyWeightTouched?: boolean;
  weightUnit?: "kg" | "lbs";
  protocolStartDate?: string;
  timelineGenerated?: boolean;
  timelineViewMode?: "day" | "week" | "month";
  selectedDate?: string;
  completedDoses?: Record<string, boolean>;
  expandedIntel?: Record<string, boolean>;
}

// A single named protocol (e.g. one family member's dosing plan), as stored/returned by the
// /api/protocols backend.
export interface ProtocolRecord {
  id: string;
  name: string;
  data: PersistedProtocolBuilderPayload;
  createdAt: string;
  updatedAt: string;
}

export interface PeptideInteraction {
  peptideA: string;
  peptideB: string;
  type: "Synergy" | "Compatible" | "Caution";
  description: string;
}

// ---- Peptide Database (peptide-db.com) types — powers the standalone browse/detail reference
// library. Deliberately separate from PeptideProtocolInfo/PeptideInteraction: peptide-db's shape
// (effectiveness ratings, FAQ, references, its own interaction vocabulary) doesn't map cleanly
// onto those, and the two data sources should be attributable/editable independently.
//
// Shape mirrors peptide-db.com's own per-page data model field-for-field (extracted from each
// page's embedded SvelteKit hydration payload, not scraped from rendered DOM) rather than a
// hand-guessed shape, so the scraper's mapping stays a straight passthrough and nothing gets
// silently dropped or reworded in translation. ----

export type PeptideDbEffectiveness = "Most Effective" | "Effective" | "Moderate" | "Emerging";
export type PeptideDbInteractionStatus = "Synergistic" | "Compatible" | "Monitor" | "Avoid" | "Requires Timing";

export interface PeptideDbResearchIndication {
  category: string; // e.g. "Longevity", "Metabolism", "Weight Loss" — as published, not an enum
  indication: string; // short label, e.g. "Fat oxidation"
  effectiveness: PeptideDbEffectiveness;
  description: string;
}

export interface PeptideDbDosingRow {
  goal: string;
  dose: string;
  frequency: string;
  route: string;
  notes?: string;
}

export interface PeptideDbReconstitution {
  materials: string[];
  steps: string[];
}

export interface PeptideDbDeliveryMethod {
  type: string; // e.g. "oral" | "injectable" | "nasal" — as published, not an enum
  overview: string;
  protocols: PeptideDbDosingRow[];
  keyBenefits: string[];
  reconstitution?: PeptideDbReconstitution;
}

export interface PeptideDbInteraction {
  peptideSlug?: string; // set only when peptideName resolves to a known catalog peptide/compound —
  // peptide-db's own interaction entries are often generic substances ("Blood Thinners", "NAD+
  // Precursors (NMN, NR)") rather than another catalog page, so this can't be required.
  peptideName: string;
  relationship: PeptideDbInteractionStatus;
  description: string;
}

export interface PeptideDbTimelineEntry {
  period: string; // e.g. "Week 1-2"
  effects: string;
}

export interface PeptideDbSafety {
  common: string[];
  rare: string[];
  stopAndSeekCare: string[];
  contraindications: string[];
  monitoring: string[];
}

export interface PeptideDbQualityChecklist {
  good: string[];
  warning: string[];
  bad: string[];
}

export interface PeptideDbFaqEntry {
  question: string;
  answer: string; // verbatim, sourced from the page's own data (also mirrored in its FAQPage ld+json block)
}

export interface PeptideDbReference {
  index: number;
  title: string;
  author?: string;
  journal?: string;
  year?: string;
  participants?: string; // study cohort description, e.g. "338 adults with obesity" — not on every reference
  summary: string;
  url?: string;
}

export interface PeptideDbLatestResearchEntry {
  title: string;
  date: string;
  source?: string;
  summary: string;
  url?: string;
}

export interface PeptideDbQuickStats {
  typicalDose: string;
  frequency: string;
  cycleDuration: string;
  storage: string;
}

export interface PeptideDbPharmacology {
  targets: string[];
  pathways: string[];
  organs: { organ: string; load: string }[];
  safetyFlags: string[];
  evidence: string;
}

// Present only on blend/stack pages (e.g. "Wolverine Stack", "GLOW Protocol") — the per-component
// breakdown of a multi-peptide blend.
export interface PeptideDbBlendComponent {
  name: string;
  amount: number;
  ratio: number;
}

export interface PeptideDbBlendComposition {
  totalAmount: number;
  unit: string;
  components: PeptideDbBlendComponent[];
}

// Present only on peptides where multiple competing dosing philosophies are documented (e.g.
// Epitalon's "research-based low dose" vs. "high-dose community protocol") — distinct from
// deliveryMethods, which is one route's own goal/dose/frequency table.
export interface PeptideDbProtocolVariantDose {
  phase: string;
  dose: string;
  frequency: string;
  duration: string;
}

export interface PeptideDbProtocolVariant {
  name: string;
  source: string;
  sourceUrl?: string;
  philosophy: string;
  description: string;
  keyDifferences: string[];
  doses: PeptideDbProtocolVariantDose[];
}

export interface PeptideDbEntry {
  slug: string; // peptide-db.com URL slug — primary key for this dataset
  linkedPeptideId?: string; // set when this peptide also has a row in PEPTIDES_DATABASE
  name: string;
  subtitle: string; // short category line shown under the name, e.g. "NNMT Inhibitor | Longevity & Metabolic Enhancement"
  aliases: string[];
  researchStatus: string; // e.g. "preclinical" | "established" | "extensively-studied" | "fda-approved" — as published
  fdaApproved: boolean;
  categories: string[]; // filter-chip tags, e.g. ["longevity", "metabolic", "weight-loss"]
  molecularInfo: {
    type: string;
    weight?: string; // source field is inconsistently named "weight" or "molecularWeight" — normalized to this one
    length?: string; // e.g. "15 amino acids"
    sequence?: string; // amino acid sequence, or "N/A" for non-peptide/blend entries
    formula?: string; // chemical formula, e.g. "C15H25N3O8" — only present on some small-molecule entries
    components?: string; // free-text composition note for multi-hormone blends, e.g. "FSH and LH in 1:1 ratio"
    modifications: string[];
    halfLife?: string;
    halfLifeSeconds?: number;
    halfLifeRoute?: string;
  };
  overview: string;
  mechanism: string;
  keyBenefits: string[];
  researchIndications: PeptideDbResearchIndication[];
  deliveryMethods: PeptideDbDeliveryMethod[];
  blendComposition?: PeptideDbBlendComposition;
  protocolVariants: PeptideDbProtocolVariant[];
  interactions: PeptideDbInteraction[];
  whatToExpect: PeptideDbTimelineEntry[];
  safety: PeptideDbSafety;
  qualityChecklist: PeptideDbQualityChecklist;
  references: PeptideDbReference[];
  latestResearch: PeptideDbLatestResearchEntry[];
  faq: PeptideDbFaqEntry[];
  quickStats: PeptideDbQuickStats;
  pharmacology: PeptideDbPharmacology;
  sourceUrl: string;
  datePublished?: string;
  dateModified?: string;
}

// Weight Tracker Types
export interface WeightEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weight: number; // weight in selected unit (kg)
}

// Shot Log Types
export interface ShotEntry {
  id: string;
  date: string; // YYYY-MM-DD
  peptideName: string;
  dosage: string; // e.g., "0.5 mg" or "250 mcg"
  site: string; // rotation site
  notes: string; // dose comments
}

