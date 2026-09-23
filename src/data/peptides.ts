/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PeptideProtocolInfo, PeptideInteraction } from "../types";
import { PEPTIDEDOSAGES_GOAL_OPTIONS } from "./peptideDosagesSource";
import { PEPTIDEDB_GOAL_OPTIONS } from "./peptideDbSource";
import { PEPTIDEDB_BASE_PEPTIDES } from "./peptideDb";
import { parseDoseParts, parseFrequency, getDaysForFrequency } from "../lib/doseParsing";

type GoalDoseOption = NonNullable<PeptideProtocolInfo["goalDoseOptions"]>[number];

const RAW_PEPTIDES_DATABASE: PeptideProtocolInfo[] = [
  {
    id: "retatrutide",
    name: "Retatrutide",
    category: "Triple GLP-1/GIP/Glucagon agonist • SubQ",
    description: "Next-generation triple agonist offering unprecedented weight management and metabolic health optimization.",
    goals: ["Fat loss / Metabolic"],
    halfLife: "~6 days",
    peakTime: "24-72 h",
    bestTime: "Same day & hour each week",
    bestTimeDetails: "Steady state after ~4 weeks. Best taken in the morning or early afternoon.",
    standardDose: "Titrate 0.5 → 12 mg weekly",
    goalDoseOptions: [
      {
        id: "retatrutide-conservative-start",
        label: "Conservative Starting Dose (Week 1-4)",
        parentGoal: "Fat loss / Metabolic",
        doseText: "0.5 mg weekly",
        route: "SubQ",
        frequencyText: "Once weekly",
        timelineSchedule: {
          amount: "0.5",
          unit: "mg",
          frequency: "weekly",
          days: ["MON"],
          note: "Conservative start protocol aligned with pep-pedia guidance."
        }
      },
      {
        id: "retatrutide-low-maintenance",
        label: "Low Maintenance Dose (Week 4-8)",
        parentGoal: "Fat loss / Metabolic",
        doseText: "1 mg weekly",
        route: "SubQ",
        frequencyText: "Once weekly",
        timelineSchedule: {
          amount: "1",
          unit: "mg",
          frequency: "weekly",
          days: ["MON"],
          note: "Low-maintenance step from pep-pedia titration table."
        }
      },
      {
        id: "retatrutide-standard-escalation",
        label: "Standard Escalation (Week 8-12)",
        parentGoal: "Fat loss / Metabolic",
        doseText: "2 mg weekly",
        route: "SubQ",
        frequencyText: "Once weekly",
        timelineSchedule: {
          amount: "2",
          unit: "mg",
          frequency: "weekly",
          days: ["MON"],
          note: "Standard escalation stage from pep-pedia guidance."
        }
      },
      {
        id: "retatrutide-moderate-weight-loss",
        label: "Moderate Weight Loss (Week 12-16)",
        parentGoal: "Fat loss / Metabolic",
        doseText: "4 mg weekly",
        route: "SubQ",
        frequencyText: "Once weekly",
        timelineSchedule: {
          amount: "4",
          unit: "mg",
          frequency: "weekly",
          days: ["MON"],
          note: "Moderate weight-loss dose stage from pep-pedia table."
        }
      },
      {
        id: "retatrutide-advanced-weight-loss",
        label: "Advanced Weight Loss (Week 16-20)",
        parentGoal: "Fat loss / Metabolic",
        doseText: "8 mg weekly",
        route: "SubQ",
        frequencyText: "Once weekly",
        timelineSchedule: {
          amount: "8",
          unit: "mg",
          frequency: "weekly",
          days: ["MON"],
          note: "Advanced weight-loss stage from pep-pedia protocol."
        }
      },
      {
        id: "retatrutide-maximum-efficacy",
        label: "Maximum Efficacy (Week 20+)",
        parentGoal: "Fat loss / Metabolic",
        doseText: "12 mg weekly",
        route: "SubQ",
        frequencyText: "Once weekly",
        timelineSchedule: {
          amount: "12",
          unit: "mg",
          frequency: "weekly",
          days: ["MON"],
          note: "Maximum efficacy stage from pep-pedia protocol."
        }
      },
      {
        id: "retatrutide-t2d-conservative",
        label: "Type 2 Diabetes - Conservative Start",
        parentGoal: "Fat loss / Metabolic",
        doseText: "0.5-1 mg weekly",
        route: "SubQ",
        frequencyText: "Once weekly",
        timelineSchedule: {
          amount: "0.5-1",
          unit: "mg",
          frequency: "weekly",
          days: ["MON"],
          note: "Type 2 diabetes conservative start guidance from pep-pedia."
        }
      },
      {
        id: "retatrutide-t2d-maintenance",
        label: "Type 2 Diabetes - Maintenance",
        parentGoal: "Fat loss / Metabolic",
        doseText: "4-8 mg weekly",
        route: "SubQ",
        frequencyText: "Once weekly",
        timelineSchedule: {
          amount: "4-8",
          unit: "mg",
          frequency: "weekly",
          days: ["MON"],
          note: "Type 2 diabetes maintenance guidance from pep-pedia."
        }
      },
      {
        id: "retatrutide-clinical-trial",
        label: "Clinical Trial Protocol (Obesity Study)",
        parentGoal: "Fat loss / Metabolic",
        doseText: "1-2 mg weekly start",
        route: "SubQ",
        frequencyText: "Once weekly",
        timelineSchedule: {
          amount: "1-2",
          unit: "mg",
          frequency: "weekly",
          days: ["MON"],
          note: "Clinical trial-style start range from pep-pedia reference table."
        }
      }
    ],
    standardRoute: "SubQ",
    frequencyLabel: "1x / week",
    dosingSchedule: {
      amount: "0.5",
      unit: "mg",
      frequency: "weekly",
      days: ["MON"],
      note: "Titration start. Watch for GI effects (nausea ~13–43%, dose-dependent)."
    },
    cycle: "Steady state titration",
    injectionSites: ["ABDOMEN (2-IN FROM NAVEL)", "OUTER THIGH", "LOVE HANDLE / FLANK", "BACK OF UPPER ARM"],
    expectations: [
      { week: "WK 1", text: "Reduced appetite & earlier satiety" },
      { week: "WK 2", text: "Mild nausea / GI changes — usually peaks during titration" },
      { week: "WK 4", text: "Measurable weight loss begins (~1–2% body weight)" },
      { week: "WK 12", text: "Significant weight loss (~8–12% at therapeutic dose)" },
      { week: "WK 24", text: "Plateau approaches; expect 15–24% loss at full dose" }
    ],
    safetyProfile: {
      common: [
        "Nausea (13–43%, dose-dependent)",
        "Diarrhea / constipation",
        "Injection site reaction",
        "Fatigue"
      ],
      stopAndSeekCare: [
        "Severe abdominal pain (pancreatitis risk)",
        "Persistent vomiting / dehydration",
        "Vision changes",
        "Gallbladder pain"
      ],
      doNotUseIf: [
        "Personal/family history of medullary thyroid carcinoma",
        "MEN-2 syndrome",
        "Pregnancy / breastfeeding",
        "Active pancreatitis"
      ]
    }
  },
  {
    id: "mots-c",
    name: "MOTS-c",
    category: "Mitochondrial-derived peptide • SubQ",
    description: "Promotes metabolic homeostasis, exercise endurance, cell longevity, and robust insulin sensitivity.",
    goals: ["Longevity / Anti-aging", "Fat loss / Metabolic"],
    halfLife: "~3 h",
    peakTime: "30-60 min",
    bestTime: "Morning, pre-exercise",
    bestTimeDetails: "Best administered subcutaneously 30-45 minutes before metabolic demand or training.",
    standardDose: "10 mg SubQ 3x/week",
    goalDoseOptions: [
      {
        id: "mots-c-metabolic-health",
        label: "Metabolic health",
        parentGoal: "Fat loss / Metabolic",
        doseText: "5-10 mg",
        route: "SubQ",
        frequencyText: "Once daily",
        timelineSchedule: {
          amount: "5-10",
          unit: "mg",
          frequency: "daily",
          days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
          note: "Metabolic health range from pep-pedia guidance."
        }
      },
      {
        id: "mots-c-anti-aging-protocol",
        label: "Anti-aging protocol",
        parentGoal: "Longevity / Anti-aging",
        doseText: "15 mg",
        route: "SubQ",
        frequencyText: "3x weekly",
        timelineSchedule: {
          amount: "15",
          unit: "mg",
          frequency: "3x/week",
          days: ["MON", "WED", "FRI"],
          note: "Anti-aging protocol option from pep-pedia guidance."
        }
      },
      {
        id: "mots-c-exercise-performance",
        label: "Exercise performance",
        parentGoal: "Fat loss / Metabolic",
        doseText: "10-15 mg",
        route: "SubQ",
        frequencyText: "Pre-workout",
        timelineSchedule: {
          amount: "10-15",
          unit: "mg",
          frequency: "3x/week",
          days: ["MON", "WED", "FRI"],
          note: "Exercise performance range from pep-pedia guidance (pre-workout timing)."
        }
      },
      {
        id: "mots-c-conservative-start",
        label: "Conservative start",
        parentGoal: "Fat loss / Metabolic",
        doseText: "5 mg",
        route: "SubQ",
        frequencyText: "Once daily",
        timelineSchedule: {
          amount: "5",
          unit: "mg",
          frequency: "daily",
          days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
          note: "Conservative start option from pep-pedia guidance."
        }
      },
      {
        id: "mots-c-low-dose-stack",
        label: "Low-dose stack protocol",
        parentGoal: "Fat loss / Metabolic",
        doseText: "1 mg",
        route: "SubQ (abdomen)",
        frequencyText: "3x weekly",
        timelineSchedule: {
          amount: "1",
          unit: "mg",
          frequency: "3x/week",
          days: ["MON", "WED", "FRI"],
          note: "Low-dose stack protocol from pep-pedia guidance."
        }
      }
    ],
    standardRoute: "SubQ",
    frequencyLabel: "3x / week",
    dosingSchedule: {
      amount: "10",
      unit: "mg",
      frequency: "3x/week",
      days: ["MON", "WED", "FRI"],
      note: "Pep-pedia cycle: 4 wk on / 2 wk off."
    },
    cycle: "4 wk on / 2 wk off",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Increased aerobic capacity and physical energy" },
      { week: "WK 2", text: "Enhanced glucose utilization and morning alertness" },
      { week: "WK 4", text: "Improved lean muscle mass retention and overall metabolic efficiency" }
    ],
    safetyProfile: {
      common: ["Mild redness at injection site", "Slight body temperature increase", "Transient mild headache"],
      stopAndSeekCare: ["Extreme hypoglycemia if combined with other insulin sensitizers without adjustment"],
      doNotUseIf: ["Active severe hypoglycemia", "Pregnancy"]
    }
  },
  {
    id: "glow",
    name: "GLOW",
    category: "Copper & Healing Peptide Complex • SubQ",
    description: "Highly synergistic custom blend of BPC-157, GHK-Cu, and TB-500 designed for profound tissue repair, hair thickness, and skin collagen density.",
    goals: ["Longevity / Anti-aging", "Healing / Recovery"],
    halfLife: "Consult source",
    peakTime: "Variable",
    bestTime: "SubQ daily",
    bestTimeDetails: "Inject once daily. Evening injection is preferred for overnight cellular recovery.",
    standardDose: "1 mg SubQ daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "1",
      unit: "mg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Pep-pedia cycle: 6 wk on / 2 wk off."
    },
    cycle: "6 wk on / 2 wk off",
    injectionSites: ["ABDOMEN", "OUTER THIGH", "NEAR REGION OF INJURY (if local healing)"],
    expectations: [
      { week: "WK 1", text: "Slightly improved joint comfort, skin hydration" },
      { week: "WK 3", text: "Accelerated healing of minor strains, reduced skin redness" },
      { week: "WK 6", text: "Visible improvements in skin elasticity, fine lines, and hair thickness" }
    ],
    safetyProfile: {
      common: ["Mild local stinging (mainly from GHK-Cu component)", "Temporary flushing"],
      stopAndSeekCare: ["High fever or local infection if aseptic technique fails"],
      doNotUseIf: ["Active malignancies (due to high blood-vessel forming properties of GHK-Cu/BPC)"]
    }
  },
  {
    id: "semax",
    name: "Semax",
    category: "Nootropic peptide • Nasal",
    description: "An immunomodulatory, neuroprotective, and neurogenic heptapeptide that increases BDNF levels rapidly.",
    goals: ["Cognitive / Neuro"],
    halfLife: "~30 min intranasal, but downstream BDNF persists 24+ h",
    peakTime: "15-30 min",
    bestTime: "AM + early afternoon",
    bestTimeDetails: "Avoid late evening use to ensure normal sleep architecture.",
    standardDose: "600 mcg (split AM/PM) Nasal, 2x daily",
    standardRoute: "Nasal",
    frequencyLabel: "2x / daily",
    dosingSchedule: {
      amount: "600",
      unit: "mcg",
      frequency: "2x/daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Pep-pedia cycle: 2 wk on / 1 wk off."
    },
    cycle: "2 wk on / 1 wk off",
    injectionSites: ["INTRANASAL SPRAY"],
    expectations: [
      { week: "WK 1", text: "Enhanced verbal fluency, sharp mental clarity, and focus" },
      { week: "WK 2", text: "Improved long-term memory retrieval and general stress resilience" }
    ],
    safetyProfile: {
      common: ["Mild nasal dryness", "Brief irritation", "Slightly increased heart rate"],
      stopAndSeekCare: ["Severe anxiety or panic attacks (rare)"],
      doNotUseIf: ["History of severe psychiatric disorders", "Active nasal bleeding"]
    }
  },
  {
    id: "nad-plus",
    name: "NAD+",
    category: "Cellular coenzyme • IM/SubQ/IV",
    description: "Essential coenzyme that powers cellular ATP production, sirtuin activation, and rapid DNA repair.",
    goals: ["Longevity / Anti-aging", "Cognitive / Neuro"],
    halfLife: "Minutes (rapid clearance)",
    peakTime: "End of infusion / 30 min IM",
    bestTime: "Morning",
    bestTimeDetails: "Slow push required to mitigate transient chest tightness or nausea.",
    standardDose: "250 mg IM 2x/wk",
    standardRoute: "IM",
    frequencyLabel: "2x / week",
    dosingSchedule: {
      amount: "250",
      unit: "mg",
      frequency: "2x/week",
      days: ["MON", "THU"],
      note: "Morning injection, slow push."
    },
    cycle: "4 wk on / 2 wk off",
    injectionSites: ["VENTROGLUTEAL (IM)", "DELTOID (IM)", "ABDOMEN (SubQ)"],
    expectations: [
      { week: "WK 1", text: "Profound increase in clean mental energy, reduced brain fog" },
      { week: "WK 2", text: "Reduced evening fatigue, better cellular recovery" },
      { week: "WK 4", text: "Enhanced exercise capacity, general systemic rejuvenation" }
    ],
    safetyProfile: {
      common: ["Transient chest heavy sensation during/after inject", "Mild nausea", "Flushing"],
      stopAndSeekCare: ["Severe allergic reactions or localized deep abscess"],
      doNotUseIf: ["Active chemotherapy", "Severe kidney disease"]
    }
  },
  {
    id: "tirzepatide",
    name: "Tirzepatide",
    category: "Dual GLP-1/GIP receptor agonist • SubQ",
    description: "Unmatched dual-agonist protocol regulating satiety, slowing digestion, and facilitating heavy lipolysis.",
    goals: ["Fat loss / Metabolic"],
    halfLife: "~5 days",
    peakTime: "8-24 h",
    bestTime: "Same day weekly",
    bestTimeDetails: "Take any time of day, with or without food. Select a consistent day.",
    standardDose: "Titrate 2.5 → 15 mg weekly",
    standardRoute: "SubQ",
    frequencyLabel: "1x / week",
    dosingSchedule: {
      amount: "2.5",
      unit: "mg",
      frequency: "weekly",
      days: ["MON"],
      note: "Standard 2.5mg start for 4 weeks before increasing to 5.0mg."
    },
    cycle: "Titration schedule",
    injectionSites: ["ABDOMEN", "OUTER THIGH", "UPPER ARM"],
    expectations: [
      { week: "WK 1", text: "Strong satiety, silent food-noise, delayed stomach emptying" },
      { week: "WK 4", text: "Initial fat mass decrease, major reduction in sweets cravings" },
      { week: "WK 12", text: "Profound systemic fat loss, highly optimized fasting insulin levels" }
    ],
    safetyProfile: {
      common: ["Mild nausea", "Constipation or mild diarrhea", "Burping", "Local skin redness"],
      stopAndSeekCare: ["Acute persistent abdominal pain radiating to back (pancreatitis)"],
      doNotUseIf: ["Thyroid C-cell tumor history", "MEN-2 syndrome", "Pregnancy"]
    }
  },
  {
    id: "semaglutide",
    name: "Semaglutide",
    category: "GLP-1 receptor agonist • SubQ",
    description: "Gold standard GLP-1 receptor agonist promoting consistent weight management, caloric restriction, and glucose regulation.",
    goals: ["Fat loss / Metabolic"],
    halfLife: "~7 days",
    peakTime: "12-24 h",
    bestTime: "Same day weekly",
    bestTimeDetails: "Usually taken once per week. Night injection can help sleep through early nausea.",
    standardDose: "Titrate 0.25 → 2.4 mg weekly",
    standardRoute: "SubQ",
    frequencyLabel: "1x / week",
    dosingSchedule: {
      amount: "0.25",
      unit: "mg",
      frequency: "weekly",
      days: ["SUN"],
      note: "Start at 0.25mg/wk for 4 weeks. Escalate slowly to avoid GI distress."
    },
    cycle: "Titration schedule",
    injectionSites: ["ABDOMEN", "OUTER THIGH", "UPPER ARM"],
    expectations: [
      { week: "WK 1", text: "Appetite suppression, feeling full on very small portions" },
      { week: "WK 4", text: "Consistent body weight loss of 0.5 - 1.5kg/week" },
      { week: "WK 12", text: "Aesthetic changes in face and waistline, stable lipid panel" }
    ],
    safetyProfile: {
      common: ["Nausea", "Acid reflux", "Headache", "Fatigue"],
      stopAndSeekCare: ["Pancreatitis symptoms", "Severe dehydration from vomiting"],
      doNotUseIf: ["MTC thyroid cancer risk", "Severe gastrointestinal motility disorders", "Pregnancy"]
    }
  },
  {
    id: "bpc-157",
    name: "BPC-157",
    category: "Gastric Pentadecapeptide • SubQ",
    description: "Highly stable systemic healer that triggers intense angiogenesis, growth factor activation, and rapid tendon-to-bone repair.",
    goals: ["Healing / Recovery", "Longevity / Anti-aging"],
    halfLife: "4-6 hours",
    peakTime: "1 hour",
    bestTime: "Morning or Night SubQ",
    bestTimeDetails: "Inject near injury site for localized synergy, though systemic SubQ works beautifully.",
    standardDose: "250-500 mcg daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "250",
      unit: "mcg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Typical cycle is 4-8 weeks on, 2 weeks off."
    },
    cycle: "4-8 weeks on / 2 weeks off",
    injectionSites: ["ABDOMEN", "NEAR LOCAL REGION OF INJURED JOINT/TENDON"],
    expectations: [
      { week: "WK 1", text: "Notable decrease in gut irritation, starting tendon pain reduction" },
      { week: "WK 3", text: "Substantial tissue healing, increased joint flexibility" },
      { week: "WK 6", text: "Resolution of chronic low-grade ligament pain, gastric recovery" }
    ],
    safetyProfile: {
      common: ["Transient mild tiredness", "Slight dizziness immediately after injecting"],
      stopAndSeekCare: ["Extreme local swelling or sign of localized infection"],
      doNotUseIf: ["Known active cancer tumors (due to blood vessel growth stimulation)"]
    }
  },
  {
    id: "tb-500",
    name: "TB-500",
    category: "Thymosin Beta-4 synthetic peptide • SubQ",
    description: "Potent cellular migrator and wound healer. Excellent for systemic healing, soft tissue injury, and hair follicle activation.",
    goals: ["Healing / Recovery"],
    halfLife: "7-10 days",
    peakTime: "12 hours",
    bestTime: "Twice weekly",
    bestTimeDetails: "Usually split into 2-3 weekly SubQ injections for stable levels.",
    standardDose: "2.5-5.0 mg SubQ 2x/wk",
    standardRoute: "SubQ",
    frequencyLabel: "2x / week",
    dosingSchedule: {
      amount: "2.5",
      unit: "mg",
      frequency: "2x/week",
      days: ["TUE", "FRI"],
      note: "Inject twice a week. Highly synergistic when combined with BPC-157."
    },
    cycle: "6 weeks on / 4 weeks off",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Reduced acute muscle inflammation and systemic soreness" },
      { week: "WK 3", text: "Significant restoration of injured range of motion" },
      { week: "WK 6", text: "Substantial collagen rebuilding, speedier athletic recovery times" }
    ],
    safetyProfile: {
      common: ["Transient head rush", "Temporary lethargy"],
      stopAndSeekCare: ["Severe local skin hives"],
      doNotUseIf: ["History of uncontrolled cell proliferation, Pregnancy"]
    }
  },
  {
    id: "ghk-cu",
    name: "GHK-Cu",
    category: "Copper Peptide • SubQ",
    description: "Profound copper-complexed tripeptide that activates stem cells, remodels collagen, tightens skin, and stimulates thick hair growth.",
    goals: ["Longevity / Anti-aging", "Healing / Recovery"],
    halfLife: "1-2 hours",
    peakTime: "30 mins",
    bestTime: "Night SubQ",
    bestTimeDetails: "Inject once daily. Often causes a strong sting; dilute with extra bacteriostatic water or add a tiny amount of BPC-157 to mitigate stinging.",
    standardDose: "1-2 mg daily SubQ",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "2",
      unit: "mg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Inject at night. Make sure to dilute sufficiently to decrease stinging."
    },
    cycle: "4-6 weeks on / 4 weeks off",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Improved skin healing speed, better complexion glow" },
      { week: "WK 3", text: "Increase in fine hair follicle activity and skin elasticity" },
      { week: "WK 6", text: "Fading of deep wrinkles, dramatic tightening of loose skin tissue" }
    ],
    safetyProfile: {
      common: ["Intense stinging at injection site (normal for copper)", "Slight local swelling"],
      stopAndSeekCare: ["High zinc depletion if used over 3 months without zinc supplementation"],
      doNotUseIf: ["Wilson's disease", "Copper toxicity disorders"]
    }
  },
  {
    id: "klow",
    name: "KLOW",
    category: "Healing & Anti-inflammatory Complex • SubQ",
    description: "An ultimate four-peptide recovery power-blend containing BPC-157, TB-500, GHK-Cu, and KPV. Designed for accelerated tissue repair, total-body anti-inflammation, neuro-regeneration, and cellular recovery.",
    goals: ["Healing / Recovery", "Longevity / Anti-aging"],
    halfLife: "Variable (1-2 hours)",
    peakTime: "30-60 mins",
    bestTime: "Night SubQ",
    bestTimeDetails: "Administer once daily, ideally in the evening to coordinate with natural circadian cellular repair.",
    standardDose: "2 mg SubQ daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "2",
      unit: "mg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Inject at night. A highly complete repair formula that includes KPV for potent anti-inflammatory effects."
    },
    cycle: "6 wk on / 2 wk off",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Marked reduction in systemic inflammation and joint ache" },
      { week: "WK 3", text: "Accelerated recovery of muscle, tendon, and skin abrasions" },
      { week: "WK 6", text: "Optimized gut barrier function, skin tone refinement, and rapid soft-tissue healing" }
    ],
    safetyProfile: {
      common: ["Mild temporary stinging at injection site (due to GHK-Cu/KPV component)", "Transient flushing"],
      stopAndSeekCare: ["Local severe skin hives, extreme dizziness"],
      doNotUseIf: ["Active malignancies", "Copper processing disorders, Pregnancy"]
    }
  },
  {
    id: "5-amino-1mq",
    name: "5-Amino-1MQ",
    category: "NNMT Inhibitor / Metabolic Enhancer • Oral",
    description: "A clinically researched small molecule Nicotinamide N-methyltransferase (NNMT) inhibitor that increases cellular energy, fuels rapid fat loss, and enhances muscle function by boosting intracellular NAD+.",
    goals: ["Fat loss / Metabolic", "Longevity / Anti-aging"],
    halfLife: "~4 hours",
    peakTime: "1-2 hours",
    bestTime: "Morning / Pre-workout",
    bestTimeDetails: "Taken orally with or without food. Best administered in the morning or early afternoon to align with metabolic activity.",
    standardDose: "50-150 mg daily Oral",
    standardRoute: "Oral",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "50",
      unit: "mg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Take orally once daily in the morning."
    },
    cycle: "8-12 wk on / 4 wk off",
    injectionSites: ["ORAL CAPSULE (NO INJECTION NEEDED)"],
    expectations: [
      { week: "WK 1", text: "Enhanced physical endurance, slight warmth/metabolic lift" },
      { week: "WK 4", text: "Noticeable fat distribution improvements, sustained clean daily energy" },
      { week: "WK 8", text: "Substantial visceral fat loss, improved body composition, and enhanced muscular recovery" }
    ],
    safetyProfile: {
      common: ["Slightly elevated body temperature", "Transient mild muscle soreness or cramps"],
      stopAndSeekCare: ["Persistent heart palpitations, extreme dehydration"],
      doNotUseIf: ["Pregnancy or breastfeeding", "Severe hepatic impairment"]
    }
  },
  {
    id: "epitalon",
    name: "Epitalon",
    category: "Telomerase Activator / Pineal Peptide • SubQ",
    description: "A synthetic pineal tetrapeptide that stimulates telomerase activity to lengthen telomeres, optimize circadian sleep patterns, and promote systemic cellular rejuvenation.",
    goals: ["Longevity / Anti-aging", "Cognitive / Neuro"],
    halfLife: "~4 hours",
    peakTime: "30-60 mins",
    bestTime: "Night SubQ",
    bestTimeDetails: "Taken subcutaneously right before bed to align with natural melatonin synthesis cycles.",
    standardDose: "5-10 mg daily for 10-20 days",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "5",
      unit: "mg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Take at bedtime. Cycle once or twice a year."
    },
    cycle: "10-20 days on / 6 months off",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Deeper, more restorative sleep cycles and refreshed waking" },
      { week: "WK 2", text: "Reduced systemic fatigue, improved skin vitality and recovery speed" },
      { week: "6 MONTHS", text: "Long-term biochemical cellular anti-aging support" }
    ],
    safetyProfile: {
      common: ["Mild drowsiness in the morning, slight injection site redness"],
      stopAndSeekCare: ["Severe localized skin infection or fever"],
      doNotUseIf: ["Pregnancy or breastfeeding", "Active hormone-sensitive cancers"]
    }
  },
  {
    id: "cjc-ipamorelin",
    name: "CJC-1295 + Ipamorelin",
    category: "Growth Hormone Secretagogue Blend • SubQ",
    description: "A powerful growth hormone secretagogue blend that stimulates the pituitary gland to secrete endogenous growth hormone, enhancing lean muscle, sleep depth, and cellular fat lipolysis.",
    goals: ["Longevity / Anti-aging", "Fat loss / Metabolic", "Healing / Recovery"],
    halfLife: "Ipamorelin ~2 hours, CJC-1295 (No DAC) ~30 mins",
    peakTime: "1-2 hours",
    bestTime: "Night, on empty stomach",
    bestTimeDetails: "Take at least 2 hours post-meal right before bed, or early morning. Avoid food for 30 mins after injection to prevent insulin from blunting growth hormone release.",
    standardDose: "250-500 mcg SubQ daily",
    standardRoute: "SubQ",
    frequencyLabel: "5 days / week",
    dosingSchedule: {
      amount: "250",
      unit: "mcg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI"],
      note: "Inject right before bed on an empty stomach. Use 5 days on, 2 days off pattern."
    },
    cycle: "12-16 wk on / 4 wk off",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Marked improvement in deep sleep (REM) and morning freshness" },
      { week: "WK 4", text: "Improved workout recovery, skin elasticity, and subtle core fat reduction" },
      { week: "WK 12", text: "Noticeable increase in lean mass, body composition improvement, and connective tissue strength" }
    ],
    safetyProfile: {
      common: ["Transient head rush or facial flushing (normal GHRH effect)", "Slight water retention", "Increased hunger"],
      stopAndSeekCare: ["Severe persistent joint pain or carpal tunnel tingling"],
      doNotUseIf: ["Active malignancies or cancer history (due to IGF-1 stimulation)", "Pregnancy"]
    }
  },
  {
    id: "bpc-tb",
    name: "BPC-157 + TB-500 Blend",
    category: "Synergistic Healing Complex • SubQ",
    description: "A highly synergistic 1:1 combination of BPC-157 and TB-500, designed for intensive structural healing. BPC-157 stimulates rapid angiogenesis and tissue repair, while TB-500 coordinates cell migration to form brand new healthy fibers.",
    goals: ["Healing / Recovery", "Longevity / Anti-aging"],
    halfLife: "BPC-157 ~4-6 h, TB-500 ~7-10 days",
    peakTime: "1-12 h",
    bestTime: "Night, SubQ once daily",
    bestTimeDetails: "Inject once daily, ideally before bed. While it acts systemically, injections can be placed near the general site of an active injury to focus the recovery effect.",
    standardDose: "1 mg SubQ daily (e.g. 500mcg BPC + 500mcg TB-500)",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "1",
      unit: "mg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Standard daily dose for a 10mg total kit (5mg + 5mg)."
    },
    cycle: "6-8 weeks on / 2 weeks off",
    injectionSites: ["ABDOMEN", "OUTER THIGH", "NEAR REGION OF INJURY"],
    expectations: [
      { week: "WK 1", text: "Decreased localized inflammation, increased baseline joint comfort, and improved gut barrier health" },
      { week: "WK 3", text: "Noticeably accelerated recovery of tendons, ligaments, or muscle strains with improved flexibility" },
      { week: "WK 6", text: "Substantial tissue remodeling and resolution of stubborn or chronic joint stiffness" }
    ],
    safetyProfile: {
      common: ["Temporary mild lethargy", "Slight post-injection lightheadedness or head rush"],
      stopAndSeekCare: ["Local severe skin hives or signs of localized deep infection"],
      doNotUseIf: ["Active malignancies or uncontrolled cellular growth (due to vascular development acceleration)", "Pregnancy"]
    }
  },
  {
    id: "hgh",
    name: "HGH 191AA (Somatropin)",
    category: "Recombinant Human Growth Hormone • SubQ",
    description: "Recombinant human growth hormone identical to endogenous pituitary-derived HGH. Promotes cellular regeneration, protein synthesis, bone density, lipolysis, and youthful body composition.",
    goals: ["Longevity / Anti-aging", "Healing / Recovery"],
    halfLife: "20-30 min (intravenous), ~2-4 h (SubQ)",
    peakTime: "3-5 h",
    bestTime: "Night before bed or upon waking",
    bestTimeDetails: "Administer subcutaneously. Mimics natural nocturnal GH spikes when taken before bed, or supports fasted fat loss when taken in the morning.",
    standardDose: "2-4 IU SubQ daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "2",
      unit: "IU",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Start low at 1-2 IU daily to evaluate tolerance before titrating up."
    },
    cycle: "3-6 months (requires slow accumulation)",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Improved sleep depth, morning alertness, and faster muscle recovery" },
      { week: "WK 4", text: "Noticeably improved skin elasticity, joint comfort, and subtle fat loss" },
      { week: "WK 12", text: "Optimized body composition, decreased visceral fat, and robust recovery kinetics" }
    ],
    safetyProfile: {
      common: ["Water retention", "Mild joint pain or stiffness", "Carpal tunnel tingling", "Slightly elevated blood glucose"],
      stopAndSeekCare: ["Severe headache, vision issues (intracranial hypertension risk)", "Severe joint swelling"],
      doNotUseIf: ["Active tumor or cancer history", "Diabetic retinopathy", "Pregnancy"]
    }
  },
  {
    id: "cagrilintide",
    name: "Cagrilintide",
    category: "Long-acting Amylin Analogue • SubQ",
    description: "A long-acting, non-selective amylin receptor agonist that works synergistically with GLP-1 agonists to induce significant appetite suppression and weight reduction.",
    goals: ["Fat loss / Metabolic"],
    halfLife: "~7-8 days",
    peakTime: "24-48 h",
    bestTime: "Same day & hour each week",
    bestTimeDetails: "Often stacked with Semaglutide or Tirzepatide. Inject once weekly at any time of day.",
    standardDose: "Titrate 0.3 → 2.4 mg weekly",
    standardRoute: "SubQ",
    frequencyLabel: "1x / week",
    dosingSchedule: {
      amount: "0.3",
      unit: "mg",
      frequency: "weekly",
      days: ["MON"],
      note: "Standard titration starts at 0.3mg weekly and scales gradually."
    },
    cycle: "Ongoing metabolic optimization",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Profound satiety and complete reduction in food cravings" },
      { week: "WK 4", text: "Accelerated weight loss especially when paired with a GLP-1 agonist" },
      { week: "WK 12", text: "Substantial metabolic shift and body recomposition" }
    ],
    safetyProfile: {
      common: ["Nausea", "Vomiting", "Delayed gastric emptying", "Mild fatigue"],
      stopAndSeekCare: ["Persistent vomiting, severe abdominal pain (risk of pancreatitis)"],
      doNotUseIf: ["History of severe gastroparesis", "Pregnancy", "Pancreatitis history"]
    }
  },
  {
    id: "tesamorelin",
    name: "Tesamorelin",
    category: "GHRH Analogue • SubQ",
    description: "A synthetic Growth Hormone Releasing Hormone (GHRH) analogue clinically proven to reduce visceral adipose tissue and optimize cognitive processing speed.",
    goals: ["Fat loss / Metabolic", "Longevity / Anti-aging"],
    halfLife: "26 min",
    peakTime: "1.5 h",
    bestTime: "Night on an empty stomach",
    bestTimeDetails: "Inject before bed, at least 2 hours after your last meal, to prevent insulin spikes from blunting growth hormone release.",
    standardDose: "1-2 mg SubQ daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "1",
      unit: "mg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI"],
      note: "Usually cycled 5 days on / 2 days off to preserve receptor sensitivity."
    },
    cycle: "8-12 weeks on / 4 weeks off",
    injectionSites: ["ABDOMEN (rotate sites carefully)"],
    expectations: [
      { week: "WK 2", text: "Increased daytime energy, improved sleep structure, and subtle water shifts" },
      { week: "WK 6", text: "Noticeable reduction in abdominal visceral fat and sharper cognitive focus" },
      { week: "WK 12", text: "Peak metabolic acceleration, lean muscle support, and systemic rejuvenation" }
    ],
    safetyProfile: {
      common: ["Injection site itching/redness", "Mild joint discomfort", "Transient fluid retention"],
      stopAndSeekCare: ["Severe systemic allergic reactions", "Severe carpal tunnel numbness"],
      doNotUseIf: ["Active malignancy", "Hypophysectomy or pituitary surgery", "Pregnancy"]
    }
  },
  {
    id: "ipamorelin",
    name: "Ipamorelin",
    category: "Selective GH Secretagogue • SubQ",
    description: "One of the safest, most selective growth hormone secretagogues (GHS). Stimulates pituitary GH release without raising cortisol, prolactin, or aldosterone, protecting baseline sleep architecture.",
    goals: ["Longevity / Anti-aging", "Healing / Recovery"],
    halfLife: "2 h",
    peakTime: "30-60 min",
    bestTime: "Night before bed or morning pre-workout",
    bestTimeDetails: "Must be taken on an empty stomach (at least 2 hours post-meal, and 30 mins before eating) to ensure optimal growth hormone pulse amplitude.",
    standardDose: "200-300 mcg SubQ daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "200",
      unit: "mcg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Inject once daily, ideally at night before bed, or twice daily for enhanced repair kinetics."
    },
    cycle: "12-16 weeks on / 4 weeks off",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Sustained improvement in deep slow-wave sleep and cellular repair" },
      { week: "WK 4", text: "Enhanced recovery from intensive exercise and improved skin radiance" },
      { week: "WK 12", text: "Steady gains in lean physical mass, reduced body fat, and joint restoration" }
    ],
    safetyProfile: {
      common: ["Mild flushing", "Slight temporary head rush", "Temporary injection site tingling"],
      stopAndSeekCare: ["Persistent numbness or severe water retention"],
      doNotUseIf: ["Active cancers", "Pregnancy", "Severe uncontrolled hyperglycemia"]
    }
  },
  {
    id: "cjc-1295-no-dac",
    name: "CJC-1295 (No DAC)",
    category: "GHRH Analogue • SubQ",
    description: "A fast-acting synthetic Growth Hormone Releasing Hormone (GHRH) analogue. Safely mimics natural growth hormone pulses when paired with a GH secretagogue (like Ipamorelin).",
    goals: ["Longevity / Anti-aging", "Healing / Recovery"],
    halfLife: "30 min",
    peakTime: "15-30 min",
    bestTime: "Night before bed or morning pre-workout",
    bestTimeDetails: "Administer subcutaneously on a completely empty stomach. Frequently blended with Ipamorelin for optimal synergistic action.",
    standardDose: "100 mcg SubQ daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "100",
      unit: "mcg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Take concurrently with Ipamorelin (e.g. 100mcg ModGRF + 200mcg Ipamorelin)."
    },
    cycle: "12-16 weeks on / 4 weeks off",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Noticeable deep sleep enhancement and decreased recovery soreness" },
      { week: "WK 4", text: "Accelerated healing of soft tissues, skin elasticity boost, and subtle fat reduction" },
      { week: "WK 12", text: "Consolidated muscular repair, joint optimization, and comprehensive rejuvenation" }
    ],
    safetyProfile: {
      common: ["Transient post-injection facial flushing", "Mild temporary head rush", "Local irritation"],
      stopAndSeekCare: ["Severe persistent extremity swelling or severe joint aches"],
      doNotUseIf: ["Known malignancies", "Pregnancy", "Pituitary disorders"]
    }
  },
  {
    id: "cjc-1295-dac",
    name: "CJC-1295 (With DAC)",
    category: "Long-acting GHRH Analogue • SubQ",
    description: "An extended-release GHRH analogue featuring Drug Affinity Complex (DAC). Provides constant, elevated basal growth hormone release for sustained tissue reconstruction and muscle development.",
    goals: ["Healing / Recovery", "Longevity / Anti-aging"],
    halfLife: "6-8 days",
    peakTime: "24-48 h",
    bestTime: "Any time, weekly",
    bestTimeDetails: "Maintains highly elevated baseline GH levels throughout the week, meaning timing during the day is not critical.",
    standardDose: "1-2 mg SubQ weekly",
    standardRoute: "SubQ",
    frequencyLabel: "1x / week",
    dosingSchedule: {
      amount: "2",
      unit: "mg",
      frequency: "weekly",
      days: ["MON"],
      note: "Usually split into two doses weekly (e.g. 1mg Monday, 1mg Thursday) for stable release."
    },
    cycle: "8-12 weeks on / 4 weeks off",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Water weight accumulation and initial sleep consolidation" },
      { week: "WK 4", text: "Marked improvements in muscle recovery speed and full joint comfort" },
      { week: "WK 8", text: "Accelerated lean mass support and pronounced systemic repair" }
    ],
    safetyProfile: {
      common: ["Fluid retention (edema)", "Temporary joint aches", "Carpal tunnel tingling", "Elevated resting heart rate"],
      stopAndSeekCare: ["Persistent numbness, severe heart palpitations, or significant edema"],
      doNotUseIf: ["Active severe cancer", "Type 1 diabetes", "Pregnancy"]
    }
  },
  {
    id: "hcg",
    name: "HCG",
    category: "Gonadotropin Receptor Agonist • SubQ",
    description: "An LH-mimetic peptide that preserves natural testicular function, supports endogenous testosterone production, and prevents gonadal atrophy during TRT cycles.",
    goals: ["Longevity / Anti-aging", "Fat loss / Metabolic"],
    halfLife: "24-36 h",
    peakTime: "12-24 h",
    bestTime: "Morning or afternoon",
    bestTimeDetails: "Inject subcutaneously. Often administered 2-3 times per week to maintain stable hormone balances.",
    standardDose: "250-500 IU SubQ 2-3x/week",
    standardRoute: "SubQ",
    frequencyLabel: "3x / week",
    dosingSchedule: {
      amount: "250",
      unit: "IU",
      frequency: "3x/week",
      days: ["MON", "WED", "FRI"],
      note: "Commonly used in tandem with testosterone replacement therapy (TRT)."
    },
    cycle: "Sustained clinical administration",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Restored testicular fullness and stabilization of mood/libido" },
      { week: "WK 4", text: "Optimized spermatogenesis and preserved intrinsic hormonal synthesis" }
    ],
    safetyProfile: {
      common: ["Mild acne", "Slight estrogen elevation (water retention or breast tenderness)", "Irritability"],
      stopAndSeekCare: ["Sudden severe pelvic pain, extreme shortness of breath"],
      doNotUseIf: ["Prostate cancer or other hormone-sensitive tumors", "Severe kidney disease", "Pregnancy"]
    }
  },
  {
    id: "ss-31",
    name: "SS-31",
    category: "Mitochondrial Bioenergetic • SubQ",
    description: "A cardiolipin-targeting peptide that repairs the inner mitochondrial membrane, optimizing ATP synthesis and rapidly reducing cellular oxidative stress in aging tissues.",
    goals: ["Longevity / Anti-aging", "Healing / Recovery"],
    halfLife: "2-4 h",
    peakTime: "30-60 min",
    bestTime: "Morning or pre-exercise",
    bestTimeDetails: "Inject subcutaneously. Maximizes cellular cellular respiration during peak daylight hours.",
    standardDose: "10-20 mg SubQ daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "10",
      unit: "mg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Standard daily therapy for mitochondrial rejuvenation."
    },
    cycle: "4-6 weeks on / 4 weeks off",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Significant decrease in systemic physical fatigue and elevated cellular energy" },
      { week: "WK 3", text: "Improved endurance capacity and faster muscle recovery from exercise" },
      { week: "WK 6", text: "Pronounced reduction in markers of tissue oxidative stress" }
    ],
    safetyProfile: {
      common: ["Mild headache", "Injection site discomfort or redness", "Transient lightheadedness"],
      stopAndSeekCare: ["Extreme dizziness or allergic reaction"],
      doNotUseIf: ["Severe chronic kidney disease", "Pregnancy"]
    }
  },
  {
    id: "kpv",
    name: "KPV",
    category: "Anti-inflammatory Peptide • SubQ/Oral",
    description: "An extremely potent anti-inflammatory tripeptide derived from alpha-MSH. Highly effective at calming chronic autoimmune flares, healing IBS/IBD, and soothing skin dermatoses.",
    goals: ["Healing / Recovery", "Longevity / Anti-aging"],
    halfLife: "30 min",
    peakTime: "1 h",
    bestTime: "Morning or evening on an empty stomach",
    bestTimeDetails: "Can be administered subcutaneously or orally. Best taken consistently at the same times each day.",
    standardDose: "200-500 mcg SubQ daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "200",
      unit: "mcg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Can be titrated up to 500mcg daily for severe intestinal flares."
    },
    cycle: "4-8 weeks or during active inflammatory flares",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Alleviation of gut bloating, gas, and digestive inflammation" },
      { week: "WK 3", text: "Pronounced clearance of skin rashes, hives, or eczema flare-ups" },
      { week: "WK 6", text: "Systemic suppression of autoimmune joint aches and chronic inflammation" }
    ],
    safetyProfile: {
      common: ["Transient injection site stinging", "Mild nausea if taken orally"],
      stopAndSeekCare: ["Signs of localized deep tissue infection"],
      doNotUseIf: ["Severe active systemic infections", "Pregnancy"]
    }
  },
  {
    id: "pt-141",
    name: "PT-141",
    category: "Melanocortin Agonist • SubQ",
    description: "A central nervous system-acting melanocortin agonist that directly targets sexual dysfunction and boosts libido in both men and women by reinforcing neural pathway dopamine release.",
    goals: ["Longevity / Anti-aging"],
    halfLife: "2.7 h",
    peakTime: "1.5 - 4 h",
    bestTime: "On-demand, 2-6 hours prior to anticipated need",
    bestTimeDetails: "Inject subcutaneously. Its potent libido-enhancing effect has a delayed onset of 2-6 hours, so plan dosing accordingly.",
    standardDose: "1-2 mg SubQ on-demand",
    standardRoute: "SubQ",
    frequencyLabel: "on-demand",
    dosingSchedule: {
      amount: "1.5",
      unit: "mg",
      frequency: "3x/week",
      days: ["MON", "WED", "FRI"],
      note: "Limit use to no more than 3 times per week to prevent receptor desensitization."
    },
    cycle: "On-demand administration",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Pronounced restoration of sexual desire and hard erectile responses within hours of dosing" }
    ],
    safetyProfile: {
      common: ["Nausea (mild to moderate, transient)", "Facial flushing", "Mild headache", "Temporary blood pressure elevation"],
      stopAndSeekCare: ["Severe persistent vomiting", "Erectile responses lasting longer than 4 hours (priapism)"],
      doNotUseIf: ["Uncontrolled high blood pressure", "Cardiovascular disease", "Pregnancy"]
    }
  },
  {
    id: "melanotan-ii",
    name: "Melanotan II",
    category: "Melanocortin Agonist • SubQ",
    description: "A synthetic analog of alpha-melanocyte-stimulating hormone (a-MSH) that stimulates melanogenesis (tanning) and increases libido. It targets melanocortin receptors to promote skin pigmentation and regulate appetite.",
    goals: ["Longevity / Anti-aging", "Fat loss / Metabolic"],
    halfLife: "1-2 h",
    peakTime: "1-3 h",
    bestTime: "Before sun exposure or before bed",
    bestTimeDetails: "Inject subcutaneously. Taking it before bed helps mitigate transient nausea. For tanning, dose shortly before safe UV exposure.",
    standardDose: "100-250 mcg SubQ daily (loading) or 250-500 mcg 2-3x/week (maintenance)",
    standardRoute: "SubQ",
    frequencyLabel: "3x/week",
    dosingSchedule: {
      amount: "250",
      unit: "mcg",
      frequency: "3x/week",
      days: ["MON", "WED", "FRI"],
      note: "Adjust dose upward slowly to avoid initial nausea. Maintain low dose for safe tanning."
    },
    cycle: "2-4 weeks (loading phase), then as-needed maintenance",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Mild increase in skin pigmentation, heightened libido, and mild appetite suppression" },
      { week: "WK 3", text: "Even, deeper skin tanning with minimal sun exposure and consistent aphrodisiac responses" }
    ],
    safetyProfile: {
      common: ["Mild nausea", "Facial flushing", "Appetite loss", "Yawning", "Darkening of existing freckles or moles"],
      stopAndSeekCare: ["Rapidly changing atypical moles", "Severe nausea or priapism"],
      doNotUseIf: ["History of melanoma", "Atypical nevus syndrome (numerous unusual moles)", "Pregnancy"]
    }
  },
  {
    id: "glutathione",
    name: "Glutathione",
    category: "Antioxidant Complex • SubQ/IM",
    description: "The body's primary endogenous antioxidant. Neutralizes dangerous free radicals, supports liver detoxification pathways, and promotes glowing skin and immune system optimization.",
    goals: ["Longevity / Anti-aging", "Healing / Recovery"],
    halfLife: "10-15 min (systemic clearance)",
    peakTime: "1-2 h",
    bestTime: "Morning or evening",
    bestTimeDetails: "Can be administered subcutaneously or intramuscularly (IM). Highly stable and clean detoxification co-factor.",
    standardDose: "200-600 mg SubQ/IM weekly",
    standardRoute: "SubQ",
    frequencyLabel: "2x / week",
    dosingSchedule: {
      amount: "200",
      unit: "mg",
      frequency: "2x/week",
      days: ["MON", "THU"],
      note: "Often divided into two weekly injections of 200mg each."
    },
    cycle: "Ongoing wellness support",
    injectionSites: ["OUTER THIGH", "DELTOID", "ABDOMEN"],
    expectations: [
      { week: "WK 1", text: "Slight surge in mental clarity, overall physical freshness, and cellular detoxification" },
      { week: "WK 4", text: "Improved skin brightness, reduced liver enzymes, and overall optimized immune health" }
    ],
    safetyProfile: {
      common: ["Mild temporary post-injection sulfur odor", "Local injection site tenderness"],
      stopAndSeekCare: ["Severe allergic bronchospasm (extremely rare)"],
      doNotUseIf: ["Asthma history (due to potential sulfite sensitivity)", "Pregnancy"]
    }
  },
  {
    id: "selank",
    name: "Selank",
    category: "Anxiolytic Neuropeptide • SubQ/Intranasal",
    description: "A highly selective synthetic anxiolytic peptide. Regulates brain neurotransmitter balance to ease anxiety, improve emotional stability, and enhance focus without causing sedation or physical dependency.",
    goals: ["Longevity / Anti-aging"],
    halfLife: "2-5 min (cleared from blood, but active in brain for hours)",
    peakTime: "15-30 min",
    bestTime: "Morning or during acute stress triggers",
    bestTimeDetails: "Often taken as an intranasal spray or subcutaneous injection. Perfect for public speaking or deep mental tasks.",
    standardDose: "250-500 mcg daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "250",
      unit: "mcg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI"],
      note: "Can be taken daily or simply on-demand when high stress or anxiety arises."
    },
    cycle: "2-4 weeks on / 2 weeks off",
    injectionSites: ["ABDOMEN", "OUTER THIGH", "INTRANASAL"],
    expectations: [
      { week: "WK 1", text: "Subtle calm, complete reduction in social anxiety, and improved work focus without brain fog" },
      { week: "WK 2", text: "Consolidated memory storage and optimal emotional composure during intensive tasks" }
    ],
    safetyProfile: {
      common: ["Mild nasal congestion (if intranasal)", "Slight temporary head rush"],
      stopAndSeekCare: ["Severe systemic allergic responses"],
      doNotUseIf: ["Pregnancy", "Severe active clinical depression"]
    }
  },
  {
    id: "igf-1-lr3",
    name: "IGF-1 LR3",
    category: "Long-acting Growth Factor • SubQ",
    description: "A highly engineered, long-acting analogue of Insulin-like Growth Factor 1. Promotes dramatic muscle hyperplasia (growth of brand new fibers) and enhances glycogen transport.",
    goals: ["Healing / Recovery"],
    halfLife: "20-30 h",
    peakTime: "2-4 h",
    bestTime: "Post-workout or morning on non-training days",
    bestTimeDetails: "Inject subcutaneously. Must be accompanied by adequate carbohydrates to prevent transient low blood sugar.",
    standardDose: "20-50 mcg SubQ daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "30",
      unit: "mcg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Ensure proper carbohydrate intake within 30 minutes of administering."
    },
    cycle: "4-6 weeks on / 4 weeks off (strict limit to avoid receptor down-regulation)",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Substantial workout pumps, improved muscular nutrient partitioning, and subtle hypoglycemia" },
      { week: "WK 4", text: "Increased physical density, accelerated lean muscle fiber accretion, and rapid recovery" }
    ],
    safetyProfile: {
      common: ["Hypoglycemia (low blood sugar)", "Temporary mild lethargy", "Slight water retention"],
      stopAndSeekCare: ["Severe hypoglycemic shock", "Persistent abdominal distension"],
      doNotUseIf: ["Any history of malignancy or family cancer history", "Diabetes", "Pregnancy"]
    }
  },
  {
    id: "dsip",
    name: "DSIP",
    category: "Sleep Modulator • SubQ",
    description: "A naturally occurring nonapeptide that stabilizes EEG sleep activity, restores disrupted circadian rhythms, and supports normal physiological sleep depth without habit-forming properties.",
    goals: ["Longevity / Anti-aging", "Healing / Recovery"],
    halfLife: "15 min (brain activity persists for hours)",
    peakTime: "1-2 h",
    bestTime: "1-2 hours before bed",
    bestTimeDetails: "Inject subcutaneously. Helps align natural melatonin and growth hormone circadian secretion arcs.",
    standardDose: "100-250 mcg SubQ daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "100",
      unit: "mcg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Perfect for mitigating chronic insomnia or reversing jet lag."
    },
    cycle: "2-4 weeks or on-demand for sleep disturbances",
    injectionSites: ["ABDOMEN", "OUTER THIGH"],
    expectations: [
      { week: "WK 1", text: "Waking up feeling remarkably rested, increased deep delta-wave sleep cycles, and reduced daytime grogginess" }
    ],
    safetyProfile: {
      common: ["Mild drowsiness", "Slight morning temperature changes", "Local redness"],
      stopAndSeekCare: ["Extreme daytime somnolence"],
      doNotUseIf: ["Pregnancy", "Narcolepsy"]
    }
  },
  {
    id: "aod-9604",
    name: "AOD-9604",
    category: "Lipolytic Peptide Fragment • SubQ/Oral",
    description: "A modified fragment of the human growth hormone C-terminus (HGH 177-191). Stimulates fat burning and blocks fat creation (lipogenesis) without impacting blood sugar levels or IGF-1.",
    goals: ["Fat loss / Metabolic"],
    halfLife: "30 min",
    peakTime: "1 h",
    bestTime: "Morning on an empty stomach",
    bestTimeDetails: "Take on a fasted stomach. Wait at least 30-45 minutes before eating or drinking calories to maximize lipolytic enzymes.",
    standardDose: "250-300 mcg SubQ daily",
    standardRoute: "SubQ",
    frequencyLabel: "daily",
    dosingSchedule: {
      amount: "250",
      unit: "mcg",
      frequency: "daily",
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      note: "Standard daily lipolytic dose."
    },
    cycle: "8-12 weeks on / 2-4 weeks off",
    injectionSites: ["ABDOMEN (near stubborn fat zones)"],
    expectations: [
      { week: "WK 1", text: "Subtle metabolic warmth, mild water weight shedding" },
      { week: "WK 4", text: "Measurable fat reduction in targeted subcutaneous fat areas" },
      { week: "WK 12", text: "Optimated waistline, decreased visceral body fat, and muscle retention support" }
    ],
    safetyProfile: {
      common: ["Mild injection site itching", "Transient mild headache", "Increased thirst"],
      stopAndSeekCare: ["Persistent rash or severe nausea"],
      doNotUseIf: ["Pregnancy", "Breastfeeding"]
    }
  }
];

