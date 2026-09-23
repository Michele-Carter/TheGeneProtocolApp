/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ChevronDown, ChevronUp, AlertTriangle, ShieldAlert, Info, ExternalLink, X, Sparkles } from "lucide-react";
import { ProtocolBuilderState, resolveDoseForWeek } from "../hooks/useProtocolBuilderState";
import { ProtocolSubView } from "./ProtocolBuilder";
import { getColorClasses, getDistinctRoutes } from "../lib/protocolBuilderUtils";
import { PEPTIDEDOSAGES_META } from "../data/peptideDosagesSource";
import { PEPTIDEDB_META } from "../data/peptideDbSource";
import { DosingSourceId, PeptideProtocolInfo } from "../types";

// The three "Protocol intelligence" panel layouts, one per dosing source. Kept as small sibling
// components (rather than a widening if/else chain) so a future 4th source is a one-case addition.

function PepPediaIntelPanel({ pep, currentDoseBlock }: { pep: PeptideProtocolInfo; currentDoseBlock: React.ReactNode }) {
  return (
    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
      <div className="space-y-5">
        <div className="space-y-2">
          <span className="font-mono text-[12px] uppercase tracking-wider text-gold-400 block">PHARMACOKINETICS</span>
          <div className="grid grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800/40">
            <div>
              <div className="text-slate-500 text-[12px]">Half-life</div>
              <div className="font-semibold text-white font-mono mt-0.5">{pep.halfLife}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[12px]">Peak (T-max)</div>
              <div className="font-semibold text-white font-mono mt-0.5">{pep.peakTime}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[12px]">Best time</div>
              <div className="font-semibold text-white text-[12px] leading-tight mt-0.5">{pep.bestTime}</div>
            </div>
          </div>
          <p className="text-slate-400 text-sm mt-1 leading-relaxed">{pep.bestTimeDetails}</p>
        </div>

        <div className="space-y-2">
          <span className="font-mono text-[12px] uppercase tracking-wider text-gold-400 block">INJECTION SITES &amp; ROTATION</span>
          <div className="flex flex-wrap gap-1.5">
            {pep.injectionSites.map((site) => (
              <span key={site} className="px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[12px] font-mono font-semibold text-white">
                {site}
              </span>
            ))}
          </div>
          <p className="text-slate-400 leading-relaxed text-sm">
            Rotate sites each dose; keep injections at least 1 inch (2.5 cm) apart and avoid the same spot for 7 days.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {currentDoseBlock}

        <div className="space-y-2">
          <span className="font-mono text-[12px] uppercase tracking-wider text-gold-400 block">WHAT TO EXPECT</span>
          <div className="space-y-2 relative border-l border-slate-800 pl-3.5 ml-1">
            {pep.expectations.map((exp) => (
              <div key={exp.week} className="relative">
                <span className="absolute -left-[19px] top-1 w-1.5 h-1.5 rounded-full bg-gold-500" />
                <div className="text-slate-400 leading-relaxed text-sm">
                  <span className="font-mono font-bold text-white text-[12px] inline-block mr-1.5 bg-slate-900 px-1 py-0.5 rounded">
                    {exp.week}
                  </span>
                  <span>{exp.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="md:col-span-2 pt-4 border-t border-slate-800/80 space-y-3">
        <span className="font-mono text-[12px] uppercase tracking-wider text-red-400 block flex items-center space-x-1">
          <AlertTriangle size={12} />
          <span>SAFETY PROFILE</span>
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
            <span className="text-[12px] font-bold text-slate-300 block">COMMON</span>
            <ul className="list-disc list-inside space-y-1 text-[12px] text-slate-400">
              {pep.safetyProfile.common.map((s, idx) => (
                <li key={idx} className="truncate">{s}</li>
              ))}
            </ul>
          </div>
          <div className="p-3 bg-amber-950/10 border border-amber-900/30 rounded-xl space-y-1.5">
            <span className="text-[12px] font-bold text-amber-400 flex items-center space-x-1">
              <AlertTriangle size={10} />
              <span>STOP &amp; SEEK CARE IF</span>
            </span>
            <ul className="list-disc list-inside space-y-1 text-[12px] text-slate-400">
              {pep.safetyProfile.stopAndSeekCare.map((s, idx) => (
                <li key={idx} className="truncate">{s}</li>
              ))}
            </ul>
          </div>
          <div className="p-3 bg-red-950/10 border border-red-900/30 rounded-xl space-y-1.5">
            <span className="text-[12px] font-bold text-red-400 flex items-center space-x-1">
              <ShieldAlert size={10} />
              <span>DO NOT USE IF</span>
            </span>
            <ul className="list-disc list-inside space-y-1 text-[12px] text-slate-400">
              {pep.safetyProfile.doNotUseIf.map((s, idx) => (
                <li key={idx} className="truncate">{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function PeptideDosagesIntelPanel({
  currentDoseBlock,
  meta
}: {
  currentDoseBlock: React.ReactNode;
  meta: { reconstitution: string; cycle: string } | undefined;
}) {
  return (
    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
      {currentDoseBlock}
      <div className="space-y-2">
        <span className="font-mono text-[12px] uppercase tracking-wider text-gold-400 block">RECONSTITUTION &amp; CYCLE</span>
        <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/40 space-y-2">
          {meta ? (
            <>
              <div>
                <div className="text-slate-500 text-[12px]">Reconstitution</div>
                <div className="text-white text-sm leading-relaxed mt-0.5">{meta.reconstitution}</div>
              </div>
              <div>
                <div className="text-slate-500 text-[12px]">Cycle</div>
                <div className="text-white text-sm leading-relaxed mt-0.5">{meta.cycle}</div>
              </div>
            </>
          ) : (
            <p className="text-slate-500 italic text-sm">No peptidedosages.com data for this peptide.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PeptideDbIntelPanel({
  currentDoseBlock,
  meta
}: {
  currentDoseBlock: React.ReactNode;
  meta: { molecularType: string; typicalDose: string; frequency: string; cycleDuration: string; storage: string } | undefined;
}) {
  return (
    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
      {currentDoseBlock}
      <div className="space-y-2">
        <span className="font-mono text-[12px] uppercase tracking-wider text-gold-400 block">MOLECULAR INFO &amp; CYCLE</span>
        <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/40 space-y-2">
          {meta ? (
            <>
              <div>
                <div className="text-slate-500 text-[12px]">Type</div>
                <div className="text-white text-sm leading-relaxed mt-0.5">{meta.molecularType}</div>
              </div>
              <div>
                <div className="text-slate-500 text-[12px]">Typical dose</div>
                <div className="text-white text-sm leading-relaxed mt-0.5">
                  {meta.typicalDose} — {meta.frequency}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[12px]">Cycle</div>
                <div className="text-white text-sm leading-relaxed mt-0.5">{meta.cycleDuration}</div>
              </div>
              <div>
                <div className="text-slate-500 text-[12px]">Storage</div>
                <div className="text-white text-sm leading-relaxed mt-0.5">{meta.storage}</div>
              </div>
            </>
          ) : (
            <p className="text-slate-500 italic text-sm">No peptide-db.com data for this peptide.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function renderIntelPanel(
  source: DosingSourceId,
  pep: PeptideProtocolInfo,
  currentDoseBlock: React.ReactNode
) {
  switch (source) {
    case "peptidedosages":
      return <PeptideDosagesIntelPanel currentDoseBlock={currentDoseBlock} meta={PEPTIDEDOSAGES_META[pep.id]} />;
    case "peptide-db":
      return <PeptideDbIntelPanel currentDoseBlock={currentDoseBlock} meta={PEPTIDEDB_META[pep.id]} />;
    case "pep-pedia":
    default:
      return <PepPediaIntelPanel pep={pep} currentDoseBlock={currentDoseBlock} />;
  }
}

export default function MyStackView({
  state,
  onNavigate,
  onBack
}: {
  state: ProtocolBuilderState;
  onNavigate: (view: ProtocolSubView) => void;
  onBack: () => void;
}) {
  const {
    selectedPeptides,
    removePeptide,
    activeInteractions,
    expandedIntel,
    toggleIntel,
    doseConfigByPeptide,
    selectedGoalOptionByPeptide,
    getEffectiveSource,
    currentProtocolWeek
  } = state;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider uppercase text-gold-400 hover:text-gold-300 transition cursor-pointer"
        >
          <ArrowLeft size={12} />
          Protocol Builder
        </button>
      </div>

      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">My Stack</h1>
        <p className="text-sm text-slate-400 mt-1">
          The peptides in your protocol and their pharmacokinetics — half-life, T-max, route and mechanism.
        </p>
      </div>

      {selectedPeptides.length === 0 ? (
        <div className="p-10 text-center bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl space-y-3">
          <p className="text-sm text-slate-400">Your stack is empty.</p>
          <button
            type="button"
            onClick={() => onNavigate("create")}
            className="app-action-button app-action-button-active bg-gold-500/15 border-gold-400/70 text-gold-300 hover:border-gold-300 hover:bg-gold-500/20 px-4 py-2.5 font-bold rounded-xl text-xs cursor-pointer inline-flex items-center gap-1.5"
          >
            <Sparkles size={13} />
            Add peptides
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {selectedPeptides.map((pep) => {
              const colors = getColorClasses(pep.id);
              const isExpanded = !!expandedIntel[pep.id];
              const config = doseConfigByPeptide[pep.id];
              const selectedOptionId = selectedGoalOptionByPeptide[pep.id];
              const selectedOption = pep.goalDoseOptions?.find((option) => option.id === selectedOptionId);
              const doesOptionMatchConfig = (option?: (typeof pep.goalDoseOptions)[number]) =>
                !!config &&
                !!option?.timelineSchedule &&
                option.timelineSchedule.amount === config.amount &&
                option.timelineSchedule.unit === config.unit &&
                option.timelineSchedule.frequency === config.frequency;
              const isTitrating = !!config?.titrationSteps?.length;
              // Only trust the remembered goal selection if it still matches the peptide's actual
              // dose — a Manual-mode edit can move the dose away from the preset it started from.
              const currentDoseOption =
                !isTitrating &&
                (doesOptionMatchConfig(selectedOption) ? selectedOption : pep.goalDoseOptions?.find((option) => doesOptionMatchConfig(option)));
              const currentDoseBlock = (isTitrating || currentDoseOption || config) && (
                <div className="space-y-2">
                  <span className="font-mono text-[12px] uppercase tracking-wider text-gold-400 block">YOUR CURRENT DOSE</span>
                  <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/40 space-y-2">
                    {isTitrating && config?.titrationSteps ? (
                      (() => {
                        const nowDose = resolveDoseForWeek(config, currentProtocolWeek);
                        return (
                          <div>
                            <span className="text-[12px] font-bold uppercase px-2 py-0.5 rounded bg-gold-500/10 text-gold-400">
                              🔁 Auto-titrating — week {currentProtocolWeek}
                            </span>
                            <div className="text-xs font-semibold text-white mt-1">
                              {nowDose.amount}
                              {nowDose.unit}
                            </div>
                            <div className="text-[12px] text-slate-500 mt-1 leading-relaxed">
                              {config.titrationSteps.map((s) => `${s.amount}${s.unit} (wk${s.startWeek})`).join(" → ")}
                            </div>
                          </div>
                        );
                      })()
                    ) : currentDoseOption ? (
                      <div>
                        <span className="text-[12px] font-bold uppercase px-2 py-0.5 rounded bg-gold-500/10 text-gold-400">
                          {currentDoseOption.label}
                        </span>
                        <div className="text-xs font-semibold text-white mt-1">{currentDoseOption.doseText}</div>
                        {currentDoseOption.frequencyText && (
                          <div className="text-[12px] text-slate-500 font-mono uppercase tracking-wider">
                            {currentDoseOption.frequencyText}
                          </div>
                        )}
                      </div>
                    ) : (
                      config && (
                        <div>
                          <span className="text-[12px] font-bold uppercase px-2 py-0.5 rounded bg-gold-500/10 text-gold-400">Custom dose</span>
                          <div className="text-xs font-semibold text-white mt-1">
                            {config.amount}
                            {config.unit}
                          </div>
                          <div className="text-[12px] text-slate-500 font-mono uppercase tracking-wider">{config.frequency}</div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
              return (
                <div key={pep.id} className={`rounded-xl border ${colors.border} bg-slate-900/40 overflow-hidden`}>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                        <span className="text-sm font-bold text-white">{pep.name}</span>
                        <span className="text-[11px] font-mono text-slate-500 uppercase">{pep.category}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePeptide(pep.id)}
                        className="p-1 text-slate-500 hover:text-slate-200 transition cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800/40 text-xs">
                      <div>
                        <div className="text-slate-500 text-[12px]">Half-life</div>
                        <div className="font-semibold text-white font-mono mt-0.5">{pep.halfLife}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[12px]">T-max</div>
                        <div className="font-semibold text-white font-mono mt-0.5">{pep.peakTime}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[12px]">Route</div>
                        <div className="font-semibold text-white font-mono mt-0.5">{getDistinctRoutes(pep).join(" / ")}</div>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <div className="text-slate-500 text-[12px]">Cycle</div>
                        <div className="font-semibold text-white text-[12px] leading-tight mt-0.5">{pep.cycle}</div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-gold-400">Mechanism</span>
                      <p className="text-sm text-slate-400 leading-relaxed">{pep.description}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleIntel(pep.id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left border-t border-slate-800/60 hover:bg-slate-800/30 transition cursor-pointer"
                  >
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Protocol intelligence</span>
                    <div className="flex items-center space-x-4">
                      <span className="text-[12px] font-mono text-slate-500 hidden sm:inline">
                        t½ {pep.halfLife} • peak {pep.peakTime} • {pep.bestTime}
                      </span>
                      {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-slate-800/80 bg-slate-950/40 overflow-hidden"
                      >
                        {renderIntelPanel(getEffectiveSource(pep.id), pep, currentDoseBlock)}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-gold-950/15 border border-gold-900/35 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-gold-400">
              <span className="flex items-center space-x-1.5">
                <Info size={14} />
                <span>Stack analysis • {activeInteractions.length} documented interactions</span>
              </span>
              <span className="text-[12px] font-mono text-gold-500">
                {activeInteractions.filter((i) => i.interaction.type === "Synergy").length} synergy •{" "}
                {activeInteractions.filter((i) => i.interaction.type === "Compatible").length} compatible
              </span>
            </div>

            <div className="divide-y divide-gold-900/20 max-h-64 overflow-y-auto space-y-2.5 pt-1">
              {activeInteractions.map(({ interaction, nameA, nameB, idA, idB }) => (
                <div key={idA + "-" + idB} className="pt-2.5 first:pt-0 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">
                      {nameA} ↔ {nameB}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[12px] font-bold ${
                        interaction.type === "Synergy" ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {interaction.type}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed">{interaction.description}</p>
                  <div className="flex space-x-2 text-[12px] font-mono text-gold-400/80 pt-0.5">
                    <span className="flex items-center space-x-0.5">
                      <span>{idA}</span>
                      <ExternalLink size={8} />
                    </span>
                    <span className="flex items-center space-x-0.5">
                      <span>{idB}</span>
                      <ExternalLink size={8} />
                    </span>
                  </div>
                </div>
              ))}
              {activeInteractions.length === 0 && (
                <div className="text-center py-2 text-slate-500 italic text-sm">
                  No active adverse or synergistic interactions reported for this specific stack combination.
                </div>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  );
}
