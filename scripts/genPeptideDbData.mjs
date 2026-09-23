// Reads the validated intermediate JSON from scripts/.peptide-db-raw/ (written by
// scrapePeptideDb.mjs) and emits the final src/data/peptideDb.ts and src/data/peptideDbSource.ts
// TS source files. Kept as a separate, re-runnable stage from the scrape itself.
//
// Usage: node scripts/genPeptideDbData.mjs

import fs from "node:fs";
import path from "node:path";

const RAW_DIR = path.join("scripts", ".peptide-db-raw");
const PEPTIDES_TS_PATH = path.join("src", "data", "peptides.ts");

// Peptides already hand-entered in RAW_PEPTIDES_DATABASE whose peptide-db.com slug differs from
// their existing id in this app — mirrors the `overrides` map precedent in the old
// .tmp_pep_extract.cjs pep-pedia scraper. Keyed by peptide-db slug -> existing RAW_PEPTIDES_DATABASE id.
const SLUG_TO_EXISTING_ID_OVERRIDES = {
  "glow-protocol": "glow",
  "klow-protocol": "klow",
  "cjc-ipa-protocol": "cjc-ipamorelin",
  "cjc-1295": "cjc-1295-no-dac",
  "wolverine-stack": "bpc-tb"
};

const EFFECTIVENESS_MAP = {
  "most-effective": "Most Effective",
  effective: "Effective",
  moderate: "Moderate",
  emerging: "Emerging"
};

const INTERACTION_STATUS_MAP = {
  synergistic: "Synergistic",
  compatible: "Compatible",
  monitor: "Monitor",
  avoid: "Avoid",
  "requires-timing": "Requires Timing"
};

const CATEGORY_TO_GOAL = {
  longevity: "Longevity / Anti-aging",
  "anti-aging": "Longevity / Anti-aging",
  metabolic: "Fat loss / Metabolic",
  "weight-loss": "Fat loss / Metabolic",
  cognitive: "Cognitive / Neuro",
  healing: "Healing / Recovery",
  recovery: "Healing / Recovery",
  "tissue-repair": "Healing / Recovery"
};

const ROUTE_LABEL = {
  injectable: "SubQ",
  oral: "Oral",
  nasal: "Nasal",
  topical: "Topical"
};

function parseDoseParts(doseText) {
  const normalized = String(doseText).replace(/μg/gi, "mcg");
  const match = normalized.match(/(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?)\s*(mg|mcg|iu|ml)\b/i);
  if (!match) return null;
  const unit = match[2].toLowerCase();
  const mappedUnit = unit === "iu" ? "IU" : unit === "ml" ? "mL" : unit;
  return { amount: match[1], unit: mappedUnit };
}

function parseFrequency(frequencyText) {
  const text = String(frequencyText).toLowerCase();
  if (/(twice daily|2x daily|2 times daily|1-2x daily|once or twice daily)/.test(text)) return "2x/daily";
  if (/(3x weekly|3 times weekly|2-3x weekly|2-3 times weekly|every other day)/.test(text)) return "3x/week";
  if (/(twice weekly|2x weekly|2 times weekly|1-2x weekly)/.test(text)) return "2x/week";
  if (/(once weekly|weekly|per week)/.test(text)) return "weekly";
  if (/(daily|once daily|nightly|1x daily)/.test(text)) return "daily";
  return null;
}

function getDaysForFrequency(frequency) {
  if (frequency === "weekly") return ["MON"];
  if (frequency === "2x/week") return ["MON", "THU"];
  if (frequency === "3x/week") return ["MON", "WED", "FRI"];
  return ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
}