const buildDefaultGoalDoseOptions = (peptide: PeptideProtocolInfo) => {
  return peptide.goals.map((goal) => {
    const goalSlug = goal
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    return {
      id: `${peptide.id}-${goalSlug}-standard`,
      label: `${goal} - Standard`,
      parentGoal: goal,
      doseText: peptide.standardDose,
      route: peptide.standardRoute,
      frequencyText: peptide.frequencyLabel,
      timelineSchedule: {
        ...peptide.dosingSchedule,
        note: `${goal} standard recommendation. ${peptide.dosingSchedule.note}`
      }
    };
  });
};

type PepPediaProtocolRow = {
  label: string;
  doseText: string;
  frequencyText: string;
  route: string;
};

const PEP_PEDIA_PROTOCOLS: Record<string, PepPediaProtocolRow[]> = {
  "retatrutide": [
    { label: "Conservative Starting Dose (Week 1-4)", doseText: "0.5 mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Low Maintenance Dose (Week 4-8)", doseText: "1 mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Standard Escalation (Week 8-12)", doseText: "2 mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Moderate Weight Loss (Week 12-16)", doseText: "4 mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Advanced Weight Loss (Week 16-20)", doseText: "8 mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Maximum Efficacy (Week 20+)", doseText: "12 mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Type 2 Diabetes - Conservative Start", doseText: "0.5-1 mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Type 2 Diabetes - Maintenance", doseText: "4-8 mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Clinical Trial Protocol (Obesity Study)", doseText: "1-2 mg weekly start", frequencyText: "Once weekly", route: "SubQ" }
  ],
  "mots-c": [
    { label: "Metabolic health", doseText: "5-10mg", frequencyText: "Once daily", route: "SubQ" },
    { label: "Anti-aging protocol", doseText: "15mg", frequencyText: "3x weekly", route: "SubQ" },
    { label: "Exercise performance", doseText: "10-15mg", frequencyText: "Pre-workout", route: "SubQ" },
    { label: "Conservative start", doseText: "5mg", frequencyText: "Once daily", route: "SubQ" },
    { label: "Low-dose stack protocol", doseText: "1mg", frequencyText: "3x weekly", route: "SubQ (abdomen)" }
  ],
  "glow": [
    { label: "Typical daily dose", doseText: "2.33 mg", frequencyText: "Once daily for 4 weeks", route: "SubQ" },
    { label: "Conservative Approach", doseText: "Calculate individual peptide amounts", frequencyText: "Based on component requirements", route: "SubQ" },
    { label: "Standard Protocol", doseText: "Per supplier guidelines", frequencyText: "As recommended", route: "SubQ" },
    { label: "Individual Peptide Alternative", doseText: "Separate peptides", frequencyText: "Optimized schedules", route: "Multiple injections" }
  ],
  "semax": [
    { label: "Cognitive enhancement (healthy adults)", doseText: "300-600mcg", frequencyText: "1-2 times daily", route: "Nasal spray/drops" },
    { label: "Learning and memory support", doseText: "600-900mcg", frequencyText: "2-3 times daily during study periods", route: "Nasal spray/drops" },
    { label: "Recovery from brain injury", doseText: "900-1500mcg", frequencyText: "2-3 times daily", route: "Nasal drops (clinical supervision)" },
    { label: "Anti-fatigue cognitive support", doseText: "400-800mcg", frequencyText: "Single morning dose", route: "Nasal spray" },
    { label: "Research/experimental protocols", doseText: "250-1000mcg", frequencyText: "Variable based on study design", route: "Standardized Nasal delivery" }
  ],
  "nad-plus": [
    { label: "General Wellness & Energy", doseText: "100-250mg", frequencyText: "1-2x weekly", route: "IV or IM" },
    { label: "Anti-Aging Protocol", doseText: "250-500mg", frequencyText: "2-3x weekly", route: "IV infusion" },
    { label: "Cognitive Enhancement", doseText: "500-1000mg", frequencyText: "1-2x weekly", route: "IV infusion" },
    { label: "Athletic Performance", doseText: "250-500mg", frequencyText: "2x weekly", route: "IM injection" },
    { label: "Recovery & Repair", doseText: "500-1000mg", frequencyText: "3x weekly", route: "IV infusion" },
    { label: "Maintenance Therapy", doseText: "100-250mg", frequencyText: "1x weekly", route: "SubQ or IM" }
  ],
  "tirzepatide": [
    { label: "Weight loss initiation", doseText: "2.5mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Weight loss progression", doseText: "5mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Weight loss optimization", doseText: "7.5-10mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Maximum weight loss", doseText: "12.5-15mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Diabetes management (mild)", doseText: "5-7.5mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Diabetes management (severe)", doseText: "10-15mg weekly", frequencyText: "Once weekly", route: "SubQ" }
  ],
  "semaglutide": [
    { label: "Weight Loss Initiation", doseText: "0.25mg", frequencyText: "Weekly x 4 weeks, then increase", route: "SubQ" },
    { label: "Weight Loss Maintenance", doseText: "2.4mg", frequencyText: "Weekly (after 16-week titration)", route: "SubQ" },
    { label: "Diabetes Management", doseText: "0.5-1mg", frequencyText: "Weekly", route: "SubQ" },
    { label: "Cardiovascular Protection", doseText: "0.5-1mg", frequencyText: "Weekly", route: "SubQ" },
    { label: "Tolerability-Based", doseText: "0.25-2.4mg", frequencyText: "Weekly (individualized)", route: "SubQ" }
  ],
  "bpc-157": [
    { label: "Tendon/Joint healing", doseText: "250-500mcg", frequencyText: "1-2x daily", route: "SubQ near injury" },
    { label: "Serious injury", doseText: "500-1000mcg", frequencyText: "2x daily", route: "SubQ near injury" },
    { label: "General healing", doseText: "250-500mcg", frequencyText: "1-2x daily", route: "SubQ or IM" },
    { label: "Maintenance", doseText: "250mcg", frequencyText: "1x daily", route: "SubQ" }
  ],
  "tb-500": [
    { label: "General tissue repair", doseText: "2-3mg", frequencyText: "2x weekly", route: "SubQ or IM" },
    { label: "Serious injury recovery", doseText: "4-5mg", frequencyText: "3x weekly", route: "SubQ near injury site" },
    { label: "Athletic enhancement", doseText: "2-3mg", frequencyText: "2x weekly", route: "SubQ" },
    { label: "Chronic conditions", doseText: "3-4mg", frequencyText: "2-3x weekly", route: "SubQ or IM" },
    { label: "Maintenance", doseText: "2mg", frequencyText: "1-2x weekly", route: "SubQ" },
    { label: "Post-surgical recovery", doseText: "3-5mg", frequencyText: "3x weekly", route: "SubQ" }
  ],
  "bpc-tb": [
    { label: "Conservative start", doseText: "500 mcg total (250 mcg BPC-157 + 250 mcg TB-500)", frequencyText: "Once daily", route: "SubQ" },
    { label: "General Recovery Protocol", doseText: "1 mg total (500 mcg BPC-157 + 500 mcg TB-500)", frequencyText: "Once daily", route: "SubQ" },
    { label: "General Recovery Protocol (separate vials)", doseText: "BPC-157 250-500 mcg + TB-500 2 mg", frequencyText: "BPC-157 once daily, TB-500 twice weekly", route: "SubQ" },
    { label: "Intensive Injury Recovery (separate vials)", doseText: "BPC-157 500 mcg + TB-500 2.5 mg", frequencyText: "BPC-157 1-2x daily, TB-500 twice weekly", route: "SubQ near injury site" }
  ],
  "ghk-cu": [
    { label: "Anti-aging skincare", doseText: "0.5-1% cream", frequencyText: "1-2x daily", route: "Topical application" },
    { label: "Hair growth stimulation", doseText: "1-2% solution", frequencyText: "1x daily", route: "Scalp massage" },
    { label: "Wound healing", doseText: "1-2% gel", frequencyText: "2-3x daily", route: "Direct application" },
    { label: "General skin health", doseText: "0.5% serum", frequencyText: "1x daily", route: "Face and neck" },
    { label: "Intensive repair", doseText: "2% cream", frequencyText: "1x daily", route: "Targeted areas" }
  ],
  "hgh": [
    { label: "Medical GHD Replacement (Starting)", doseText: "0.15-0.3 mg/day (0.5-1 IU)", frequencyText: "Once daily", route: "SubQ" },
    { label: "Medical GHD Replacement (Maintenance)", doseText: "0.4-0.8 mg/day (1.2-2.4 IU)", frequencyText: "Once daily", route: "SubQ" },
    { label: "Anti-Aging / Wellness (Conservative)", doseText: "1-2 IU/day (0.33-0.67 mg)", frequencyText: "Once daily", route: "SubQ" },
    { label: "Body Recomposition (Moderate)", doseText: "2-4 IU/day (0.67-1.33 mg)", frequencyText: "Once or twice daily", route: "SubQ" },
    { label: "Performance (Higher - More Risk)", doseText: "4-8 IU/day (1.33-2.67 mg)", frequencyText: "Split twice daily", route: "SubQ" },
    { label: "Fasted Morning Protocol", doseText: "2-4 IU", frequencyText: "Morning on empty stomach", route: "SubQ" }
  ],
  "cagrilintide": [
    { label: "Weight Loss (Monotherapy)", doseText: "2.4 mg weekly", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Weight Loss (CagriSema)", doseText: "2.4 mg + semaglutide 2.4 mg", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Type 2 Diabetes Management", doseText: "2.4 mg weekly", frequencyText: "Once weekly", route: "SubQ with metformin" },
    { label: "Dose Escalation Protocol", doseText: "0.25 mg to 0.5 mg to 1.0 mg to 1.7 mg to 2.4 mg", frequencyText: "Weekly increases over 16 weeks", route: "SubQ" },
    { label: "Combination Diabetes Therapy", doseText: "2.4 mg + SGLT2 inhibitor", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Cardiovascular Risk Reduction", doseText: "2.4 mg weekly", frequencyText: "Once weekly", route: "SubQ" }
  ],
  "epitalon": [
    { label: "Evidence-Based Protocol (Recommended)", doseText: "200-500mcg", frequencyText: "Daily", route: "SubQ" },
    { label: "Conservative Start", doseText: "100mcg", frequencyText: "Daily", route: "SubQ" },
    { label: "Russian Clinical Equivalent", doseText: "300mcg", frequencyText: "Daily", route: "SubQ" },
    { label: "Traditional Western (Anecdotal)", doseText: "5-10mg", frequencyText: "Daily", route: "SubQ" },
    { label: "Ultra-Low Dose", doseText: "50mcg", frequencyText: "Daily", route: "SubQ" }
  ],
  "tesamorelin": [
    { label: "HIV Lipodystrophy (FDA Approved)", doseText: "1.4 mg daily", frequencyText: "Once daily", route: "SubQ (abdomen)" },
    { label: "Visceral Fat Reduction", doseText: "2 mg daily", frequencyText: "Once daily", route: "SubQ (rotate sites)" },
    { label: "Anti-aging/Body Composition", doseText: "1-2 mg daily", frequencyText: "5-7 days/week", route: "SubQ (evening)" },
    { label: "NAFLD Treatment", doseText: "2 mg daily", frequencyText: "Once daily", route: "SubQ for 12 months" },
    { label: "Cognitive Enhancement (Research)", doseText: "1 mg daily", frequencyText: "Once daily", route: "SubQ for 20 weeks" },
    { label: "Research Protocol", doseText: "1-2 mg daily", frequencyText: "Daily", route: "SubQ with cycle breaks" }
  ],
  "ipamorelin": [
    { label: "General Health & Longevity", doseText: "200mcg", frequencyText: "1x daily before bed", route: "SubQ" },
    { label: "Body Composition", doseText: "250-300mcg", frequencyText: "2x daily (morning, pre-workout)", route: "SubQ" },
    { label: "Athletic Performance", doseText: "200-250mcg", frequencyText: "2-3x daily (morning, pre/post workout)", route: "SubQ" },
    { label: "Sleep & Recovery", doseText: "200mcg", frequencyText: "1x daily 30min before bed", route: "SubQ" },
    { label: "Anti-Aging Protocol", doseText: "200-250mcg", frequencyText: "1-2x daily (morning, bedtime)", route: "SubQ" }
  ],
  "5-amino-1mq": [
    { label: "Conservative approach", doseText: "25mg", frequencyText: "1x daily", route: "Oral (with food)" },
    { label: "Standard starting dose", doseText: "50mg", frequencyText: "1x daily", route: "Oral (with food)" },
    { label: "Typical maintenance", doseText: "75mg", frequencyText: "1x daily", route: "Oral (with food)" },
    { label: "Maximum dose", doseText: "100mg", frequencyText: "1x daily", route: "Oral (with food)" },
    { label: "Split dosing option", doseText: "50mg", frequencyText: "2x daily", route: "Oral (with meals)" }
  ],
  "klow": [
    { label: "Common Research Protocol", doseText: "3.2mg total", frequencyText: "Once daily", route: "SubQ" },
    { label: "Starter/Titration Protocol", doseText: "2mg total", frequencyText: "Once daily", route: "SubQ" },
    { label: "Cycling Protocol", doseText: "As above", frequencyText: "4-6 weeks on, 2-4 weeks off", route: "SubQ" }
  ],
  "cjc-1295-dac": [
    { label: "Conservative Anti-Aging", doseText: "1mg", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Standard Protocol", doseText: "2mg", frequencyText: "Once weekly", route: "SubQ" },
    { label: "Split Dosing", doseText: "1mg", frequencyText: "Twice weekly (Mon/Thu)", route: "SubQ" },
    { label: "Loading Protocol", doseText: "2mg first week, then 1mg", frequencyText: "Weekly", route: "SubQ" }
  ],
  "cjc-1295-no-dac": [
    { label: "Anti-Aging/Wellness", doseText: "100mcg", frequencyText: "2x daily (morning and bedtime)", route: "SubQ" },
    { label: "Body Composition", doseText: "100-150mcg", frequencyText: "3x daily (morning, post-workout, bedtime)", route: "SubQ" },
    { label: "Maximum GH Release", doseText: "200mcg", frequencyText: "2-3x daily with GHRP", route: "SubQ" },
    { label: "Sleep Enhancement", doseText: "100-200mcg", frequencyText: "Once at bedtime", route: "SubQ" }
  ],
  "cjc-ipamorelin": [
    { label: "General health optimization", doseText: "200 mcg each", frequencyText: "Once daily before bed", route: "SubQ" },
    { label: "Enhanced GH pulsatility", doseText: "100-150 mcg each", frequencyText: "Twice daily (AM + before bed)", route: "SubQ" },
    { label: "Performance enhancement", doseText: "250 mcg each", frequencyText: "Once daily before bed", route: "SubQ" },
    { label: "Recovery optimization", doseText: "300 mcg each", frequencyText: "Once daily before bed", route: "SubQ" },
    { label: "Conservative approach", doseText: "150 mcg each", frequencyText: "5 days per week", route: "SubQ" }
  ],
  "hcg": [
    { label: "TRT Adjunct (Low Dose)", doseText: "250-500 IU", frequencyText: "Every other day", route: "SubQ or IM" },
    { label: "TRT Adjunct (Standard)", doseText: "500-1000 IU", frequencyText: "Twice weekly", route: "SubQ or IM" },
    { label: "HCG Monotherapy (Hypogonadism)", doseText: "1500-2000 IU", frequencyText: "2-3 times weekly", route: "IM injection" },
    { label: "Fertility Protocol (with FSH)", doseText: "1500-2000 IU", frequencyText: "2-3 times weekly", route: "IM injection" },
    { label: "Cryptorchidism (Pediatric)", doseText: "1000-5000 IU", frequencyText: "2-3 times weekly", route: "IM injection" },
    { label: "Ovulation Trigger (Female)", doseText: "5000-10000 IU single dose", frequencyText: "Once", route: "IM or SubQ" },
    { label: "PCT Protocol", doseText: "1000-1500 IU", frequencyText: "Every other day x 2-3 weeks", route: "SubQ or IM" }
  ],
  "ss-31": [
    { label: "General Mitochondrial Support", doseText: "5-10mg", frequencyText: "Once daily", route: "SubQ" },
    { label: "Athletic Performance", doseText: "10-20mg", frequencyText: "Once daily pre-workout", route: "SubQ" },
    { label: "Clinical Protocols", doseText: "40mg", frequencyText: "Once daily", route: "SubQ or IV" },
    { label: "Acute Cardioprotection", doseText: "0.25mg/kg/hr", frequencyText: "Continuous infusion", route: "IV" }
  ],
  "kpv": [
    { label: "General Anti-Inflammatory", doseText: "200-300mcg", frequencyText: "Once daily", route: "SubQ" },
    { label: "Active Inflammation", doseText: "250mcg", frequencyText: "Twice daily", route: "SubQ" },
    { label: "Autoimmune Support", doseText: "500mcg", frequencyText: "Once daily", route: "SubQ" },
    { label: "Acute Flare-ups", doseText: "500mcg", frequencyText: "Twice daily for 1 week then reduce", route: "SubQ" }
  ],
  "pt-141": [
    { label: "Female HSDD (FDA-approved)", doseText: "1.75mg", frequencyText: "As needed, max 1 dose/24hr", route: "SubQ (abdomen/thigh)" },
    { label: "Male Erectile Dysfunction", doseText: "1-2mg", frequencyText: "As needed, 45-60min before activity", route: "SubQ" },
    { label: "Female Arousal Disorder", doseText: "0.75-1.25mg", frequencyText: "As needed, max 1 dose/24hr", route: "SubQ" },
    { label: "Low Starting Dose", doseText: "0.5mg", frequencyText: "Test dose to assess tolerance", route: "SubQ" }
  ],
  "melanotan-ii": [
    { label: "Initial Loading", doseText: "0.25mg", frequencyText: "Daily", route: "SubQ" },
    { label: "Tanning Maintenance", doseText: "0.5-1mg", frequencyText: "2-3x weekly", route: "SubQ" },
    { label: "Sexual Enhancement", doseText: "0.5-1mg", frequencyText: "As needed", route: "SubQ" },
    { label: "Minimal Side Effects", doseText: "0.1-0.25mg", frequencyText: "Every other day", route: "SubQ" },
    { label: "Photoprotection", doseText: "0.5mg", frequencyText: "2x weekly", route: "SubQ" }
  ],
  "glutathione": [
    { label: "General antioxidant support", doseText: "200-400 mg", frequencyText: "1-2x weekly", route: "IM or IV push" },
    { label: "Detoxification support", doseText: "400-600 mg", frequencyText: "2-3x weekly", route: "IV push or slow infusion" },
    { label: "Immune support", doseText: "400-600 mg", frequencyText: "1-2x weekly", route: "IV or IM" },
    { label: "Neurological support (Parkinson's research)", doseText: "1400 mg", frequencyText: "3x weekly", route: "IV infusion" },
    { label: "Maintenance", doseText: "200 mg", frequencyText: "1x weekly", route: "IM or SubQ" }
  ],
  "igf-1-lr3": [
    { label: "Research Beginner Protocol", doseText: "20-30mcg", frequencyText: "Once daily, post-workout", route: "SubQ" },
    { label: "Intermediate Research Use", doseText: "40-60mcg", frequencyText: "Once daily, post-workout or morning", route: "SubQ or IM" },
    { label: "Advanced Research Protocol", doseText: "80-100mcg", frequencyText: "Once daily or split AM/PM", route: "SubQ or site-specific IM" },
    { label: "Women's Research Protocol", doseText: "10-20mcg", frequencyText: "Once daily", route: "SubQ only" }
  ],
  "selank": [
    { label: "Mild anxiety relief", doseText: "250mcg daily", frequencyText: "Once daily", route: "SubQ" },
    { label: "Moderate anxiety/cognitive enhancement", doseText: "250mcg twice daily", frequencyText: "Morning and evening", route: "SubQ" },
    { label: "Intensive anxiety/stress management", doseText: "500mcg daily", frequencyText: "Divided doses", route: "SubQ" },
    { label: "Cognitive enhancement/nootropic use", doseText: "250-350mcg daily", frequencyText: "Morning only", route: "SubQ" },
    { label: "PTSD/trauma support", doseText: "250mcg twice daily", frequencyText: "Consistent timing", route: "SubQ" },
    { label: "Immune support during stress", doseText: "250mcg daily", frequencyText: "Once daily for 2-4 weeks", route: "SubQ" }
  ],
  "dsip": [
    { label: "Sleep Enhancement", doseText: "100-200mcg", frequencyText: "Once nightly", route: "SubQ" },
    { label: "Chronic Pain", doseText: "250-300mcg", frequencyText: "Daily", route: "IV or SubQ" },
    { label: "Stress Management", doseText: "150mcg", frequencyText: "Evening", route: "SubQ" },
    { label: "Withdrawal Support", doseText: "200-300mcg", frequencyText: "Twice daily", route: "IV preferred" },
    { label: "Athletic Recovery", doseText: "100-150mcg", frequencyText: "Post-training", route: "SubQ" }
  ],
  "aod-9604": [
    { label: "Fat loss", doseText: "250-300mcg", frequencyText: "Once daily", route: "SubQ" },
    { label: "Enhanced fat loss", doseText: "400-500mcg", frequencyText: "Once daily", route: "SubQ" },
    { label: "Joint support", doseText: "250mcg", frequencyText: "Once daily", route: "SubQ" },
    { label: "Conservative start", doseText: "200mcg", frequencyText: "Once daily", route: "SubQ" }
  ]
};

const inferGoalFromLabel = (label: string, peptideGoals: string[]) => {
  const text = label.toLowerCase();

  if (/anti-aging|anti aging|longevity|wellness/.test(text) && peptideGoals.includes("Longevity / Anti-aging")) {
    return "Longevity / Anti-aging";
  }

  if (/metabolic|weight|fat|obesity|diabetes|recomposition|lipodystrophy/.test(text) && peptideGoals.includes("Fat loss / Metabolic")) {
    return "Fat loss / Metabolic";
  }

  if (/cognitive|brain|memory|focus|nootropic|anxiety|sleep|ptsd|neuro/.test(text) && peptideGoals.includes("Cognitive / Neuro")) {
    return "Cognitive / Neuro";
  }

  if (/heal|recovery|repair|injury|tendon|joint|pain|post-surgical|wound|autoimmune|inflammation/.test(text) && peptideGoals.includes("Healing / Recovery")) {
    return "Healing / Recovery";
  }

  return peptideGoals[0];
};

const toGoalDoseOptions = (peptide: PeptideProtocolInfo, rows: PepPediaProtocolRow[]): GoalDoseOption[] => {
  return rows.flatMap((row) => {
    const goal = inferGoalFromLabel(row.label, peptide.goals);
    const doseParts = parseDoseParts(row.doseText);
    const frequency = parseFrequency(row.frequencyText);
    const rowSlug = row.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    if (!(doseParts && frequency)) {
      return [];
    }

    const option: GoalDoseOption = {
      id: `${peptide.id}-${rowSlug}`,
      label: row.label,
      parentGoal: goal,
      doseText: row.doseText,
      route: row.route,
      frequencyText: row.frequencyText,
      timelineSchedule: {
        amount: doseParts.amount,
        unit: doseParts.unit,
        frequency,
        days: getDaysForFrequency(frequency),
        note: `${row.label} recommendation from Pep-Pedia research protocols.`
      }
    };

    return [option];
  });
};

const withSourceOverlaysApplied: PeptideProtocolInfo[] = RAW_PEPTIDES_DATABASE.map((peptide) => {
  const pepPediaRows = PEP_PEDIA_PROTOCOLS[peptide.id];
  // toGoalDoseOptions silently drops any row it can't parse an amount/unit or frequency out of
  // (e.g. percentage-based topical doses like GHK-Cu's "0.5-1% cream", or PRN dosing like PT-141's
  // "As needed, max 1 dose/24hr") — so a peptide can have pepPediaRows defined and still end up
  // with zero usable options. Checking the parsed *result* here, not just presence of the raw
  // rows, means those peptides still fall through to the next tier instead of ending up with an
  // empty pep-pedia option list.
  const parsedPepPediaOptions = pepPediaRows && pepPediaRows.length > 0 ? toGoalDoseOptions(peptide, pepPediaRows) : [];
  const baseGoalDoseOptions =
    parsedPepPediaOptions.length > 0
      ? parsedPepPediaOptions
      : peptide.goalDoseOptions && peptide.goalDoseOptions.length > 0
      ? peptide.goalDoseOptions
      : buildDefaultGoalDoseOptions(peptide);

  const peptidedosagesOptions = PEPTIDEDOSAGES_GOAL_OPTIONS[peptide.id] ?? [];
  const peptidedbOptions = PEPTIDEDB_GOAL_OPTIONS[peptide.id] ?? [];

  return {
    ...peptide,
    goalDoseOptions: [...baseGoalDoseOptions, ...peptidedosagesOptions, ...peptidedbOptions]
  };
});

// peptide-db.com-only peptides (no hand-entered RAW_PEPTIDES_DATABASE row) get appended as full
// PeptideProtocolInfo rows so they're addable/searchable in Protocol Builder like any other
// peptide, carrying only "peptide-db"-sourced goalDoseOptions. See src/data/peptideDb.ts.
export const PEPTIDES_DATABASE: PeptideProtocolInfo[] = [...withSourceOverlaysApplied, ...PEPTIDEDB_BASE_PEPTIDES];

export const PEPTIDE_INTERACTIONS: PeptideInteraction[] = [
  {
    peptideA: "mots-c",
    peptideB: "nad-plus",
    type: "Synergy",
    description: "Highly complementary! MOTS-c increases cellular NAD+ uptake and fuels mitochondrial respiration, unlocking powerful anti-aging kinetics."
  },
  {
    peptideA: "glow",
    peptideB: "nad-plus",
    type: "Compatible",
    description: "Highly compatible stack. The healing complex of GLOW repairs structural extracellular tissues, while NAD+ supplies crucial high-energy ATP."
  },
  {
    peptideA: "nad-plus",
    peptideB: "retatrutide",
    type: "Compatible",
    description: "Compatible metabolic stack. NAD+ optimizes mitochondrial metabolic output, acting as a clean energy floor during heavy Retatrutide weight loss titration."
  },
  {
    peptideA: "bpc-157",
    peptideB: "tb-500",
    type: "Synergy",
    description: "Gold Standard Healing Stack! BPC-157 stimulates local blood vessel growth (angiogenesis), while TB-500 guides cellular migration to form pristine new tissue."
  },
  {
    peptideA: "ghk-cu",
    peptideB: "bpc-157",
    type: "Synergy",
    description: "Profound Skin & Joint remodeling synergy. BPC-157 dampens the strong inflammatory sting of GHK-Cu, while multiplying the rate of collagen remodeling."
  },
  {
    peptideA: "klow",
    peptideB: "nad-plus",
    type: "Compatible",
    description: "Highly compatible recovery stack. The comprehensive healing and anti-inflammatory properties of KLOW are supercharged by NAD+ cellular energy replenishment."
  },
  {
    peptideA: "5-amino-1mq",
    peptideB: "tirzepatide",
    type: "Synergy",
    description: "Formidable metabolic and body-recomposition synergy! Tirzepatide regulates central appetite pathways, while 5-Amino-1MQ accelerates local fat cell expenditure by preventing NNMT-induced NAD+ decline."
  },
  {
    peptideA: "5-amino-1mq",
    peptideB: "nad-plus",
    type: "Synergy",
    description: "Potent energy synergy. 5-Amino-1MQ inhibits NNMT to preserve internal cellular NAD+ levels, while external NAD+ administration directly elevates active metabolic coenzyme pools."
  }
];
