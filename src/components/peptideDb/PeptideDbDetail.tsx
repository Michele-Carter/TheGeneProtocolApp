/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Info,
  Clock,
  FlaskConical,
  BookOpen
} from "lucide-react";
import { PEPTIDEDB_ENTRIES } from "../../data/peptideDb";
import { PeptideDbEffectiveness, PeptideDbInteractionStatus } from "../../types";

const EFFECTIVENESS_STYLE: Record<PeptideDbEffectiveness, string> = {
  "Most Effective": "bg-emerald-500/15 text-emerald-400",
  Effective: "bg-gold-500/15 text-gold-400",
  Moderate: "bg-amber-500/15 text-amber-400",
  Emerging: "bg-slate-700/40 text-slate-400"
};

const INTERACTION_STYLE: Record<PeptideDbInteractionStatus, string> = {
  Synergistic: "bg-emerald-500/15 text-emerald-400",
  Compatible: "bg-zinc-800 text-zinc-400",
  Monitor: "bg-amber-500/15 text-amber-400",
  Avoid: "bg-red-500/15 text-red-400",
  "Requires Timing": "bg-orange-500/15 text-orange-400"
};

function SectionCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/60 rounded-2xl border border-slate-800/80 p-5 space-y-4">
      <span className="font-mono text-[12px] uppercase tracking-wider text-gold-400 flex items-center gap-1.5">
        {icon}
        {title}
      </span>
      {children}
    </div>
  );
}

