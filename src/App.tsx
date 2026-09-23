/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Show, UserButton, useAuth } from "@clerk/react";
import ProtocolBuilder from "./components/ProtocolBuilder";
import MyPricing from "./components/MyPricing";
import ReconstitutionCalc from "./components/ReconstitutionCalc";
import TrackingManager from "./components/TrackingManager";
import DashboardPage from "./components/DashboardPage";
import AuthPage from "./components/AuthPage";
import PeptideDatabase from "./components/PeptideDatabase";
import ErrorBoundary from "./components/ErrorBoundary";
import { Beaker, Search, Scale, ClipboardList, ShieldAlert, BookOpen, ExternalLink, Menu, X, LayoutGrid } from "lucide-react";

type ActiveTab = "dashboard" | "protocol" | "pricing" | "recon" | "logs" | "peptideDb";

export default function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mainScrollerRef = useRef<HTMLDivElement>(null);

  const [protocolResetKey, setProtocolResetKey] = useState(0);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasValidSession, setHasValidSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function validateSession() {
      if (!isLoaded) {
        if (!cancelled) {
          setSessionChecked(false);
          setHasValidSession(false);
        }
        return;
      }

      if (!isSignedIn) {
        if (!cancelled) {
          setSessionChecked(true);
          setHasValidSession(false);
        }
        return;
      }

      try {
        const token = await getToken();
        if (!cancelled) {
          setHasValidSession(Boolean(token));
          setSessionChecked(true);
        }
      } catch {
        if (!cancelled) {
          setHasValidSession(false);
          setSessionChecked(true);
        }
      }
    }

    void validateSession();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    // Keep each tab landing at the top so page headers are always fully visible.
    if (mainScrollerRef.current) {
      mainScrollerRef.current.scrollTop = 0;
    }
  }, [activeTab]);


  const navigateTab = useCallback((tab: ActiveTab) => {
    setIsMobileMenuOpen(false);
    setActiveTab(tab);
    if (tab === "protocol") {
      // Force ProtocolBuilder to remount so it resets to its hub sub-view,
      // even when activeTab was already "protocol" (deep in a sub-view).
      setProtocolResetKey((key) => key + 1);
    }

    // Reset internal page scroller on every navigation, even when re-clicking the current tab.
    requestAnimationFrame(() => {
      if (mainScrollerRef.current) {
        mainScrollerRef.current.scrollTop = 0;
      }
    });
  }, []);

  // Renders the appropriate component based on the active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardPage setActiveTab={navigateTab} />;
      case "protocol":
        return <ProtocolBuilder key={protocolResetKey} />;
      case "pricing":
        return <MyPricing />;
      case "recon":
        return <ReconstitutionCalc />;
      case "logs":
        return <TrackingManager />;
      case "peptideDb":
        return <PeptideDatabase />;
      default:
        return <DashboardPage setActiveTab={navigateTab} />;
    }
  };

  return (
    <>
      {isLoaded && sessionChecked && hasValidSession && (
        <div className="h-dvh bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans select-none antialiased relative overflow-hidden">
          {/* GLOWING AMBIENT CORNER BACKDROPS (No Tech-Larping, pure elegant design) */}
          <div className="absolute top-0 left-0 w-[25rem] h-[25rem] bg-gold-500/5 rounded-full blur-[120px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-[25rem] h-[25rem] bg-gold-500/5 rounded-full blur-[120px] pointer-events-none translate-x-1/2 translate-y-1/2" />

          {/* DESKTOP LEFT SIDEBAR */}
          <aside className="hidden md:flex flex-col w-64 bg-slate-950/90 border-r border-slate-900/80 sticky top-0 min-h-dvh p-5 justify-between flex-shrink-0 z-30">
            <div className="space-y-8">
              {/* Brand Logo & Name */}
              <div className="flex items-center px-1">
                <div className="flex items-center gap-1">
                  <div className="h-9 w-6 flex items-center justify-center">
                    <img
                      src="/favicon.png"
                      alt="PepPal icon"
                      className="h-6 w-6 object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 -ml-0.5">
                    <span className="text-lg font-black text-white tracking-tight leading-none font-mono">PepPal</span>
                    <span className="text-[12px] font-mono tracking-wider text-slate-500 px-0.5 py-0.5">v1.2</span>
                  </div>
                </div>
              </div>

              {/* Navigation Links List */}
              <nav className="flex flex-col space-y-4">
                <div>
                  <button
                    onClick={() => navigateTab("dashboard")}
                    id="sidebar-btn-dashboard"
                    className={`flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs transition cursor-pointer font-bold ${activeTab === "dashboard"
                      ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60"
                      : "text-slate-400 hover:text-white hover:bg-slate-900/40"
                      }`}
                  >
                    <LayoutGrid size={14} />
                    <span>Dashboard Hub</span>
                  </button>
                </div>

                <div>
                  <div className="space-y-1.5">
                    <button
                      onClick={() => navigateTab("protocol")}
                      id="sidebar-btn-protocol"
                      className={`flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs transition cursor-pointer font-bold ${activeTab === "protocol"
                        ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60"
                        : "text-slate-400 hover:text-white hover:bg-slate-900/40"
                        }`}
                    >
                      <Beaker size={14} />
                      <span>Protocol Builder</span>
                    </button>

                    <button
                      onClick={() => navigateTab("recon")}
                      id="sidebar-btn-recon"
                      className={`flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs transition cursor-pointer font-bold ${activeTab === "recon"
                        ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60"
                        : "text-slate-400 hover:text-white hover:bg-slate-900/40"
                        }`}
                    >
                      <Scale size={14} />
                      <span>Dosage & Recon</span>
                    </button>

                    <button
                      onClick={() => navigateTab("logs")}
                      id="sidebar-btn-logs"
                      className={`flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs transition cursor-pointer font-bold ${activeTab === "logs"
                        ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60"
                        : "text-slate-400 hover:text-white hover:bg-slate-900/40"
                        }`}
                    >
                      <ClipboardList size={14} />
                      <span>Research Logs</span>
                    </button>

                    <button
                      onClick={() => navigateTab("peptideDb")}
                      id="sidebar-btn-peptideDb"
                      className={`flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs transition cursor-pointer font-bold ${activeTab === "peptideDb"
                        ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60"
                        : "text-slate-400 hover:text-white hover:bg-slate-900/40"
                        }`}
                    >
                      <BookOpen size={14} />
                      <span>Peptide Database</span>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="space-y-1.5">
                    <button
                      onClick={() => navigateTab("pricing")}
                      id="sidebar-btn-pricing"
                      className={`flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs transition cursor-pointer font-bold ${activeTab === "pricing"
                        ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60"
                        : "text-slate-400 hover:text-white hover:bg-slate-900/40"
                        }`}
                    >
                      <Search size={14} />
                      <span>Pricing</span>
                    </button>
                  </div>
                </div>
              </nav>
            </div>

            <div className="px-2 pb-1">
              <div className="rounded-3xl bg-transparent px-2 py-1.5 w-fit">
                <UserButton />
              </div>
            </div>
          </aside>

          {/* MOBILE HEADER BAR */}
          <header className="md:hidden sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-900 w-full">
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-8 w-5 flex items-center justify-center">
                  <img
                    src="/favicon.png"
                    alt="PepPal icon"
                    className="h-5 w-5 object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <span className="text-base font-black text-white tracking-tight font-mono">PepPal Hub</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-3xl bg-transparent px-2 py-1.5">
                  <UserButton />
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition"
                  aria-label="Toggle navigation menu"
                >
                  {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              </div>
            </div>

            {/* Mobile Dropdown Menu Panel */}
            {isMobileMenuOpen && (
              <nav className="absolute top-full left-0 right-0 z-50 border-b border-slate-900 bg-slate-950/95 backdrop-blur-md px-6 py-4 flex flex-col gap-4 shadow-2xl">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      navigateTab("dashboard");
                    }}
                    className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === "dashboard" ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60" : "text-slate-400 hover:text-white"
                      }`}
                  >
                    <LayoutGrid size={14} />
                    <span>Dashboard Hub</span>
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      navigateTab("protocol");
                    }}
                    className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === "protocol" ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60" : "text-slate-400 hover:text-white"
                      }`}
                  >
                    <Beaker size={14} />
                    <span>Protocol Builder</span>
                  </button>
                  <button
                    onClick={() => {
                      navigateTab("recon");
                    }}
                    className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === "recon" ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60" : "text-slate-400 hover:text-white"
                      }`}
                  >
                    <Scale size={14} />
                    <span>Dosage & Recon</span>
                  </button>
                  <button
                    onClick={() => {
                      navigateTab("logs");
                    }}
                    className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === "logs" ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60" : "text-slate-400 hover:text-white"
                      }`}
                  >
                    <ClipboardList size={14} />
                    <span>Research Logs</span>
                  </button>
                  <button
                    onClick={() => {
                      navigateTab("peptideDb");
                    }}
                    className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === "peptideDb" ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60" : "text-slate-400 hover:text-white"
                      }`}
                  >
                    <BookOpen size={14} />
                    <span>Peptide Database</span>
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      navigateTab("pricing");
                    }}
                    className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === "pricing" ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60" : "text-slate-400 hover:text-white"
                      }`}
                  >
                    <Search size={14} />
                    <span>Pricing</span>
                  </button>
                </div>
              </nav>
            )}
          </header>

          {/* RIGHT SIDE STREAM CONTENT & MAIN AREA */}
          <div ref={mainScrollerRef} className="app-main-scroller flex-1 min-h-0 flex flex-col overflow-y-auto">
            <main className="flex-1 px-4 md:px-8 lg:px-12 py-8 md:py-10 max-w-7xl w-full mx-auto">
              <ErrorBoundary key={activeTab}>{renderTabContent()}</ErrorBoundary>
            </main>

            {/* DISCLAIMER / RESEARCH-ONLY NOTICE */}
            <footer className="bg-transparent border-t border-slate-900/80 px-4 md:px-8 lg:px-12 py-6 text-center text-sm text-slate-500 leading-relaxed max-w-7xl w-full mx-auto">
              <div className="flex items-center justify-center space-x-1.5 text-red-500/80 font-bold mb-2 uppercase tracking-widest">
                <ShieldAlert size={14} />
              </div>
              <p className="max-w-2xl mx-auto">
                PepPal is an informational tool built from publicly compiled research guidelines on pep-pedia.org and attached price sheets. This system does not diagnose, treat, prevent, or cure any clinical conditions. All calculations, timelines, and comparisons are intended exclusively for standard pre-clinical lab modeling.
              </p>
              <div className="mt-4 flex items-center justify-center space-x-4 text-[12px] font-semibold">
                <a
                  href="https://pep-pedia.org"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-1.5 text-slate-400 hover:text-white transition"
                >
                  <BookOpen size={13} />
                  <span>pep-pedia.org</span>
                  <ExternalLink size={9} />
                </a>
                <span className="text-slate-800">•</span>
                <span className="text-slate-600">© 2026 PepPal Research Engine. All Rights Reserved.</span>
              </div>
            </footer>
          </div>
        </div>
      )}
      {isLoaded && sessionChecked && !hasValidSession && (
        <AuthPage />
      )}
    </>
  );
}
