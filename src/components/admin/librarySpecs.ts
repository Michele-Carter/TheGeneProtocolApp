import type { FieldSpec, FormSection } from "./RecordForm";

// What can be edited on each kind of peptide library record (shapes in src/types.ts).

const opts = (values: string[]) => values.map((value) => ({ value, label: value || "—" }));
const UNITS = opts(["mg", "mcg", "IU", "mL"]);
const FREQUENCIES = opts(["daily", "2x/daily", "3x/week", "2x/week", "weekly"]);

const t = (key: string, label: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, type: "text", ...extra }) as FieldSpec;
const long = (key: string, label: string, hint?: string): FieldSpec => ({ key, label, type: "longtext", hint });
const lines = (key: string, label: string, hint?: string): FieldSpec => ({ key, label, type: "lines", hint });

// ---- Peptide Database page (PeptideDbEntry) ----

export function entrySections(peptideOptions: { value: string; label: string }[]): FormSection[] {
  return [
    {
      title: "Basics",
      open: true,
      fields: [
        t("name", "Name"),
        t("slug", "Id", { hint: "Lower-case letters, numbers and dashes, e.g. bpc-157. Can't be changed later.", lockedWhenEditing: true }),
        t("subtitle", "Subtitle", { hint: "The short line under the name, e.g. NNMT Inhibitor | Longevity" }),
        lines("aliases", "Other names"),
        lines("categories", "Categories", "One per line, e.g. weight-loss. These are the filter buttons on the Peptide Database page."),
        t("researchStatus", "Research status", { hint: "e.g. preclinical, established, fda-approved" }),
        { key: "fdaApproved", label: "FDA approved", type: "boolean" },
        {
          key: "linkedPeptideId",
          label: "Protocol Builder peptide",
          type: "select",
          options: [{ value: "", label: "None" }, ...peptideOptions],
          hint: "The same peptide in the Protocol Builder, if it's there.",
        },
      ],
    },
    {
      title: "Overview",
      fields: [long("overview", "Overview"), long("mechanism", "How it works"), lines("keyBenefits", "Key benefits")],
    },
    {
      title: "Quick stats",
      fields: [
        {
          key: "quickStats",
          label: "Quick stats",
          type: "group",
          fields: [t("typicalDose", "Typical dose"), t("frequency", "Frequency"), t("cycleDuration", "Cycle length"), t("storage", "Storage")],
        },
      ],
    },
    {
      title: "Molecular info",
      fields: [
        {
          key: "molecularInfo",
          label: "Molecular info",
          type: "group",
          fields: [
            t("type", "Type"),
            t("weight", "Molecular weight"),
            t("length", "Length", { hint: "e.g. 15 amino acids" }),
            t("sequence", "Sequence"),
            t("formula", "Formula"),
            t("components", "Components"),
            lines("modifications", "Modifications"),
            t("halfLife", "Half-life", { hint: "As shown, e.g. 4-7 hours" }),
            { key: "halfLifeSeconds", label: "Half-life in seconds", type: "number", hint: "Used for charts. Leave blank if unknown." },
            t("halfLifeRoute", "Half-life route", { hint: "e.g. oral, subq" }),
          ],
        },
      ],
    },
    {
      title: "Research",
      fields: [
        {
          key: "researchIndications",
          label: "What it's researched for",
          type: "list",
          itemLabel: "Indication",
          titleKey: "indication",
          fields: [
            t("category", "Category", { hint: "e.g. Longevity" }),
            t("indication", "Indication"),
            { key: "effectiveness", label: "Effectiveness", type: "select", options: opts(["Most Effective", "Effective", "Moderate", "Emerging"]) },
            long("description", "Description"),
          ],
        },
      ],
    },
    {
      title: "Dosing",
      fields: [
        {
          key: "deliveryMethods",
          label: "Ways to take it",
          type: "list",
          itemLabel: "Method",
          titleKey: "type",
          fields: [
            t("type", "Type", { hint: "e.g. injectable, oral, nasal" }),
            long("overview", "Overview"),
            {
              key: "protocols",
              label: "Dosing table",
              type: "list",
              itemLabel: "Row",
              titleKey: "goal",
              fields: [t("goal", "Goal"), t("dose", "Dose"), t("frequency", "Frequency"), t("route", "Route"), t("notes", "Notes")],
            },
            lines("keyBenefits", "Benefits of this method"),
            {
              key: "reconstitution",
              label: "Reconstitution",
              type: "group",
              optional: true,
              fields: [lines("materials", "Materials"), lines("steps", "Steps")],
            },
          ],
        },
        {
          key: "protocolVariants",
          label: "Other dosing approaches",
          type: "list",
          itemLabel: "Approach",
          titleKey: "name",
          fields: [
            t("name", "Name"),
            t("source", "Source"),
            t("sourceUrl", "Source link"),
            t("philosophy", "Philosophy"),
            long("description", "Description"),
            lines("keyDifferences", "Key differences"),
            {
              key: "doses",
              label: "Doses",
              type: "list",
              itemLabel: "Phase",
              titleKey: "phase",
              fields: [t("phase", "Phase"), t("dose", "Dose"), t("frequency", "Frequency"), t("duration", "Duration")],
            },
          ],
        },
        {
          key: "blendComposition",
          label: "Blend contents",
          type: "group",
          optional: true,
          hint: "Only for blends of several peptides.",
          fields: [
            { key: "totalAmount", label: "Total amount", type: "number" },
            t("unit", "Unit"),
            {
              key: "components",
              label: "Components",
              type: "list",
              itemLabel: "Component",
              titleKey: "name",
              fields: [t("name", "Name"), { key: "amount", label: "Amount", type: "number" }, { key: "ratio", label: "Ratio", type: "number" }],
            },
          ],
        },
      ],
    },
    {
      title: "Interactions",
      fields: [
        {
          key: "interactions",
          label: "Interactions",
          type: "list",
          itemLabel: "Interaction",
          titleKey: "peptideName",
          fields: [
            t("peptideName", "With"),
            t("peptideSlug", "Links to page id", { hint: "Optional: the id of another page here, to link to it." }),
            {
              key: "relationship",
              label: "Relationship",
              type: "select",
              options: opts(["Synergistic", "Compatible", "Monitor", "Avoid", "Requires Timing"]),
            },
            long("description", "Description"),
          ],
        },
      ],
    },
    {
      title: "What to expect",
      fields: [
        {
          key: "whatToExpect",
          label: "Timeline",
          type: "list",
          itemLabel: "Period",
          titleKey: "period",
          fields: [t("period", "Period", { hint: "e.g. Week 1-2" }), long("effects", "Effects")],
        },
      ],
    },
    {
      title: "Safety",
      fields: [
        {
          key: "safety",
          label: "Safety",
          type: "group",
          fields: [
            lines("common", "Common side effects"),
            lines("rare", "Rare side effects"),
            lines("stopAndSeekCare", "Stop and seek care if"),
            lines("contraindications", "Don't use if"),
            lines("monitoring", "Monitoring"),
          ],
        },
        {
          key: "qualityChecklist",
          label: "Quality checklist",
          type: "group",
          fields: [lines("good", "Good signs"), lines("warning", "Warning signs"), lines("bad", "Bad signs")],
        },
      ],
    },
    {
      title: "Pharmacology",
      fields: [
        {
          key: "pharmacology",
          label: "Pharmacology",
          type: "group",
          fields: [
            lines("targets", "Targets"),
            lines("pathways", "Pathways"),
            {
              key: "organs",
              label: "Organs",
              type: "list",
              itemLabel: "Organ",
              titleKey: "organ",
              fields: [t("organ", "Organ"), t("load", "Load")],
            },
            lines("safetyFlags", "Safety flags"),
            t("evidence", "Evidence"),
          ],
        },
      ],
    },
    {
      title: "References & research",
      fields: [
        {
          key: "references",
          label: "References",
          type: "list",
          itemLabel: "Reference",
          titleKey: "title",
          fields: [
            { key: "index", label: "Number", type: "number" },
            t("title", "Title"),
            t("author", "Author"),
            t("journal", "Journal"),
            t("year", "Year"),
            t("participants", "Participants"),
            long("summary", "Summary"),
            t("url", "Link"),
          ],
        },
        {
          key: "latestResearch",
          label: "Latest research",
          type: "list",
          itemLabel: "Study",
          titleKey: "title",
          fields: [t("title", "Title"), t("date", "Date"), t("source", "Source"), long("summary", "Summary"), t("url", "Link")],
        },
      ],
    },
    {
      title: "FAQ",
      fields: [
        {
          key: "faq",
          label: "Questions",
          type: "list",
          itemLabel: "Question",
          titleKey: "question",
          fields: [t("question", "Question"), long("answer", "Answer")],
        },
      ],
    },
    {
      title: "Source",
      fields: [t("sourceUrl", "Source link"), t("datePublished", "Date published"), t("dateModified", "Date updated")],
    },
  ];
}

