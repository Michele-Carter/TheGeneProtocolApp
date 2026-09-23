/// <reference types="react" />
/** @jsxRuntime classic */
/** @jsx React.createElement */
import React from "react";
import {
  Beaker,
  Search,
  Scale,
  ClipboardList,
  ArrowRight,
  BookOpen
} from "lucide-react";
import { PEPTIDEDB_ENTRIES } from "../data/peptideDb";

declare global {
  namespace JSX {
    type Element = any;
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

interface DashboardPageProps {
  setActiveTab: (tab: "dashboard" | "protocol" | "pricing" | "recon" | "logs" | "peptideDb") => void;
}

export default function DashboardPage({ setActiveTab }: DashboardPageProps) {
  // Define the main navigation tiles
  const dashboardTiles = [
    {
      id: "protocol" as const,
      title: "Protocol Builder",
      description: "Design custom peptide stacks, map dosing schedules, and plot complete cycle calendars.",
      icon: Beaker,
      badge: "Schedules & Cycles",
      color: "from-gold-500 to-emerald-500",
      accentText: "text-gold-400",
      bgHover: "hover:border-gold-500/30 hover:bg-gold-950/5",
      borderColor: "border-gold-500/40",
      borderStates: "focus-within:border-gold-500 hover:border-gold-500/70",
    },
    {
      id: "pricing" as const,
      title: "Pricing",
      description: "Browse our current product lineup and pricing by vial size.",
      icon: Search,
      badge: "Product Catalog",
      color: "from-gold-500 to-blue-500",
      accentText: "text-gold-400",
      bgHover: "hover:border-gold-500/30 hover:bg-gold-950/5",
      borderColor: "border-gold-500/40",
      borderStates: "focus-within:border-gold-500 hover:border-gold-500/70",
    },
    {
      id: "recon" as const,
      title: "Dosage & Reconstitution",
      description: "Determine exact sterile water volume, verify syringe unit markings, and run concentration calculations.",
      icon: Scale,
      badge: "Reconstitution Engine",
      color: "from-gold-500 to-gold-500",
      accentText: "text-gold-400",
      bgHover: "hover:border-gold-500/30 hover:bg-gold-950/5",
      borderColor: "border-gold-500/40",
      borderStates: "focus-within:border-gold-500 hover:border-gold-500/70",
    },
    {
      id: "logs" as const,
      title: "Research Logs",
      description: "Record research subject weight progress, log shot times/sites, and track daily calorie/macro levels.",
      icon: ClipboardList,
      badge: "Administration & Subject logs",
      color: "from-gold-500 to-gold-500",
      accentText: "text-gold-400",
      bgHover: "hover:border-gold-500/30 hover:bg-gold-950/5",
      borderColor: "border-gold-500/40",
      borderStates: "focus-within:border-gold-500 hover:border-gold-500/70",
    },
    {
      id: "peptideDb" as const,
      title: "Peptide Database",
      description: "Browse molecular data, dosing protocols, interactions, and safety information compiled from peptide-db.com.",
      icon: BookOpen,
      badge: `${PEPTIDEDB_ENTRIES.length} peptides`,
      color: "from-gold-500 to-blue-500",
      accentText: "text-gold-400",
      bgHover: "hover:border-gold-500/30 hover:bg-gold-950/5",
      borderColor: "border-gold-500/40",
      borderStates: "focus-within:border-gold-500 hover:border-gold-500/70",
    },
  ];

  return (
    <div className="space-y-12">
      {/* TOOLS NAVIGATION TILES GRID */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-black text-white tracking-tight">Suite Launcher</h2>
            <p className="text-sm text-slate-400">Launch any of PepPal's tools instantly.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dashboardTiles.map((tile) => {
            const IconComponent = tile.icon;
            return (
              <div
                key={tile.id}
                onClick={() => setActiveTab(tile.id)}
                id={`launch-tile-${tile.id}`}
                className={`dashboard-tile p-6 bg-slate-900/40 rounded-2xl border ${tile.borderColor} ${tile.borderStates} transition-all duration-300 cursor-pointer flex flex-col justify-between ${tile.bgHover} group hover:-translate-y-0.5`}
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className={`p-3 bg-slate-950 border border-current rounded-xl ${tile.accentText} group-hover:scale-105 transition-transform`}>
                      <IconComponent size={18} />
                    </div>
                    <span className="text-[12px] font-light uppercase tracking-normal bg-slate-950 border border-slate-400 px-2 py-0.5 rounded-sm text-slate-500">
                      {tile.badge}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="text-sm font-black text-white flex items-center gap-1">
                      <span>{tile.title}</span>
                      <ArrowRight size={12} className="text-slate-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      {tile.description}
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-3 border-t border-slate-900/40 flex items-center justify-between text-[12px] font-bold uppercase tracking-wider text-slate-500 group-hover:text-gold-400 transition-colors">
                  <span>Launch Tool</span>
                  <ArrowRight size={10} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
