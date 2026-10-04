/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect, Suspense, lazy } from "react";
import { Show, UserButton, useAuth } from "@clerk/react";
import ProtocolBuilder from "./components/ProtocolBuilder";
import ShopView from "./components/shop/ShopView";
import MyAccount, { type AccountTab } from "./components/MyAccount";
import NotificationBell from "./components/NotificationBell";
import { useNotifications } from "./hooks/useNotifications";
import ReconstitutionCalc from "./components/ReconstitutionCalc";
import TrackingManager from "./components/TrackingManager";
import DashboardPage from "./components/DashboardPage";
import AuthPage from "./components/AuthPage";
import PeptideDatabase from "./components/PeptideDatabase";
import ErrorBoundary from "./components/ErrorBoundary";
import LoadingSpinner from "./components/LoadingSpinner";
import { useBusiness } from "./hooks/useBusiness";
import { setWantsToStartBusiness, wantsToStartBusiness } from "./lib/business";
import {
  BillingScreen,
  BusinessErrorScreen,
  NoBusinessScreen,
  ScreenFrame,
  ShopUnavailableScreen,
  StartBusinessScreen,
} from "./components/business/BusinessScreens";
import { LibraryGate, PeptideLibraryProvider } from "./hooks/usePeptideLibrary";
import { useWaitingOrders } from "./hooks/useWaitingOrders";
import type { AdminSection } from "./components/admin/AdminArea";
import {
  Beaker,
  Scale,
  ClipboardList,
  ShieldAlert,
  BookOpen,
  ExternalLink,
  Menu,
  X,
  LayoutGrid,
  Lock,
  LayoutDashboard,
  ShoppingBag,
  FlaskConical,
  Truck,
  Boxes,
  Receipt,
  Users,
  Package,
  MapPin,
  ShoppingCart,
  Inbox,
  Landmark,
  Tags,
  Store,
} from "lucide-react";

// Owner-only; loaded on demand so customers never download it.
const AdminArea = lazy(() => import("./components/admin/AdminArea"));

type ActiveTab = "dashboard" | "protocol" | "shop" | "account" | "recon" | "logs" | "peptideDb" | "admin";

const ADMIN_SECTIONS: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={13} /> },
  { id: "new-orders", label: "New Orders", icon: <Inbox size={13} /> },
  { id: "sales", label: "Customer Orders", icon: <ShoppingBag size={13} /> },
  { id: "customers", label: "Customers", icon: <Users size={13} /> },
  { id: "peptide-orders", label: "Peptide Orders", icon: <FlaskConical size={13} /> },
  { id: "supply-orders", label: "Supply Orders", icon: <Truck size={13} /> },
  { id: "inventory", label: "Inventory", icon: <Boxes size={13} /> },
  { id: "expenses", label: "Expenses", icon: <Receipt size={13} /> },
  { id: "price-list", label: "Price List", icon: <Tags size={13} /> },
];
// Business and Payment Details are opened from the profile picture menu instead (see accountButton).

