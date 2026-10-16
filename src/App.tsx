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
import {
  forgetShopSlug,
  saveRegistration,
  setWantsToStartBusiness,
  shopSlug,
  showShopInAddress,
  wantsToStartBusiness,
} from "./lib/business";
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
import { PEPBIZ_ICON, setTabBranding } from "./lib/tabBranding";
import { useSetClerkBrandName } from "./lib/clerkBranding";
import { keepCustomerNotificationsOn } from "./lib/customerNotifications";
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
const BusinessSettingsView = lazy(() => import("./components/admin/BusinessSettingsView"));
const PaymentDetailsView = lazy(() => import("./components/admin/PaymentDetailsView"));
const SubscriptionEndingBanner = lazy(() => import("./components/admin/SubscriptionEndingBanner"));

// A page the owner opens from Manage account (Clerk's account window).
function AccountWindowPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="account-window-page space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-black text-white tracking-tight">{title}</h2>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      <Suspense fallback={<LoadingSpinner label="Loading..." />}>{children}</Suspense>
    </div>
  );
}

type ActiveTab = "dashboard" | "protocol" | "shop" | "account" | "recon" | "logs" | "peptideDb" | "admin";

// The owner's menu starts with their business, always open (the owner's home page is Overview).
const ADMIN_SECTIONS: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
  { id: "new-orders", label: "New Customer Orders", icon: <Inbox size={14} /> },
  { id: "sales", label: "Customer Orders", icon: <ShoppingBag size={14} /> },
  { id: "customers", label: "Customers", icon: <Users size={14} /> },
  { id: "peptide-orders", label: "Peptide Orders", icon: <FlaskConical size={14} /> },
  { id: "supply-orders", label: "Supply Orders", icon: <Truck size={14} /> },
  { id: "inventory", label: "Inventory", icon: <Boxes size={14} /> },
  { id: "expenses", label: "Expenses", icon: <Receipt size={14} /> },
  { id: "price-list", label: "Vendor Price List", icon: <Tags size={14} /> },
];
// Business and Payment Details are opened from the profile picture menu instead (see accountButton).