export default function PeptideDbDetail({
  slug,
  onBack,
  onNavigateToSlug
}: {
  slug: string;
  onBack: () => void;
  onNavigateToSlug: (slug: string) => void;
}) {
  const entry = useMemo(() => PEPTIDEDB_ENTRIES.find((e) => e.slug === slug), [slug]);
  const [activeMethodIdx, setActiveMethodIdx] = useState(0);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(null);

  if (!entry) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider uppercase text-gold-400 hover:text-gold-300 transition cursor-pointer"
        >
          <ArrowLeft size={12} />
          Peptide Database
        </button>
        <div className="p-10 text-center bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl">
          <p className="text-sm text-slate-400">Peptide not found.</p>
        </div>
      </div>
    );
  }

  const activeMethod = entry.deliveryMethods[Math.min(activeMethodIdx, entry.deliveryMethods.length - 1)];

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider uppercase text-gold-400 hover:text-gold-300 transition cursor-pointer"
      >
        <ArrowLeft size={12} />
        Peptide Database
      </button>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">{entry.name}</h1>
          {entry.fdaApproved && (
            <span className="flex items-center gap-1 text-[11px] font-bold uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg">
              <ShieldCheck size={11} />
              FDA Approved
            </span>
          )}
          <span className="text-[11px] font-mono uppercase text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg">
            {entry.researchStatus.replace(/-/g, " ")}
          </span>
        </div>
        <p className="text-sm text-slate-400 font-mono">{entry.subtitle}</p>
        {entry.aliases.length > 0 && (
          <p className="text-xs text-slate-500">Also known as: {entry.aliases.join(", ")}</p>
        )}
        <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">{entry.overview}</p>
      </div>

      {/* Molecular info */}
      <SectionCard title="Molecular Information" icon={<FlaskConical size={13} />}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-slate-500 text-[12px]">Type</div>
            <div className="font-semibold text-white mt-0.5">{entry.molecularInfo.type}</div>
          </div>
          {entry.molecularInfo.weight && (
            <div>
              <div className="text-slate-500 text-[12px]">Molecular weight</div>
              <div className="font-semibold text-white font-mono mt-0.5">{entry.molecularInfo.weight}</div>
            </div>
          )}
          {entry.molecularInfo.length && (
            <div>
              <div className="text-slate-500 text-[12px]">Length</div>
              <div className="font-semibold text-white font-mono mt-0.5">{entry.molecularInfo.length}</div>
            </div>
          )}
          {entry.molecularInfo.formula && (
            <div>
              <div className="text-slate-500 text-[12px]">Formula</div>
              <div className="font-semibold text-white font-mono mt-0.5">{entry.molecularInfo.formula}</div>
            </div>
          )}
          {entry.molecularInfo.halfLife && (
            <div>
              <div className="text-slate-500 text-[12px]">Half-life</div>
              <div className="font-semibold text-white font-mono mt-0.5">{entry.molecularInfo.halfLife}</div>
            </div>
          )}
        </div>
        {entry.molecularInfo.components && (
          <div>
            <div className="text-slate-500 text-[12px] mb-1">Composition</div>
            <p className="text-sm text-slate-300 leading-relaxed">{entry.molecularInfo.components}</p>
          </div>
        )}
        {entry.molecularInfo.sequence && entry.molecularInfo.sequence !== "N/A" && (
          <div>
            <div className="text-slate-500 text-[12px] mb-1">Sequence</div>
            <div className="text-[11px] font-mono text-slate-300 bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 break-all">
              {entry.molecularInfo.sequence}
            </div>
          </div>
        )}
        {entry.mechanism && (
          <div>
            <div className="text-slate-500 text-[12px] mb-1">Mechanism</div>
            <p className="text-sm text-slate-300 leading-relaxed">{entry.mechanism}</p>
          </div>
        )}
        {entry.keyBenefits.length > 0 && (
          <ul className="space-y-1.5">
            {entry.keyBenefits.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gold-400 flex-shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Blend composition */}
      {entry.blendComposition && (
        <SectionCard title="Blend Composition" icon={<FlaskConical size={13} />}>
          <p className="text-xs text-slate-400">
            Total: <span className="text-white font-mono font-semibold">{entry.blendComposition.totalAmount}{entry.blendComposition.unit}</span>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Component</th>
                  <th className="py-2 pr-3 font-semibold">Amount</th>
                  <th className="py-2 font-semibold">Ratio</th>
                </tr>
              </thead>
              <tbody>
                {entry.blendComposition.components.map((c) => (
                  <tr key={c.name} className="border-b border-slate-900/60">
                    <td className="py-2 pr-3 text-slate-300">{c.name}</td>
                    <td className="py-2 pr-3 font-mono text-gold-400">
                      {c.amount}
                      {entry.blendComposition!.unit}
                    </td>
                    <td className="py-2 text-slate-400 font-mono">{c.ratio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Research indications */}
      {entry.researchIndications.length > 0 && (
        <SectionCard title="Research Indications" icon={<Info size={13} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(
              entry.researchIndications.reduce<Record<string, typeof entry.researchIndications>>((acc, ind) => {
                (acc[ind.category] ??= []).push(ind);
                return acc;
              }, {})
            ).map(([category, items]) => (
              <div key={category} className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{category}</span>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.indication} className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800/40 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">{item.indication}</span>
                        <span className={`text-xs font-semibold px-1 py-0.5 rounded flex-shrink-0 leading-none ${EFFECTIVENESS_STYLE[item.effectiveness]}`}>
                          {item.effectiveness}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Dosing protocols */}
      {entry.deliveryMethods.length > 0 && (
        <SectionCard title="Dosing Protocols">
          {entry.deliveryMethods.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {entry.deliveryMethods.map((method, idx) => (
                <button
                  key={method.type}
                  type="button"
                  onClick={() => setActiveMethodIdx(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize whitespace-nowrap transition cursor-pointer ${
                    idx === activeMethodIdx ? "bg-gold-500/15 border border-gold-500/60 text-gold-300" : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {method.type}
                </button>
              ))}
            </div>
          )}
          {activeMethod && (
            <div className="space-y-3">
              {activeMethod.overview && <p className="text-sm text-slate-400 leading-relaxed">{activeMethod.overview}</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Goal</th>
                      <th className="py-2 pr-3 font-semibold">Dose</th>
                      <th className="py-2 pr-3 font-semibold">Frequency</th>
                      <th className="py-2 font-semibold">Route</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeMethod.protocols.map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-900/60">
                        <td className="py-2 pr-3 text-slate-300">
                          {row.goal}
                          {row.notes && <span className="block text-[10px] text-slate-500 italic mt-0.5">{row.notes}</span>}
                        </td>
                        <td className="py-2 pr-3 font-mono text-gold-400">{row.dose}</td>
                        <td className="py-2 pr-3 text-slate-400">{row.frequency}</td>
                        <td className="py-2 text-slate-400">{row.route}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {activeMethod.reconstitution && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800/40">
                    <div className="text-slate-500 mb-1 font-bold uppercase">Materials</div>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-sm leading-relaxed">
                      {activeMethod.reconstitution.materials.map((m, idx) => (
                        <li key={idx}>{m}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800/40">
                    <div className="text-slate-500 mb-1 font-bold uppercase">Steps</div>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-300 text-sm leading-relaxed">
                      {activeMethod.reconstitution.steps.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800/60 text-xs">
            <div>
              <div className="text-slate-500 text-[12px]">Cycle</div>
              <div className="font-semibold text-white mt-0.5">{entry.quickStats.cycleDuration || "Not established"}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-slate-500 text-[12px]">Storage</div>
              <div className="font-semibold text-white text-[12px] leading-relaxed mt-0.5">{entry.quickStats.storage}</div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Competing protocol variants (e.g. clinical-dose vs. community-dose philosophies) */}
      {entry.protocolVariants.length > 0 && (
        <SectionCard title="Protocol Variants" icon={<Info size={13} />}>
          <div className="space-y-4">
            {entry.protocolVariants.map((variant) => (
              <div key={variant.name} className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/40 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-white">{variant.name}</span>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Source: {variant.source}
                      {variant.sourceUrl && (
                        <a href={variant.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 text-slate-500 hover:text-gold-400 inline-flex items-center">
                          <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 italic">{variant.philosophy}</p>
                <p className="text-sm text-slate-400 leading-relaxed">{variant.description}</p>
                {variant.doses.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-left text-slate-500">
                          <th className="py-1.5 pr-2 font-semibold">Phase</th>
                          <th className="py-1.5 pr-2 font-semibold">Dose</th>
                          <th className="py-1.5 pr-2 font-semibold">Frequency</th>
                          <th className="py-1.5 font-semibold">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {variant.doses.map((d, idx) => (
                          <tr key={idx} className="border-b border-slate-900/60">
                            <td className="py-1.5 pr-2 text-slate-300">{d.phase}</td>
                            <td className="py-1.5 pr-2 font-mono text-gold-400">{d.dose}</td>
                            <td className="py-1.5 pr-2 text-slate-400">{d.frequency}</td>
                            <td className="py-1.5 text-slate-400">{d.duration}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {variant.keyDifferences.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5 text-sm leading-relaxed text-slate-400">
                    {variant.keyDifferences.map((kd, idx) => (
                      <li key={idx}>{kd}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Interactions */}
      {entry.interactions.length > 0 && (
        <SectionCard title="Peptide Interactions" icon={<Info size={13} />}>
          <div className="space-y-2.5">
            {entry.interactions.map((interaction) => (
              <div key={interaction.peptideName} className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800/40 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  {interaction.peptideSlug ? (
                    <button
                      type="button"
                      onClick={() => onNavigateToSlug(interaction.peptideSlug!)}
                      className="text-xs font-semibold text-gold-300 hover:text-gold-200 underline decoration-dotted underline-offset-2 cursor-pointer"
                    >
                      {interaction.peptideName}
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-white">{interaction.peptideName}</span>
                  )}
                  <span className={`text-xs font-semibold px-1 py-0.5 rounded flex-shrink-0 leading-none ${INTERACTION_STYLE[interaction.relationship]}`}>
                    {interaction.relationship}
                  </span>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">{interaction.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* What to expect */}
      {entry.whatToExpect.length > 0 && (
        <SectionCard title="What to Expect" icon={<Clock size={13} />}>
          <div className="space-y-2 relative border-l border-slate-800 pl-3.5 ml-1">
            {entry.whatToExpect.map((t) => (
              <div key={t.period} className="relative">
                <span className="absolute -left-[19px] top-1 w-1.5 h-1.5 rounded-full bg-gold-500" />
                <div className="text-slate-400 leading-relaxed text-sm">
                  <span className="font-mono font-bold text-white text-[12px] inline-block mr-1.5 bg-slate-900 px-1 py-0.5 rounded">
                    {t.period}
                  </span>
                  <span>{t.effects}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Safety */}
      <SectionCard title="Side Effects & Safety" icon={<AlertTriangle size={13} className="text-red-400" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {entry.safety.common.length > 0 && (
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
              <span className="text-[12px] font-bold text-slate-300 block">COMMON</span>
              <ul className="list-disc list-inside space-y-1 text-sm leading-relaxed text-slate-400">
                {entry.safety.common.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {entry.safety.rare.length > 0 && (
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
              <span className="text-[12px] font-bold text-slate-300 block">RARE</span>
              <ul className="list-disc list-inside space-y-1 text-sm leading-relaxed text-slate-400">
                {entry.safety.rare.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {entry.safety.monitoring.length > 0 && (
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
              <span className="text-[12px] font-bold text-slate-300 block">MONITORING</span>
              <ul className="list-disc list-inside space-y-1 text-sm leading-relaxed text-slate-400">
                {entry.safety.monitoring.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {entry.safety.stopAndSeekCare.length > 0 && (
            <div className="p-3 bg-amber-950/10 border border-amber-900/30 rounded-xl space-y-1.5">
              <span className="text-[12px] font-bold text-amber-400 flex items-center space-x-1">
                <AlertTriangle size={10} />
                <span>STOP &amp; SEEK CARE IF</span>
              </span>
              <ul className="list-disc list-inside space-y-1 text-sm leading-relaxed text-slate-400">
                {entry.safety.stopAndSeekCare.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {entry.safety.contraindications.length > 0 && (
            <div className="p-3 bg-red-950/10 border border-red-900/30 rounded-xl space-y-1.5">
              <span className="text-[12px] font-bold text-red-400 flex items-center space-x-1">
                <ShieldAlert size={10} />
                <span>DO NOT USE IF</span>
              </span>
              <ul className="list-disc list-inside space-y-1 text-sm leading-relaxed text-slate-400">
                {entry.safety.contraindications.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Quality checklist */}
      {(entry.qualityChecklist.good.length > 0 || entry.qualityChecklist.bad.length > 0) && (
        <SectionCard title="Quality Checklist" icon={<ShieldCheck size={13} />}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {entry.qualityChecklist.good.length > 0 && (
              <div className="p-3 bg-emerald-950/10 border border-emerald-900/30 rounded-xl space-y-1.5">
                <span className="text-[12px] font-bold text-emerald-400 block">GOOD SIGNS</span>
                <ul className="list-disc list-inside space-y-1 text-sm leading-relaxed text-slate-400">
                  {entry.qualityChecklist.good.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {entry.qualityChecklist.warning.length > 0 && (
              <div className="p-3 bg-amber-950/10 border border-amber-900/30 rounded-xl space-y-1.5">
                <span className="text-[12px] font-bold text-amber-400 block">WARNING SIGNS</span>
                <ul className="list-disc list-inside space-y-1 text-sm leading-relaxed text-slate-400">
                  {entry.qualityChecklist.warning.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {entry.qualityChecklist.bad.length > 0 && (
              <div className="p-3 bg-red-950/10 border border-red-900/30 rounded-xl space-y-1.5">
                <span className="text-[12px] font-bold text-red-400 block">BAD SIGNS</span>
                <ul className="list-disc list-inside space-y-1 text-sm leading-relaxed text-slate-400">
                  {entry.qualityChecklist.bad.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* FAQ */}
      {entry.faq.length > 0 && (
        <SectionCard title="Frequently Asked Questions" icon={<Info size={13} />}>
          <div className="divide-y divide-slate-800/60">
            {entry.faq.map((item, idx) => (
              <div key={idx} className="py-2.5 first:pt-0 last:pb-0">
                <button
                  type="button"
                  onClick={() => setOpenFaqIdx(openFaqIdx === idx ? null : idx)}
                  className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
                >
                  <span className="text-xs font-semibold text-white">{item.question}</span>
                  {openFaqIdx === idx ? (
                    <ChevronUp size={14} className="text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
                  )}
                </button>
                {openFaqIdx === idx && <p className="text-sm text-slate-400 leading-relaxed mt-2">{item.answer}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* References */}
      {(entry.references.length > 0 || entry.latestResearch.length > 0) && (
        <SectionCard title="References" icon={<BookOpen size={13} />}>
          {entry.references.length > 0 && (
            <div className="space-y-2.5">
              {entry.references.map((ref) => (
                <div key={ref.index} className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800/40 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-white leading-snug">{ref.title}</span>
                    {ref.url && (
                      <a href={ref.url} target="_blank" rel="noreferrer" className="flex-shrink-0 text-slate-500 hover:text-gold-400 transition">
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {[ref.author, ref.journal, ref.year].filter(Boolean).join(" • ")}
                  </p>
                  {ref.participants && <p className="text-[11px] text-slate-500 italic">Cohort: {ref.participants}</p>}
                  <p className="text-sm text-slate-400 leading-relaxed">{ref.summary}</p>
                </div>
              ))}
            </div>
          )}
          {entry.latestResearch.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-slate-800/60">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Latest Research</span>
              {entry.latestResearch.map((lr) => (
                <div key={lr.title} className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800/40 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-white leading-snug">{lr.title}</span>
                    {lr.url && (
                      <a href={lr.url} target="_blank" rel="noreferrer" className="flex-shrink-0 text-slate-500 hover:text-gold-400 transition">
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">{[lr.source, lr.date].filter(Boolean).join(" • ")}</p>
                  <p className="text-sm text-slate-400 leading-relaxed">{lr.summary}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      <div className="text-center text-[11px] text-slate-600">
        Source:{" "}
        <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-gold-400 transition inline-flex items-center gap-1">
          peptide-db.com <ExternalLink size={9} />
        </a>
      </div>
    </div>
  );
}
