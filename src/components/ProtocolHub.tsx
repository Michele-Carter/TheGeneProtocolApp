/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { Beaker, Sparkles, CalendarClock, Layers, ArrowRight, Plus, Pencil, Trash2, Check, X, Users, ChevronDown } from "lucide-react";
import { ProtocolBuilderState } from "../hooks/useProtocolBuilderState";
import { ProtocolsRegistry } from "../hooks/useProtocols";
import { ProtocolSubView } from "./ProtocolBuilder";
import { getAccentHex } from "../lib/protocolBuilderUtils";

export default function ProtocolHub({
  state,
  onNavigate,
  registry
}: {
  state: ProtocolBuilderState;
  onNavigate: (view: ProtocolSubView) => void;
  registry: ProtocolsRegistry;
}) {
  const { selectedPeptides, timelineGenerated, timeframeWeeks, currentProtocolWeek, dosesDueToday, dosesCompletedToday } = state;
  const showResumeBanner = timelineGenerated && selectedPeptides.length > 0;
  const { protocols, activeProtocolId, switchProtocol, createProtocol, renameProtocol, deleteProtocol } = registry;

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeProtocol = protocols.find((p) => p.id === activeProtocolId);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isDropdownOpen) {
      setConfirmDeleteId(null);
    }
  }, [isDropdownOpen]);

  const startCreate = () => {
    setIsCreating(true);
    setNewName("");
  };

  const submitCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      await createProtocol(trimmed);
      setIsCreating(false);
      setNewName("");
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const submitEdit = async () => {
    const trimmed = editName.trim();
    if (!editingId || !trimmed) return;
    setIsSaving(true);
    try {
      await renameProtocol(editingId, trimmed);
      setEditingId(null);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async (id: string) => {
    setIsSaving(true);
    try {
      await deleteProtocol(id);
      setConfirmDeleteId(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-500 pr-1">
          <Users size={13} /> Protocols
        </span>

        {protocols.length > 1 ? (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full pl-3.5 pr-3 py-1 border border-gold-500/50 bg-gold-500/15 text-gold-400 text-xs font-bold cursor-pointer outline-none transition hover:border-gold-500/70"
            >
              {activeProtocol?.name ?? "Select protocol"}
              <ChevronDown size={13} className={`transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {isDropdownOpen && (
              <div className="absolute left-0 top-full mt-2 w-60 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-20 py-1.5">
                <div className="max-h-64 overflow-y-auto">
                  {protocols.map((p) => {
                    const isActive = p.id === activeProtocolId;
                    const isEditing = editingId === p.id;

                    if (isEditing) {
                      return (
                        <div key={p.id} className="flex items-center gap-1 px-3 py-1.5">
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void submitEdit();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="flex-1 min-w-0 bg-slate-950 border border-gold-500/50 rounded-lg px-2 py-1 text-xs text-white outline-none"
                          />
                          <button type="button" onClick={() => void submitEdit()} disabled={isSaving} className="text-gold-400 hover:text-gold-300 p-1 cursor-pointer outline-none flex-shrink-0">
                            <Check size={13} />
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer outline-none flex-shrink-0">
                            <X size={13} />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={p.id}
                        className={`group flex items-center gap-1 px-3 py-1.5 hover:bg-slate-800/60 transition ${
                          isActive ? "text-gold-400" : "text-slate-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            switchProtocol(p.id);
                            setIsDropdownOpen(false);
                          }}
                          className="flex-1 min-w-0 text-left text-xs font-bold cursor-pointer outline-none truncate"
                        >
                          {p.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(p.id, p.name)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-white cursor-pointer outline-none flex-shrink-0"
                          title="Rename"
                        >
                          <Pencil size={11} />
                        </button>
                        {confirmDeleteId === p.id ? (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[10px] font-mono font-bold text-red-400 whitespace-nowrap">Confirm?</span>
                            <button
                              type="button"
                              onClick={() => void confirmDelete(p.id)}
                              disabled={isSaving}
                              className="p-1 text-red-400 hover:text-red-300 cursor-pointer outline-none"
                              title="Confirm delete"
                            >
                              <Check size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="p-1 text-slate-500 hover:text-slate-300 cursor-pointer outline-none"
                              title="Cancel"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(p.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400 cursor-pointer outline-none flex-shrink-0"
                            title="Delete"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-slate-800 mt-1.5 pt-1.5 px-3">
                  {isCreating ? (
                    <div className="flex items-center gap-1 py-1">
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Name (e.g. Mom)"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitCreate();
                          if (e.key === "Escape") setIsCreating(false);
                        }}
                        className="flex-1 min-w-0 bg-slate-950 border border-gold-500/50 rounded-lg px-2 py-1 text-xs text-white placeholder:text-slate-600 outline-none"
                      />
                      <button type="button" onClick={() => void submitCreate()} disabled={isSaving} className="text-gold-400 hover:text-gold-300 p-1 cursor-pointer outline-none flex-shrink-0">
                        <Check size={13} />
                      </button>
                      <button type="button" onClick={() => setIsCreating(false)} className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer outline-none flex-shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={startCreate}
                      className="w-full flex items-center gap-1.5 py-1.5 text-xs font-bold text-slate-500 hover:text-gold-400 transition cursor-pointer outline-none"
                    >
                      <Plus size={12} /> New protocol
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {protocols.map((p) => {
              const isEditing = editingId === p.id;

              if (isEditing) {
                return (
                  <div key={p.id} className="flex items-center gap-1 bg-slate-900/80 border border-gold-500/50 rounded-full pl-3 pr-1.5 py-1">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="bg-transparent text-xs text-white outline-none w-24"
                    />
                    <button type="button" onClick={() => void submitEdit()} disabled={isSaving} className="text-gold-400 hover:text-gold-300 p-1 cursor-pointer outline-none">
                      <Check size={13} />
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer outline-none">
                      <X size={13} />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={p.id}
                  className="group flex items-center gap-1 rounded-full pl-3.5 pr-1.5 py-1 border text-xs font-bold transition bg-gold-500/15 border-gold-500/50 text-gold-400"
                >
                  <span>{p.name}</span>
                  <button
                    type="button"
                    onClick={() => startEdit(p.id, p.name)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-white cursor-pointer outline-none"
                    title="Rename"
                  >
                    <Pencil size={11} />
                  </button>
                </div>
              );
            })}

            {isCreating ? (
              <div className="flex items-center gap-1 bg-slate-900/80 border border-gold-500/50 rounded-full pl-3 pr-1.5 py-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name (e.g. Mom)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitCreate();
                    if (e.key === "Escape") setIsCreating(false);
                  }}
                  className="bg-transparent text-xs text-white placeholder:text-slate-600 outline-none w-28"
                />
                <button type="button" onClick={() => void submitCreate()} disabled={isSaving} className="text-gold-400 hover:text-gold-300 p-1 cursor-pointer outline-none">
                  <Check size={13} />
                </button>
                <button type="button" onClick={() => setIsCreating(false)} className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer outline-none">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startCreate}
                className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-3 py-1 border border-dashed border-slate-700 text-xs font-bold text-slate-500 hover:border-gold-500/50 hover:text-gold-400 transition cursor-pointer outline-none"
              >
                <Plus size={12} /> New protocol
              </button>
            )}
          </>
        )}
      </div>

      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <span className="inline-flex items-center px-4 py-1.5 bg-zinc-800/60 border border-zinc-700 text-gold-400 rounded-full text-xs font-mono tracking-wider uppercase gap-2">
            <Beaker size={13} className="text-gold-400" />
            PROTOCOL BUILDER
          </span>
        </div>
        <h1 className="text-3xl md:text-5xl font-black text-white leading-tight tracking-tight max-w-3xl mx-auto">
          Start, resume, or manage your <span className="text-gold-400">research protocol.</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-2xl mx-auto leading-relaxed">
          Build a fresh protocol from the pep-pedia library, jump back into the one you're running, or manage the compounds in your stack.
        </p>
      </div>

      {showResumeBanner && (
        <button
          type="button"
          onClick={() => onNavigate("current")}
          className="w-full text-left p-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-4 hover:border-gold-500/50 transition cursor-pointer"
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center text-gold-400 flex-shrink-0">
              <Layers size={18} />
            </div>
            <div className="min-w-0">
              <span className="text-[12px] font-mono tracking-wider uppercase text-gold-400">In Progress</span>
              <div className="text-sm font-bold text-white truncate">
                Your protocol — {timeframeWeeks}-week plan
              </div>
              <div className="text-xs text-slate-400 truncate">
                {selectedPeptides.length} peptides · Week {currentProtocolWeek} of {timeframeWeeks} ·{" "}
                <span className="text-gold-400">
                  {dosesDueToday > 0 ? `${dosesCompletedToday} of ${dosesDueToday} doses done today` : "No doses due today"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center -space-x-1">
              {selectedPeptides.slice(0, 5).map((pep) => (
                <span
                  key={pep.id}
                  className="w-2.5 h-2.5 rounded-full border border-slate-950"
                  style={{ backgroundColor: getAccentHex(pep.id) }}
                />
              ))}
            </div>
            <ArrowRight size={18} className="text-gold-400" />
          </div>
        </button>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => onNavigate("create")}
          className="group text-left p-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-4 hover:border-gold-500/50 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex flex-col"
        >
          <div className="flex items-center justify-between">
            <div className="h-9 w-9 rounded-lg bg-gold-500/10 border border-gold-500/30 flex items-center justify-center text-gold-400 group-hover:scale-105 transition-transform">
              <Sparkles size={16} />
            </div>
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="text-lg font-bold text-white">Create & View Your Protocol</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Search the library, set the protocol start date, set each peptide's start day and dose, then generate your protocol calendar.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 group-hover:text-gold-400 transition-colors inline-flex items-center gap-1">
            Start building <ArrowRight size={12} />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("current")}
          className="group text-left p-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-4 hover:border-gold-500/50 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex flex-col"
        >
          <div className="flex items-center justify-between">
            <div className="h-9 w-9 rounded-lg bg-gold-500/10 border border-gold-500/30 flex items-center justify-center text-gold-400 group-hover:scale-105 transition-transform">
              <CalendarClock size={16} />
            </div>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
              {timelineGenerated ? `WEEK ${currentProtocolWeek} / ${timeframeWeeks}` : "NOT STARTED"}
            </span>
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="text-lg font-bold text-white">View Your Dosing Schedule</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              View your protocol in a Calendar. Choose from daily, weekly or monthly view, mark your dose when done and stay on top of your dose schedule.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 group-hover:text-gold-400 transition-colors inline-flex items-center gap-1">
            Your Protocol Calendar <ArrowRight size={12} />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("stack")}
          className="group text-left p-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-4 hover:border-gold-500/50 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex flex-col"
        >
          <div className="flex items-center justify-between">
            <div className="h-9 w-9 rounded-lg bg-gold-500/10 border border-gold-500/30 flex items-center justify-center text-gold-400 group-hover:scale-105 transition-transform">
              <Layers size={16} />
            </div>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
              {selectedPeptides.length} PEPTIDES
            </span>
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="text-lg font-bold text-white">My Stack</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              See the peptides added to your protocol and their pharmacokinetics - half-life, T-max, route and mechanism.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 group-hover:text-gold-400 transition-colors inline-flex items-center gap-1">
            View stack <ArrowRight size={12} />
          </span>
        </button>
      </div>
    </div>
  );
}