function loadExistingIds() {
  const src = fs.readFileSync(PEPTIDES_TS_PATH, "utf-8");
  return new Set([...src.matchAll(/^    id: "([^"]+)"/gm)].map((m) => m[1]));
}

function loadRawEntries() {
  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf-8")));
}

function mapEffectiveness(raw, ctx, warnings) {
  const mapped = EFFECTIVENESS_MAP[raw];
  if (!mapped) {
    warnings.push(`${ctx}: unrecognized effectiveness value "${raw}"`);
    return "Moderate";
  }
  return mapped;
}

function mapInteractionStatus(raw, ctx, warnings) {
  const mapped = INTERACTION_STATUS_MAP[raw];
  if (!mapped) {
    warnings.push(`${ctx}: unrecognized interaction status "${raw}"`);
    return "Monitor";
  }
  return mapped;
}

function buildPeptideDbEntry(raw, warnings) {
  const p = raw.peptide;
  const ctx = p.id;

  const researchIndications = (p.indications ?? []).flatMap((group) =>
    (group.items ?? []).map((item) => ({
      category: group.category,
      indication: item.name,
      effectiveness: mapEffectiveness(item.effectiveness, `${ctx}/${item.name}`, warnings),
      description: item.description
    }))
  );

  const deliveryMethods = (p.deliveryMethods ?? [])
    .filter((dm) => dm.available !== false)
    .map((dm) => ({
      type: dm.type,
      overview: dm.overview ?? "",
      protocols: (dm.protocols ?? []).map((row) => ({
        goal: row.goal,
        dose: row.dose,
        frequency: row.frequency,
        route: row.route,
        ...(row.notes ? { notes: row.notes } : {})
      })),
      keyBenefits: dm.keyBenefits ?? [],
      ...(dm.reconstitution ? { reconstitution: { materials: dm.reconstitution.materials ?? [], steps: dm.reconstitution.steps ?? [] } } : {})
    }));

  const protocolVariants = (p.protocolVariants ?? []).map((v) => ({
    name: v.name,
    source: v.source,
    ...(v.sourceUrl ? { sourceUrl: v.sourceUrl } : {}),
    philosophy: v.philosophy,
    description: v.description,
    keyDifferences: v.keyDifferences ?? [],
    doses: (v.doses ?? []).map((d) => ({ phase: d.phase, dose: d.dose, frequency: d.frequency, duration: d.duration }))
  }));

  const interactions = (p.interactions ?? []).map((it) => ({
    peptideName: it.peptide,
    relationship: mapInteractionStatus(it.status, `${ctx}/${it.peptide}`, warnings),
    description: it.notes
  }));

  const references = (p.references ?? []).map((r, idx) => ({
    index: idx + 1,
    title: r.title,
    author: r.authors,
    journal: r.journal,
    year: r.year,
    ...(r.participants ? { participants: r.participants } : {}),
    summary: r.keyFindings,
    url: r.url
  }));

  return {
    slug: p.id,
    name: p.name,
    subtitle: p.subtitle ?? "",
    aliases: p.aliases ?? [],
    researchStatus: p.researchStatus ?? "unknown",
    fdaApproved: !!p.fdaApproved,
    categories: p.categories ?? [],
    molecularInfo: {
      type: p.molecular?.type ?? "Not established",
      weight: p.molecular?.weight ?? p.molecular?.molecularWeight,
      length: p.molecular?.length,
      sequence: p.molecular?.sequence,
      formula: p.molecular?.formula,
      components: p.molecular?.components,
      modifications: p.molecular?.modifications ?? [],
      halfLife: p.molecular?.halfLife,
      halfLifeSeconds: p.molecular?.halfLifeSeconds,
      halfLifeRoute: p.molecular?.halfLifeRoute
    },
    overview: p.overview ?? "",
    mechanism: p.mechanism ?? "",
    keyBenefits: p.keyBenefits ?? [],
    researchIndications,
    deliveryMethods,
    ...(p.blendComposition
      ? {
          blendComposition: {
            totalAmount: p.blendComposition.totalAmount,
            unit: p.blendComposition.unit,
            components: (p.blendComposition.components ?? []).map((c) => ({ name: c.name, amount: c.amount, ratio: c.ratio }))
          }
        }
      : {}),
    protocolVariants,
    interactions,
    whatToExpect: (p.timeline ?? []).map((t) => ({ period: t.period, effects: t.effects })),
    safety: {
      common: p.sideEffects?.common ?? [],
      rare: p.sideEffects?.rare ?? [],
      stopAndSeekCare: p.sideEffects?.stopSigns ?? [],
      contraindications: p.sideEffects?.contraindications ?? [],
      monitoring: p.sideEffects?.monitoring ?? []
    },
    qualityChecklist: {
      good: p.qualityChecklist?.good ?? [],
      warning: p.qualityChecklist?.warning ?? [],
      bad: p.qualityChecklist?.bad ?? []
    },
    references,
    latestResearch: (p.latestResearch ?? []).map((lr) => ({
      title: lr.title,
      date: lr.date,
      source: lr.source,
      summary: lr.summary,
      url: lr.url
    })),
    faq: (p.faqs ?? []).map((f) => ({ question: f.question, answer: f.answer })),
    quickStats: {
      typicalDose: p.quickStats?.typicalDose ?? "",
      frequency: p.quickStats?.frequency ?? "",
      cycleDuration: p.quickStats?.cycleDuration ?? "",
      storage: p.quickStats?.storage ?? ""
    },
    pharmacology: {
      targets: p.pharmacology?.targets ?? [],
      pathways: p.pharmacology?.pathways ?? [],
      organs: p.pharmacology?.organs ?? [],
      safetyFlags: p.pharmacology?.safetyFlags ?? [],
      evidence: p.pharmacology?.evidence ?? "unknown"
    },
    sourceUrl: raw.sourceUrl,
    datePublished: raw.datePublished,
    dateModified: raw.dateModified
  };
}

function linkInteractionSlugs(entries) {
  const byName = new Map();
  for (const e of entries) {
    byName.set(e.name.toLowerCase(), e.slug);
    for (const alias of e.aliases) byName.set(alias.toLowerCase(), e.slug);
  }
  for (const e of entries) {
    for (const interaction of e.interactions) {
      const match = byName.get(interaction.peptideName.toLowerCase());
      if (match) interaction.peptideSlug = match;
    }
  }
}

function buildGoalDoseOptions(entry, warnings) {
  const options = [];
  let counter = 1;
  for (const dm of entry.deliveryMethods) {
    for (const row of dm.protocols) {
      const doseParts = parseDoseParts(row.dose);
      const frequency = parseFrequency(row.frequency);
      if (!doseParts || !frequency) {
        warnings.push(`${entry.slug}: could not parse dose/frequency for "${row.goal}" (${row.dose}, ${row.frequency}) — skipped from GoalDoseOption list`);
        continue;
      }
      options.push({
        id: `${entry.slug}-pdb-${counter++}`,
        label: row.goal,
        doseText: row.dose,
        route: row.route,
        frequencyText: row.frequency,
        source: "peptide-db",
        timelineSchedule: {
          amount: doseParts.amount,
          unit: doseParts.unit,
          frequency,
          days: getDaysForFrequency(frequency),
          note: `peptide-db.com — ${row.goal}: ${row.dose}, ${row.frequency}.`
        }
      });
    }
  }
  return options;
}

function mapGoalsFromCategories(categories) {
  const goals = [...new Set(categories.map((c) => CATEGORY_TO_GOAL[c]).filter(Boolean))];
  return goals.length > 0 ? goals : ["Healing / Recovery"];
}

function buildStubPeptide(entry, goalDoseOptions) {
  const firstDelivery = entry.deliveryMethods[0];
  const firstRow = firstDelivery?.protocols?.[0];
  const doseParts = firstRow ? parseDoseParts(firstRow.dose) : null;
  const frequency = firstRow ? parseFrequency(firstRow.frequency) : null;

  const hasInjectable = entry.deliveryMethods.some((dm) => dm.type === "injectable");

  return {
    id: entry.slug,
    name: entry.name,
    category: entry.subtitle || entry.molecularInfo.type,
    description: entry.overview,
    goals: mapGoalsFromCategories(entry.categories),
    halfLife: entry.molecularInfo.halfLife ?? "Not established",
    peakTime: "Not established",
    bestTime: entry.quickStats.frequency || "See dosing protocol",
    bestTimeDetails: firstDelivery?.overview ?? entry.mechanism,
    standardDose: entry.quickStats.typicalDose || firstRow?.dose || "See dosing protocol",
    goalDoseOptions,
    standardRoute: ROUTE_LABEL[firstDelivery?.type] ?? firstDelivery?.type ?? "SubQ",
    frequencyLabel: entry.quickStats.frequency || firstRow?.frequency || "See dosing protocol",
    dosingSchedule: {
      amount: doseParts?.amount ?? "0",
      unit: doseParts?.unit ?? "mg",
      frequency: frequency ?? "daily",
      days: frequency ? getDaysForFrequency(frequency) : ["MON"],
      note: `peptide-db.com — ${entry.quickStats.typicalDose}, ${entry.quickStats.frequency}.`
    },
    cycle: entry.quickStats.cycleDuration || "Not established",
    injectionSites: hasInjectable ? ["Abdomen", "Thigh"] : [],
    expectations: entry.whatToExpect.map((t) => ({ week: t.period, text: t.effects })),
    safetyProfile: {
      common: entry.safety.common,
      stopAndSeekCare: entry.safety.stopAndSeekCare,
      doNotUseIf: entry.safety.contraindications
    }
  };
}

function tsLiteral(value, indent = 2) {
  return JSON.stringify(value, null, indent).replace(/"([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, "$1:");
}

function main() {
  const existingIds = loadExistingIds();
  const rawList = loadRawEntries().filter((r) => !r.error);
  const warnings = [];

  const entries = rawList.map((raw) => buildPeptideDbEntry(raw, warnings));
  linkInteractionSlugs(entries);

  for (const entry of entries) {
    const overrideId = SLUG_TO_EXISTING_ID_OVERRIDES[entry.slug];
    const candidateId = overrideId ?? entry.slug;
    if (existingIds.has(candidateId)) {
      entry.linkedPeptideId = candidateId;
    }
  }

  const goalOptionsBySlug = {};
  const metaBySlug = {};
  const stubPeptides = [];

  for (const entry of entries) {
    const goalDoseOptions = buildGoalDoseOptions(entry, warnings);
    const key = entry.linkedPeptideId ?? entry.slug;
    goalOptionsBySlug[key] = goalDoseOptions;
    metaBySlug[key] = {
      molecularType: entry.molecularInfo.type,
      typicalDose: entry.quickStats.typicalDose,
      frequency: entry.quickStats.frequency,
      cycleDuration: entry.quickStats.cycleDuration,
      storage: entry.quickStats.storage
    };
    if (!entry.linkedPeptideId) {
      stubPeptides.push(buildStubPeptide(entry, goalDoseOptions));
    }
  }

  const peptideDbTs = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Generated by scripts/genPeptideDbData.mjs from scripts/.peptide-db-raw/*.json — do not hand-edit.
// Re-run the scraper + this script to refresh.

import { PeptideDbEntry, PeptideProtocolInfo } from "../types";

export const PEPTIDEDB_ENTRIES: PeptideDbEntry[] = ${tsLiteral(entries)};

export const PEPTIDEDB_BASE_PEPTIDES: PeptideProtocolInfo[] = ${tsLiteral(stubPeptides)};
`;

  const peptideDbSourceTs = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Dosing overlay compiled from peptide-db.com, feeding a third "peptide-db" GoalDoseOption source
// into peptides.ts's PEPTIDES_DATABASE merge — mirrors peptideDosagesSource.ts's shape/convention
// exactly: exact transcribed numeric dosing facts, each option tagged \`source: "peptide-db"\` with
// a \`timelineSchedule.note\` citing "peptide-db.com ..." per row.
//
// Generated by scripts/genPeptideDbData.mjs from scripts/.peptide-db-raw/*.json — do not hand-edit.

import { GoalDoseOption } from "../types";

export const PEPTIDEDB_GOAL_OPTIONS: Record<string, GoalDoseOption[]> = ${tsLiteral(goalOptionsBySlug)};

export const PEPTIDEDB_META: Record<
  string,
  { molecularType: string; typicalDose: string; frequency: string; cycleDuration: string; storage: string }
> = ${tsLiteral(metaBySlug)};
`;

  fs.writeFileSync(path.join("src", "data", "peptideDb.ts"), peptideDbTs);
  fs.writeFileSync(path.join("src", "data", "peptideDbSource.ts"), peptideDbSourceTs);

  console.log(`Wrote ${entries.length} peptide-db entries (${entries.length - stubPeptides.length} linked, ${stubPeptides.length} stub) to src/data/peptideDb.ts and src/data/peptideDbSource.ts`);
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.forEach((w) => console.log(" - " + w));
  }
}

main();