// Personal tools: the customer's main menu, and a smaller "My Tools" group at the bottom of the owner's.
const TOOLS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
  { id: "protocol", label: "Protocol Builder", icon: <Beaker size={14} /> },
  { id: "recon", label: "Dosage & Recon", icon: <Scale size={14} /> },
  { id: "logs", label: "Research Logs", icon: <ClipboardList size={14} /> },
  { id: "peptideDb", label: "Peptide Database", icon: <BookOpen size={14} /> },
];

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
      saveRegistration(null);
    }
  }, [startingBusiness, context]);
  const appReady = context != null && context.access === "ok" && !startingBusiness;
  const isAdmin = appReady && context.isAdmin;
  // Owners have no Dashboard Hub: their home is the business Overview.
  const currentTab: ActiveTab = isAdmin && activeTab === "dashboard" ? "admin" : activeTab;
  const businessName = context?.business.name ?? "PepBiz";
  // The business's own logo, if it has uploaded one - never the PepBiz badge in its place, for owners or
  // customers (a business without a logo just shows its name).
  const businessLogo = context?.business.logoUrl ?? null;
  const setClerkBrandName = useSetClerkBrandName();
  useEffect(() => {
    if (!context) return;
    // The browser tab: owners without a logo of their own see PepBiz's icon there, customers never do.
    setTabBranding(
      context.business.name,
      businessLogo ?? (context.isAdmin ? PEPBIZ_ICON : null),
      context.isAdmin ? null : context.business.slug
    );
    // Clerk's account windows: the shop's name for customers, PepBiz for owners.
    setClerkBrandName(context.isAdmin ? null : context.business.name);
  }, [context, businessLogo, setClerkBrandName]);
  useEffect(() => {
    // Owners always use their own business, so a shop link they opened (e.g. testing a shop) shouldn't keep
    // showing that shop on their sign-in page next time.
    if (context?.isAdmin && shopSlug()) forgetShopSlug();
    // Customers see their shop's link in the address bar; owners just pepbiz.io.
    if (context) showShopInAddress(context.isAdmin ? null : context.business.slug);
  }, [context]);

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

  // Tapping a notification opens the app at ?open=new-orders (owner) or ?open=orders (customer) - public/sw.js.
  useEffect(() => {
    if (!appReady) return;
    const params = new URLSearchParams(window.location.search);
    const open = params.get("open");
    if (open !== "new-orders" && open !== "orders") return;
    params.delete("open");
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", window.location.pathname + (rest ? `?${rest}` : ""));
    if (open === "new-orders" && isAdmin) navigateAdmin("new-orders");
    if (open === "orders" && !isAdmin) openAccount("orders");
  }, [appReady, isAdmin, navigateAdmin, openAccount]);

  // A customer's device that already allows notifications keeps getting them (e.g. after reinstalling the
  // browser), unless they turned them off.
  useEffect(() => {
    if (appReady && !isAdmin) void keepCustomerNotificationsOn(getToken).catch(() => {});
  }, [appReady, isAdmin, getToken]);

  // Profile picture menu: the customer's orders and details live here, alongside Clerk's account settings.
  // The owner (who doesn't order from their own shop) just has Manage account and Sign out; their business
  // settings and payment details are pages inside Manage account, next to Profile and Security.
  const accountButton = isAdmin ? (
    <UserButton>
      <UserButton.UserProfilePage label="Business" url="business" labelIcon={<Store size={15} />}>
        <AccountWindowPage
          title="Business"
          description="Your business name and logo, the link that brings customers to your shop, and your PepBiz subscription."
        >
          <BusinessSettingsView context={context!} onChanged={() => void refreshBusiness()} />
        </AccountWindowPage>
      </UserButton.UserProfilePage>
      <UserButton.UserProfilePage label="Payment details" url="payment-details" labelIcon={<Landmark size={15} />}>
        <AccountWindowPage
          title="Payment details"
          description="The bank account customers pay into. They only see it once you've confirmed their order."
        >
          <PaymentDetailsView />
        </AccountWindowPage>
      </UserButton.UserProfilePage>
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
    switch (currentTab) {
      case "dashboard":
        return <DashboardPage setActiveTab={navigateTab} isAdmin={isAdmin} waitingOrders={waitingOrders} />;
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
        return <DashboardPage setActiveTab={navigateTab} isAdmin={isAdmin} waitingOrders={waitingOrders} />;
    }
  };

  // The menu, in the desktop sidebar and the phone's menu. Owners: their business first and always open, then
  // their shop as customers see it, then their personal tools. Customers: the hub, the tools and the shop.
  const navMenu = (mobile: boolean) => {
    const group = mobile ? "flex flex-col gap-1" : "space-y-1.5";
    const tabLink = (id: ActiveTab, label: string, icon: React.ReactNode) => (
      <NavButton key={id} mobile={mobile} active={currentTab === id} onClick={() => navigateTab(id)} icon={icon} label={label} />
    );
    if (isAdmin) {
      return (
        <>
          <div className={group}>
            {ADMIN_SECTIONS.map((s) => (
              <NavButton
                key={s.id}
                mobile={mobile}
                active={currentTab === "admin" && adminSection === s.id}
                onClick={() => navigateAdmin(s.id)}
                icon={s.icon}
                label={s.label}
              >
                {s.id === "new-orders" && waitingOrders > 0 && <WaitingBadge count={waitingOrders} />}
              </NavButton>
            ))}
          </div>
          <div className={`${group} border-t border-slate-900 pt-4`}>{tabLink("shop", "View my shop", <Store size={14} />)}</div>
          <div className={`${group} border-t border-slate-900 pt-4`}>
            <p className={`${mobile ? "px-4" : "px-3.5"} pb-1 text-[10px] font-bold uppercase tracking-widest text-white`}>My Tools</p>
            {TOOLS.map((t) => tabLink(t.id, t.label, t.icon))}
          </div>
        </>
      );
    }
    return (
      <>
        <div className={group}>{tabLink("dashboard", "Dashboard Hub", <LayoutGrid size={14} />)}</div>
        <div className={group}>{TOOLS.map((t) => tabLink(t.id, t.label, t.icon))}</div>
        <div className={group}>{tabLink("shop", "Shop", <ShoppingCart size={14} />)}</div>
      </>
    );
  };

  // Shown instead of the app until it can be used: setting up a business, starting or restarting its
  // subscription, or (for customers) opening their shop's link.
  const gateScreen = () => {
    if (startingBusiness && businessState.status !== "loading" && !context?.isAdmin) {
      return (
        <StartBusinessScreen
          signedIn
          onCancel={() => {
            setWantsToStartBusiness(false);
            setStartingBusiness(false);
            saveRegistration(null);
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
          <aside className="hidden md:flex flex-col w-72 bg-slate-950/90 border-r border-slate-900/80 sticky top-0 h-dvh px-4 py-5 gap-4 flex-shrink-0 z-30">
            <div className="app-side-scroller flex-1 min-h-0 overflow-y-auto -mr-3 pr-3 space-y-8">
              {/* Brand Logo & Name */}
              <div className="flex items-center px-1 min-h-9">
                <div className="flex items-center gap-1">
                  {businessLogo && (
                    <div className="h-9 w-6 flex items-center justify-center">
                      <img
                        src={businessLogo}
                        alt=""
                        className="h-6 w-6 object-contain rounded"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 -ml-0.5">
                    <span className="text-lg font-black text-white tracking-tight leading-tight">{businessName}</span>
                  </div>
                </div>
              </div>

              {/* Navigation Links List */}
              <nav className="flex flex-col space-y-4">{navMenu(false)}</nav>
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
              <div className="flex items-center gap-1.5 min-h-8">
                {businessLogo && (
                  <div className="h-8 w-5 flex items-center justify-center">
                    <img
                      src={businessLogo}
                      alt=""
                      className="h-5 w-5 object-contain rounded"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
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
                  className="relative p-1.5 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition"
                  aria-label="Toggle navigation menu"
                >
                  {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                  {/* Waiting orders, so the owner sees them without opening the menu. */}
                  {isAdmin && waitingOrders > 0 && !isMobileMenuOpen && (
                    <span className="absolute -top-1 -right-1">
                      <WaitingBadge count={waitingOrders} />
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Mobile Dropdown Menu Panel */}
            {isMobileMenuOpen && (
              <nav className="absolute top-full left-0 right-0 z-50 border-b border-slate-900 bg-slate-950/95 backdrop-blur-md px-6 py-4 flex flex-col gap-4 shadow-2xl max-h-[calc(100dvh-4rem)] overflow-y-auto">
                {navMenu(true)}
              </nav>
            )}
          </header>

          {/* RIGHT SIDE STREAM CONTENT & MAIN AREA */}
          <div ref={mainScrollerRef} className="app-main-scroller flex-1 min-h-0 flex flex-col overflow-y-auto">
            <main className="flex-1 px-4 md:px-8 lg:px-12 py-8 md:py-10 max-w-7xl w-full mx-auto">
              {isAdmin && context?.billing?.cancelAtPeriodEnd && (
                <Suspense fallback={null}>
                  <SubscriptionEndingBanner
                    billing={context.billing}
                    waitingOrders={waitingOrders}
                    onResumed={() => void refreshBusiness()}
                  />
                </Suspense>
              )}
              <PeptideLibraryProvider>
                <ErrorBoundary key={currentTab}>{renderTabContent()}</ErrorBoundary>
              </PeptideLibraryProvider>
            </main>

            <footer className="bg-transparent border-t border-slate-900/80 px-4 md:px-8 lg:px-12 py-6 text-center text-[12px] font-semibold text-slate-600 max-w-7xl w-full mx-auto">
              © 2026 {context?.isAdmin ? "PepBiz" : businessName}. All Rights Reserved.
              {/* Owners: PepBiz's own policies. Customers: their shop's privacy notice (never PepBiz's). */}
              <span className="block mt-1.5 space-x-3">
                {context?.isAdmin ? (
                  <>
                    <a href="/privacy" target="_blank" rel="noreferrer" className="hover:text-slate-300">
                      Privacy Policy
                    </a>
                    <a href="/terms" target="_blank" rel="noreferrer" className="hover:text-slate-300">
                      Terms of Service
                    </a>
                  </>
                ) : (
                  context && (
                    <a href={`/shop/${context.business.slug}/privacy`} target="_blank" rel="noreferrer" className="hover:text-slate-300">
                      Privacy Notice
                    </a>
                  )
                )}
              </span>
            </footer>
          </div>
        </div>
      )}
      {/* Registering a business (/start): the details come first, then creating the login. */}
      {isLoaded && sessionChecked && !hasValidSession &&
        (startingBusiness ? (
          <StartBusinessScreen
            signedIn={false}
            onCancel={() => {
              setWantsToStartBusiness(false);
              setStartingBusiness(false);
              saveRegistration(null);
            }}
            onCreated={() => {}}
          />
        ) : (
          <AuthPage />
        ))}
    </>
  );
}

function NavButton({
  mobile,
  active,
  onClick,
  icon,
  label,
  children,
}: {
  mobile: boolean;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  children?: React.ReactNode;
}) {
  const shape = mobile ? "px-4 rounded-lg" : "px-3.5 rounded-xl";
  const look = active
    ? "bg-transparent text-gold-400 font-extrabold border border-gold-500/60"
    : `text-slate-400 hover:text-white${mobile ? "" : " hover:bg-slate-900/40"}`;
  return (
    <button onClick={onClick} className={`flex items-center space-x-2.5 py-2.5 text-xs transition cursor-pointer font-bold ${shape} ${look}`}>
      {icon}
      <span>{label}</span>
      {children}
    </button>
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