export default function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [adminSection, setAdminSection] = useState<AdminSection>("overview");
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

  const signedIn = isLoaded && sessionChecked && hasValidSession;
  // Which business the app is being used as; the app only opens once it's usable (see gateScreen).
  const { state: businessState, refresh: refreshBusiness } = useBusiness(signedIn);
  const [startingBusiness, setStartingBusiness] = useState(wantsToStartBusiness);
  const context = businessState.status === "ready" ? businessState.context : null;
  useEffect(() => {
    // Already runs a business: nothing to set up.
    if (startingBusiness && context?.isAdmin) {
      setWantsToStartBusiness(false);
      setStartingBusiness(false);
    }
  }, [startingBusiness, context]);
  const appReady = context != null && context.access === "ok" && !startingBusiness;
  const isAdmin = appReady && context.isAdmin;
  const businessName = context?.business.name ?? "PepPal";
  useEffect(() => {
    document.title = businessName;
  }, [businessName]);

  const {
    waiting: newOrders,
    paymentsToCheck,
    total: waitingOrders,
    refresh: refreshWaitingOrders,
  } = useWaitingOrders(isAdmin);
  const notifications = useNotifications(appReady);
  // Moving around the app also checks for new notifications / waiting orders, so they show up promptly.
  const refreshNotifications = notifications.refresh;
  // ...and that the subscription is still running.
  useEffect(() => {
    void refreshNotifications();
    void refreshWaitingOrders();
    void refreshBusiness();
  }, [activeTab, adminSection, refreshNotifications, refreshWaitingOrders, refreshBusiness]);
  const [accountTab, setAccountTab] = useState<AccountTab>("orders");

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
    if (tab === "admin") {
      // Clicking the top-level Admin link always lands on the overview, like the other hubs.
      setAdminSection("overview");
    }

    // Reset internal page scroller on every navigation, even when re-clicking the current tab.
    requestAnimationFrame(() => {
      if (mainScrollerRef.current) {
        mainScrollerRef.current.scrollTop = 0;
      }
    });
  }, []);

  const openAccount = useCallback(
    (tab: AccountTab) => {
      setAccountTab(tab);
      navigateTab("account");
    },
    [navigateTab]
  );

  const navigateAdmin = useCallback((section: AdminSection) => {
    setIsMobileMenuOpen(false);
    setActiveTab("admin");
    setAdminSection(section);
    requestAnimationFrame(() => {
      if (mainScrollerRef.current) {
        mainScrollerRef.current.scrollTop = 0;
      }
    });
  }, []);

  // Profile picture menu: the customer's orders and details live here, alongside Clerk's account settings.
  // The owner gets their business settings and payment details instead (they don't order from their own
  // shop). Clerk only accepts its own menu items here, so each menu is a separate tree.
  const accountButton = isAdmin ? (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Action label="Business" labelIcon={<Store size={15} />} onClick={() => navigateAdmin("business")} />
        <UserButton.Action label="Payment details" labelIcon={<Landmark size={15} />} onClick={() => navigateAdmin("payment-details")} />
        <UserButton.Action label="manageAccount" />
        <UserButton.Action label="signOut" />
      </UserButton.MenuItems>
    </UserButton>
  ) : (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Action label="My orders" labelIcon={<Package size={15} />} onClick={() => openAccount("orders")} />
        <UserButton.Action label="My details" labelIcon={<MapPin size={15} />} onClick={() => openAccount("details")} />
        <UserButton.Action label="manageAccount" />
        <UserButton.Action label="signOut" />
      </UserButton.MenuItems>
    </UserButton>
  );

  // Renders the appropriate component based on the active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardPage setActiveTab={navigateTab} />;
      case "protocol":
        return (
          <LibraryGate>
            <ProtocolBuilder key={protocolResetKey} />
          </LibraryGate>
        );
      case "shop":
        return <ShopView onOpenAccount={openAccount} />;
      case "account":
        return <MyAccount initialTab={accountTab} onShop={() => navigateTab("shop")} />;
      case "recon":
        return <ReconstitutionCalc />;
      case "logs":
        return <TrackingManager />;
      case "peptideDb":
        return (
          <LibraryGate>
            <PeptideDatabase />
          </LibraryGate>
        );
      case "admin":
        return isAdmin ? (
          <Suspense fallback={<LoadingSpinner label="Loading admin..." />}>
            <AdminArea
              section={adminSection}
              onNavigate={navigateAdmin}
              newOrders={newOrders}
              paymentsToCheck={paymentsToCheck}
              onOrdersChanged={() => void refreshWaitingOrders()}
              business={context!}
              onBusinessChanged={() => void refreshBusiness()}
            />
          </Suspense>
        ) : (
          <DashboardPage setActiveTab={navigateTab} />
        );
      default:
        return <DashboardPage setActiveTab={navigateTab} />;
    }
  };

  // Shown instead of the app until it can be used: setting up a business, starting or restarting its
  // subscription, or (for customers) opening their shop's link.
  const gateScreen = () => {
    if (startingBusiness && businessState.status !== "loading" && !context?.isAdmin) {
      return (
        <StartBusinessScreen
          onCancel={() => {
            setWantsToStartBusiness(false);
            setStartingBusiness(false);
          }}
          onCreated={() => {
            setStartingBusiness(false);
            void refreshBusiness();
          }}
        />
      );
    }
    switch (businessState.status) {
      case "no-business":
      case "shop-not-found":
        return <NoBusinessScreen shopNotFound={businessState.status === "shop-not-found"} onStart={() => setStartingBusiness(true)} />;
      case "error":
        return <BusinessErrorScreen message={businessState.message} onRetry={() => void refreshBusiness()} />;
      case "ready":
        return businessState.context.isAdmin ? (
          <BillingScreen context={businessState.context} onChanged={() => void refreshBusiness()} />
        ) : (
          <ShopUnavailableScreen context={businessState.context} />
        );
      default:
        return (
          <ScreenFrame footer={false}>
            <LoadingSpinner label="Loading..." />
          </ScreenFrame>
        );
    }
  };

  return (
    <>
      {signedIn && !appReady && gateScreen()}
      {signedIn && appReady && (
        <div className="h-dvh bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans select-none antialiased relative overflow-hidden">
          {/* GLOWING AMBIENT CORNER BACKDROPS (No Tech-Larping, pure elegant design) */}
          <div className="absolute top-0 left-0 w-[25rem] h-[25rem] bg-gold-500/5 rounded-full blur-[120px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-[25rem] h-[25rem] bg-gold-500/5 rounded-full blur-[120px] pointer-events-none translate-x-1/2 translate-y-1/2" />

          {/* DESKTOP LEFT SIDEBAR */}
          <aside className="hidden md:flex flex-col w-64 bg-slate-950/90 border-r border-slate-900/80 sticky top-0 h-dvh p-5 gap-4 flex-shrink-0 z-30">
            <div className="app-side-scroller flex-1 min-h-0 overflow-y-auto -mr-3 pr-3 space-y-8">
              {/* Brand Logo & Name */}
              <div className="flex items-center px-1">
                <div className="flex items-center gap-1">
                  <div className="h-9 w-6 flex items-center justify-center">
                    <img
                      src={context?.business.logoUrl ?? "/favicon.png"}
                      alt=""
                      className="h-6 w-6 object-contain rounded"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 -ml-0.5">
                    <span className="text-lg font-black text-white tracking-tight leading-tight">{businessName}</span>
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
                      onClick={() => navigateTab("shop")}
                      id="sidebar-btn-shop"
                      className={`flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs transition cursor-pointer font-bold ${activeTab === "shop"
                        ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60"
                        : "text-slate-400 hover:text-white hover:bg-slate-900/40"
                        }`}
                    >
                      <ShoppingCart size={14} />
                      <span>Shop</span>
                    </button>
                  </div>
                </div>

                {isAdmin && (
                  <div className="space-y-1.5">
                    <button
                      onClick={() => navigateTab("admin")}
                      id="sidebar-btn-admin"
                      className={`flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs transition cursor-pointer font-bold ${activeTab === "admin"
                        ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60"
                        : "text-slate-400 hover:text-white hover:bg-slate-900/40"
                        }`}
                    >
                      <Lock size={14} />
                      <span>Admin</span>
                      {waitingOrders > 0 && activeTab !== "admin" && <WaitingBadge count={waitingOrders} />}
                    </button>

                    {activeTab === "admin" && (
                      <div className="ml-3.5 pl-3 border-l border-slate-800 space-y-0.5">
                        {ADMIN_SECTIONS.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => navigateAdmin(s.id)}
                            className={`w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-[11px] transition cursor-pointer font-semibold ${adminSection === s.id
                              ? "text-gold-400"
                              : "text-slate-500 hover:text-white"
                              }`}
                          >
                            {s.icon}
                            <span>{s.label}</span>
                            {s.id === "new-orders" && waitingOrders > 0 && <WaitingBadge count={waitingOrders} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </nav>
            </div>

            <div className="px-2 pb-1 flex items-center gap-2 flex-shrink-0">
              <div className="rounded-3xl bg-transparent px-2 py-1.5 w-fit">
                {accountButton}
              </div>
              <NotificationBell
                  items={notifications.items}
                  unread={notifications.unread}
                  onOpen={() => void notifications.markAllRead()}
                  onSelect={() => openAccount("orders")}
                  placement="up"
                />
            </div>
          </aside>

          {/* MOBILE HEADER BAR */}
          <header className="md:hidden sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-900 w-full">
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-8 w-5 flex items-center justify-center">
                  <img
                    src={context?.business.logoUrl ?? "/favicon.png"}
                    alt=""
                    className="h-5 w-5 object-contain rounded"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <span className="text-base font-black text-white tracking-tight truncate">{businessName}</span>
              </div>

              <div className="flex items-center gap-3">
                <NotificationBell
                  items={notifications.items}
                  unread={notifications.unread}
                  onOpen={() => void notifications.markAllRead()}
                  onSelect={() => openAccount("orders")}
                  placement="down"
                />
                <div className="rounded-3xl bg-transparent px-2 py-1.5">
                  {accountButton}
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
                      navigateTab("shop");
                    }}
                    className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === "shop" ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60" : "text-slate-400 hover:text-white"
                      }`}
                  >
                    <ShoppingCart size={14} />
                    <span>Shop</span>
                  </button>
                </div>

                {isAdmin && (
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => {
                        navigateTab("admin");
                      }}
                      className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === "admin" ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60" : "text-slate-400 hover:text-white"
                        }`}
                    >
                      <Lock size={14} />
                      <span>Admin</span>
                      {waitingOrders > 0 && activeTab !== "admin" && <WaitingBadge count={waitingOrders} />}
                    </button>

                    {activeTab === "admin" && (
                      <div className="ml-4 pl-3 border-l border-slate-800 space-y-0.5 mt-1">
                        {ADMIN_SECTIONS.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => navigateAdmin(s.id)}
                            className={`w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-[11px] transition cursor-pointer font-semibold ${adminSection === s.id
                              ? "text-gold-400"
                              : "text-slate-500 hover:text-white"
                              }`}
                          >
                            {s.icon}
                            <span>{s.label}</span>
                            {s.id === "new-orders" && waitingOrders > 0 && <WaitingBadge count={waitingOrders} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </nav>
            )}
          </header>

          {/* RIGHT SIDE STREAM CONTENT & MAIN AREA */}
          <div ref={mainScrollerRef} className="app-main-scroller flex-1 min-h-0 flex flex-col overflow-y-auto">
            <main className="flex-1 px-4 md:px-8 lg:px-12 py-8 md:py-10 max-w-7xl w-full mx-auto">
              <PeptideLibraryProvider>
                <ErrorBoundary key={activeTab}>{renderTabContent()}</ErrorBoundary>
              </PeptideLibraryProvider>
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

// Count of shop orders waiting to be confirmed, shown on the admin menu.
function WaitingBadge({ count }: { count: number }) {
  return (
    <span className="ml-auto min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black flex items-center justify-center tabular-nums">
      {count}
    </span>
  );
}