// ---- Protocol Builder peptide (PeptideProtocolInfo) ----

const scheduleFields: FieldSpec[] = [
  t("amount", "Amount", { hint: "e.g. 250" }),
  { key: "unit", label: "Unit", type: "select", options: UNITS },
  { key: "frequency", label: "Frequency", type: "select", options: FREQUENCIES },
  { key: "days", label: "Days", type: "days", hint: "Leave all off for every day." },
  t("note", "Note"),
];

export const peptideSections: FormSection[] = [
  {
    title: "Basics",
    open: true,
    fields: [
      t("name", "Name"),
      t("id", "Id", { hint: "Lower-case letters, numbers and dashes, e.g. bpc-157. Can't be changed later.", lockedWhenEditing: true }),
      t("category", "Category", { hint: "e.g. Copper peptide" }),
      long("description", "Description"),
      lines("goals", "Goals", "One per line, e.g. Healing, Fat Loss"),
    ],
  },
  {
    title: "Dosing",
    fields: [
      t("standardDose", "Standard dose"),
      t("standardRoute", "Route", { hint: "e.g. SubQ, IM, Nasal" }),
      t("frequencyLabel", "Frequency label", { hint: "e.g. 3x/wk" }),
      t("cycle", "Cycle", { hint: "e.g. 4 wk on / 2 wk off" }),
      { key: "dosingSchedule", label: "Default schedule", type: "group", fields: scheduleFields },
      lines("injectionSites", "Injection sites"),
      {
        key: "goalDoseOptions",
        label: "Dosing options by goal",
        type: "list",
        itemLabel: "Option",
        titleKey: "label",
        hint: "What people can pick in the Protocol Builder.",
        fields: [
          t("id", "Id", { hint: "Any short unique name, e.g. healing-standard" }),
          t("label", "Label"),
          t("parentGoal", "Goal"),
          t("doseText", "Dose"),
          t("route", "Route"),
          t("frequencyText", "Frequency"),
          {
            key: "source",
            label: "Source",
            type: "select",
            options: [
              { value: "pep-pedia", label: "Pep-Pedia" },
              { value: "peptidedosages", label: "Peptide Dosages" },
              { value: "peptide-db", label: "Peptide DB" },
            ],
          },
          { key: "timelineSchedule", label: "Calendar schedule", type: "group", optional: true, fields: scheduleFields },
        ],
      },
    ],
  },
  {
    title: "Timing",
    fields: [t("halfLife", "Half-life"), t("peakTime", "Peak time"), t("bestTime", "Best time to take"), long("bestTimeDetails", "Best time details")],
  },
  {
    title: "What to expect",
    fields: [
      {
        key: "expectations",
        label: "Timeline",
        type: "list",
        itemLabel: "Period",
        titleKey: "week",
        fields: [t("week", "When", { hint: "e.g. Week 1" }), long("text", "What happens")],
      },
    ],
  },
  {
    title: "Safety",
    fields: [
      {
        key: "safetyProfile",
        label: "Safety",
        type: "group",
        fields: [lines("common", "Common side effects"), lines("stopAndSeekCare", "Stop and seek care if"), lines("doNotUseIf", "Don't use if")],
      },
    ],
  },
];

// Dosing notes shown in My Stack for each source, saved as their own records under the peptide's id.
export const peptideDbMetaFields: FieldSpec[] = [
  t("molecularType", "Molecular type"),
  t("typicalDose", "Typical dose"),
  t("frequency", "Frequency"),
  t("cycleDuration", "Cycle length"),
  t("storage", "Storage"),
];
export const peptideDosagesMetaFields: FieldSpec[] = [t("reconstitution", "Reconstitution"), t("cycle", "Cycle")];

// ---- Interaction between two Protocol Builder peptides (PeptideInteraction) ----

export function interactionSections(peptideOptions: { value: string; label: string }[]): FormSection[] {
  return [
    {
      title: "Interaction",
      open: true,
      fields: [
        { key: "peptideA", label: "Peptide", type: "select", options: [{ value: "", label: "Choose…" }, ...peptideOptions], lockedWhenEditing: true },
        { key: "peptideB", label: "With", type: "select", options: [{ value: "", label: "Choose…" }, ...peptideOptions], lockedWhenEditing: true },
        { key: "type", label: "Type", type: "select", options: opts(["Synergy", "Compatible", "Caution"]) },
        long("description", "Description"),
      ],
    },
  ];
}
