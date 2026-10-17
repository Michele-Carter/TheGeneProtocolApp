import React, { useEffect } from "react";
import { SignInButton } from "@clerk/react";
import {
    ArrowRight,
    BellRing,
    Boxes,
    Calculator,
    Check,
    FileCheck2,
    Globe2,
    LineChart,
    Link2,
    ShieldCheck,
    Store,
    Tags,
} from "lucide-react";
import { PLANS, TRIAL_DAYS } from "../../shared/billing";
import { COUNTRIES } from "../../shared/countries";
import { SUPPORT_EMAIL } from "./legal/LegalPages";
import { PEPBIZ_ICON } from "../lib/tabBranding";

// pepbiz.io for someone who isn't signed in and didn't arrive from a shop link: what PepBiz is, what it costs,
// and the way in (Start free trial -> /start, or Sign in). Shop links never show this page (AuthPage).
// Its landmarks are divs with roles, not <main>/<header>/<nav>/<footer>: index.css recolours everything inside
// those for the app's dark theme, which would flatten this page's own colours.

// Display and body fonts for this page only (the app itself uses Inter).
const FONTS_URL = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap";
function useFrontPageFonts() {
    useEffect(() => {
        if (document.querySelector(`link[href="${FONTS_URL}"]`)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = FONTS_URL;
        document.head.appendChild(link);
    }, []);
}

const display = { fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif" };
const container = "mx-auto w-full max-w-6xl px-5 md:px-16";
const eyebrow = "text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-gold-400";
const primaryButton =
    "inline-flex items-center justify-center gap-2 rounded bg-gold-400 px-7 py-4 text-[15px] md:text-base font-bold tracking-[0.02em] text-black transition hover:-translate-y-px hover:opacity-90 shadow-[0_10px_30px_-10px_rgba(219,169,49,0.7)]";
const quietButton =
    "inline-flex items-center justify-center gap-2 rounded border border-zinc-700 px-6 py-4 text-[15px] md:text-base font-bold text-zinc-100 transition hover:border-zinc-500 hover:-translate-y-px";

// The visitor's own price (NZ$ in New Zealand, US$ anywhere else - see visitorCountry).
const localPlan = () => (COUNTRY === "nz" ? PLANS.nzd : PLANS.usd);
const countryNames = COUNTRIES.map((c) => c.name);
const countryList = `${countryNames.slice(0, -1).join(", ")} and ${countryNames[countryNames.length - 1]}`;

export default function FrontPage() {
    useFrontPageFonts();
    return (
        <div className="min-h-dvh bg-[#09090B] text-zinc-300 overflow-x-hidden" style={{ fontFamily: "'DM Sans', ui-sans-serif, sans-serif" }}>
            <Nav />
            <div role="main">
                <Hero />
                <FactsBar />
                <Problem />
                <Tour />
                <Features />
                <HowItWorks />
                <Pricing />
                <Faq />
                <FinalCta />
            </div>
            <Footer />
        </div>
    );
}

// ---- Nav ----

function Nav() {
    return (
        <div role="banner" className="sticky top-0 z-30 border-b border-zinc-900/80 bg-[#09090B]/85 backdrop-blur-md">
            <div role="navigation" className={`${container} flex h-16 md:h-20 items-center justify-between`}>
                <a href="/" className="flex items-center gap-2.5">
                    <img src={PEPBIZ_ICON} alt="" className="h-8 w-8 md:h-9 md:w-9" />
                    <span className="text-lg md:text-xl font-extrabold text-white" style={display}>
                        PepBiz
                    </span>
                </a>
                <div className="flex items-center gap-2 md:gap-6">
                    <a href="#pricing" className="hidden md:inline text-sm font-medium text-zinc-400 hover:text-white">
                        Pricing
                    </a>
                    <a href="#faq" className="hidden md:inline text-sm font-medium text-zinc-400 hover:text-white">
                        FAQ
                    </a>
                    <SignInButton mode="modal">
                        <button className="px-3 py-2 text-sm font-bold text-zinc-200 hover:text-white cursor-pointer">Sign in</button>
                    </SignInButton>
                    <a href="/start" className="rounded bg-gold-400 px-4 py-2.5 text-sm font-bold text-black transition hover:opacity-90">
                        Start free trial
                    </a>
                </div>
            </div>
        </div>
    );
}

// ---- Hero ----

function Hero() {
    return (
        <section className="relative">
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "radial-gradient(40rem 28rem at 15% 20%, rgba(219,169,49,0.12), transparent 70%)," +
                        "radial-gradient(36rem 30rem at 85% 60%, rgba(122,90,20,0.18), transparent 70%)",
                }}
            />
            <div className={`${container} relative pt-14 pb-20 md:pt-24 md:pb-28`}>
                <div className="max-w-5xl">
                    <p className={eyebrow}>For peptide sellers</p>
                    <h1
                        className="mt-5 text-[38px] leading-[1.05] md:text-[60px] lg:text-[68px] font-extrabold tracking-tight text-white"
                        style={display}
                    >
                        Run your peptide business <span className="text-gold-400">from one place.</span>
                    </h1>
                    <p className="mt-6 max-w-2xl text-base md:text-xl leading-relaxed text-zinc-400">
                        Your own online shop, stock that tracks itself, and the true cost and profit on every vial - without the spreadsheets.
                    </p>
                    <div className="mt-9 flex flex-col sm:flex-row gap-3">
                        <a href="/start" className={primaryButton}>
                            Start your {TRIAL_DAYS}-day free trial <ArrowRight size={18} />
                        </a>
                        <a href="#how" className={quietButton}>
                            See how it works
                        </a>
                    </div>
                    <p className="mt-5 text-sm text-zinc-500">
                        Then {localPlan().label}. Cancel anytime.
                    </p>
                </div>
                <div className="mt-14 md:mt-20">
                    <HeroShots />
                </div>
            </div>
        </section>
    );
}

// ---- Screenshots ----

// Screenshots of a made-up business ("Summit Peptides"), one set per country so visitors see their own
// currency: public/front/<country>/<screen>-desktop.webp (1440x900 at 1.5x) and -mobile.webp (390x844 at 2x).
type Screen = "dashboard" | "orders" | "inventory" | "supplier" | "shop" | "recon" | "library" | "protocol";
type ShotCountry = "nz" | "au" | "us" | "ca" | "gb";

// The visitor's country from their time zone (every country's zones are in shared/countries.ts); the US
// set for anywhere else.
function visitorCountry(): ShotCountry {
    let zone = "";
    try {
        zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
        // no time zone: use the default
    }
    const found = COUNTRIES.find((c) => c.timeZones.some((z) => z.id === zone));
    return (found?.code.toLowerCase() as ShotCountry | undefined) ?? "us";
}
const COUNTRY = visitorCountry();
const shot = (screen: Screen, size: "desktop" | "mobile") => `/front/${COUNTRY}/${screen}-${size}.webp`;

function BrowserFrame({ screen, alt, className = "", eager = false }: { screen: Screen; alt: string; className?: string; eager?: boolean }) {
    return (
        <div className={`overflow-hidden rounded-xl border border-zinc-800 bg-[#121215] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.85)] ${className}`}>
            <div className="flex items-center gap-1.5 border-b border-zinc-800 px-3.5 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                <span className="ml-3 truncate rounded bg-zinc-900 px-3 py-0.5 text-[11px] text-zinc-500">pepbiz.io</span>
            </div>
            <img src={shot(screen, "desktop")} alt={alt} width={2160} height={1350} loading={eager ? "eager" : "lazy"} className="block h-auto w-full" />
        </div>
    );
}

function PhoneFrame({ screen, alt, className = "", eager = false }: { screen: Screen; alt: string; className?: string; eager?: boolean }) {
    return (
        <div className={`overflow-hidden rounded-[2rem] border-[6px] border-zinc-800 bg-black shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] ${className}`}>
            <img src={shot(screen, "mobile")} alt={alt} width={780} height={1688} loading={eager ? "eager" : "lazy"} className="block h-auto w-full" />
        </div>
    );
}

// The real app, with a phone showing the shop.
function HeroShots() {
    return (
        <div className="relative mx-auto w-full sm:mb-10 sm:pr-[8%]">
            <BrowserFrame screen="dashboard" alt="The PepBiz dashboard: sales, profit and expenses by month" className="hidden sm:block" eager />
            <PhoneFrame
                screen="shop"
                alt="A shop on PepBiz, on a phone"
                className="absolute -bottom-10 right-0 hidden w-[24%] max-w-[260px] sm:block"
                eager
            />
            <PhoneFrame screen="dashboard" alt="The PepBiz dashboard on a phone" className="mx-auto w-[78%] sm:hidden" eager />
        </div>
    );
}

// ---- Take a look ----

function Tour() {
    const tabs: { screen: Screen; label: string; text: string }[] = [
        { screen: "dashboard", label: "Dashboard", text: "Sales, profit and what needs doing today - as soon as you open the app." },
        { screen: "orders", label: "Customer orders", text: "Every order from your shop in one list: new, waiting for payment, paid and sent." },
        { screen: "inventory", label: "Stock", text: "What you have, what it cost, when it expires - and what's running low." },
        { screen: "supplier", label: "Supplier costs", text: "Each supplier order converted to your currency, with the landed cost per vial." },
        { screen: "shop", label: "Your shop", text: "Your products, photos and certificates, under your own name and logo." },
        { screen: "recon", label: "Calculator", text: "Dosage and reconstitution maths your customers can do themselves." },
        { screen: "protocol", label: "Protocol builder", text: "Customers plan their protocol and follow a dosing calendar, ticking off each dose as they go." },
        { screen: "library", label: "Peptide database", text: "A reference library of more than 100 peptides - dosing, interactions and safety - built into your shop." },
    ];
    const [active, setActive] = React.useState(0);
    const tab = tabs[active];
    return (
        <section className="border-t border-zinc-900 py-16 md:py-28">
            <div className={container}>
                <p className={eyebrow}>Take a look</p>
                <h2 className="mt-4 max-w-3xl text-[28px] leading-tight md:text-[40px] font-bold text-white" style={display}>
                    See what you get.
                </h2>
                <div className="mt-8 -mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
                    <div role="tablist" className="flex w-max gap-2 md:w-auto md:flex-wrap">
                        {tabs.map((t, i) => (
                            <button
                                key={t.screen}
                                role="tab"
                                aria-selected={i === active}
                                onClick={() => setActive(i)}
                                className={`cursor-pointer whitespace-nowrap rounded border px-4 py-2.5 text-sm font-bold transition ${
                                    i === active ? "border-gold-400 bg-gold-400 text-black" : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
                <p className="mt-5 min-h-[3rem] max-w-2xl text-base md:text-lg text-zinc-400">{tab.text}</p>
                <div className="mt-6">
                    <BrowserFrame key={`d-${tab.screen}`} screen={tab.screen} alt={`${tab.label} in PepBiz`} className="hidden md:block" />
                    <PhoneFrame key={`m-${tab.screen}`} screen={tab.screen} alt={`${tab.label} in PepBiz on a phone`} className="mx-auto w-[82%] max-w-sm md:hidden" />
                </div>
                <p className="mt-4 text-xs text-zinc-600">Screenshots of a made-up example business.</p>
            </div>
        </section>
    );
}

// ---- Facts bar ----

function FactsBar() {
    const facts = [
        { icon: <Store size={16} />, text: "Your own shop link" },
        { icon: <Tags size={16} />, text: "True cost per vial" },
        { icon: <BellRing size={16} />, text: "Order alerts on your phone" },
        { icon: <Globe2 size={16} />, text: `NZ, AU, US, CA and UK` },
    ];
    return (
        <section className="border-y border-zinc-900 bg-zinc-950/60">
            <div className={`${container} grid grid-cols-2 md:grid-cols-4 gap-y-5 gap-x-4 py-7 md:py-8`}>
                {facts.map((f) => (
                    <div key={f.text} className="flex items-center gap-2.5 text-sm font-medium text-zinc-300">
                        <span className="text-gold-400">{f.icon}</span>
                        {f.text}
                    </div>
                ))}
            </div>
        </section>
    );
}

// ---- Problem ----

function Problem() {
    const pains = [
        "Working out what a vial really cost once the US-dollar price, shipping and fees are split across the order.",
        "Orders arriving by message, then chasing who's paid and what still needs posting.",
        "Not knowing which batch is running low - or which one a vial came from.",
        "Answering the same dosage and reconstitution questions over and over.",
    ];
    return (
        <section className="py-16 md:py-28">
            <div className={`${container} grid gap-10 md:gap-16 lg:grid-cols-[0.9fr_1.1fr]`}>
                <div>
                    <p className={eyebrow}>Sound familiar?</p>
                    <h2 className="mt-4 text-[28px] leading-tight md:text-[40px] font-bold text-white" style={display}>
                        Spreadsheets weren't built for selling peptides.
                    </h2>
                </div>
                <ul className="space-y-4">
                    {pains.map((p) => (
                        <li key={p} className="flex gap-4 border-b border-zinc-900 pb-4 text-base md:text-lg leading-relaxed text-zinc-400">
                            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                            {p}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

// ---- Features ----

function Features() {
    const others = [
        {
            icon: <Tags size={20} />,
            title: "The true cost of every vial",
            text: "Enter a supplier order in US dollars and PepBiz converts it, splits shipping and fees across every unit, and uses your oldest stock first - so each sale shows its real profit.",
        },
        {
            icon: <Boxes size={20} />,
            title: "Stock that keeps itself",
            text: "Batches with lot numbers and expiry dates, low-stock levels, and every movement recorded. Selling an order takes the stock out for you.",
        },
        {
            icon: <LineChart size={20} />,
            title: "Profit you can trust",
            text: "Sales, expenses and profit by month on one dashboard, in your own currency.",
        },
        {
            icon: <Calculator size={20} />,
            title: "Tools your customers come back for",
            text: "A dosage and reconstitution calculator, protocol builder, research log and peptide database - inside your shop.",
        },
        {
            icon: <FileCheck2 size={20} />,
            title: "Certificates of analysis",
            text: "Attach the lab report or a link to each product so customers can check it before they order.",
        },
    ];
    return (
        <section id="features" className="border-t border-zinc-900 bg-zinc-950/40 py-16 md:py-28">
            <div className={container}>
                <p className={eyebrow}>What you get</p>
                <h2 className="mt-4 max-w-3xl text-[28px] leading-tight md:text-[40px] font-bold text-white" style={display}>
                    Everything a peptide business runs on.
                </h2>

                {/* The shop leads: it's what owners feel first. */}
                <div
                    className="mt-12 grid gap-8 overflow-hidden rounded-xl border border-gold-500/25 p-6 md:p-10 lg:grid-cols-[1.2fr_1fr] lg:items-center"
                    style={{ background: "linear-gradient(135deg, rgba(194,145,31,0.10), transparent 60%)" }}
                >
                    <div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg text-black" style={{ background: "#dba931" }}>
                            <Store size={22} />
                        </div>
                        <h3 className="mt-5 text-[22px] md:text-[26px] font-bold text-white" style={display}>
                            Your own shop, under your name
                        </h3>
                        <p className="mt-3 text-base md:text-lg leading-relaxed text-zinc-400">
                            Share one link. Customers browse your products, send an order and follow it from confirmed to paid. You approve each
                            order, set the shipping, and they pay you directly. Your logo, your name - your customers never see PepBiz.
                        </p>
                    </div>
                    <ul className="space-y-3 text-sm md:text-base">
                        {[
                            "pepbiz.io/shop/your-name",
                            "Customers pay into your own bank account",
                            "Instant alerts when an order comes in",
                            "Customers get updates on their order",
                        ].map((t) => (
                            <li key={t} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-zinc-200">
                                <Check size={16} className="shrink-0 text-gold-400" />
                                {t}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {others.map((f) => (
                        <div key={f.title} className="rounded-xl border border-zinc-800/80 p-6 transition hover:border-zinc-700">
                            <span className="text-gold-400">{f.icon}</span>
                            <h3 className="mt-4 text-lg font-bold text-white">{f.title}</h3>
                            <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">{f.text}</p>
                        </div>
                    ))}
                    <div className="rounded-xl border border-zinc-800/80 p-6">
                        <span className="text-gold-400">
                            <ShieldCheck size={20} />
                        </span>
                        <h3 className="mt-4 text-lg font-bold text-white">Your data stays yours</h3>
                        <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">
                            Every business is kept separate by the database itself. We never sell your information or your customers'.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

// ---- How it works ----

function HowItWorks() {
    const steps = [
        { title: "Register your business", text: "Choose your shop link and country, and start your free trial." },
        { title: "Add your products", text: "Enter your supplier orders and stock, set your prices and add photos." },
        { title: "Share your link", text: "Send customers your shop link and take orders from day one." },
    ];
    return (
        <section id="how" className="py-16 md:py-28">
            <div className={container}>
                <p className={eyebrow}>How it works</p>
                <h2 className="mt-4 text-[28px] leading-tight md:text-[40px] font-bold text-white" style={display}>
                    Up and running in an afternoon.
                </h2>
                <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
                    {steps.map((s, i) => (
                        <li key={s.title} className="relative border-t border-zinc-800 pt-6">
                            <span className="text-5xl font-extrabold text-gold-400/90" style={display}>
                                {i + 1}
                            </span>
                            <h3 className="mt-4 text-lg md:text-xl font-bold text-white">{s.title}</h3>
                            <p className="mt-2 text-[15px] md:text-base leading-relaxed text-zinc-400">{s.text}</p>
                        </li>
                    ))}
                </ol>
                <div className="mt-12">
                    <a href="/start" className={primaryButton}>
                        Start your free trial <ArrowRight size={18} />
                    </a>
                </div>
            </div>
        </section>
    );
}

// ---- Pricing ----

function Pricing() {
    const included = [
        "Your own shop link and branding",
        "Unlimited products, customers and orders",
        "Stock, supplier orders and expenses",
        "True cost and profit reports",
        "Order alerts on your phone",
        "Customer tools: calculator, protocols, peptide database",
    ];
    return (
        <section id="pricing" className="border-t border-zinc-900 bg-zinc-950/40 py-16 md:py-28">
            <div className={`${container} grid gap-12 lg:grid-cols-2 lg:items-center`}>
                <div>
                    <p className={eyebrow}>Pricing</p>
                    <h2 className="mt-4 text-[28px] leading-tight md:text-[40px] font-bold text-white" style={display}>
                        One plan. Everything included.
                    </h2>
                    <p className="mt-5 max-w-md text-base md:text-lg leading-relaxed text-zinc-400">
                        Try it free for {TRIAL_DAYS} days. You'll need a card to start, but you won't be charged if you cancel before the trial
                        ends.
                    </p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-[#121215] p-6 md:p-10 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]">
                    <div className="flex items-end gap-2">
                        <span className="text-5xl md:text-6xl font-extrabold text-white" style={display}>
                            {COUNTRY === "nz" ? "NZ$" : "US$"}
                            {localPlan().amount}
                        </span>
                        <span className="pb-2 text-zinc-400">/ month</span>
                    </div>
                    <ul className="mt-7 space-y-3">
                        {included.map((t) => (
                            <li key={t} className="flex items-start gap-3 text-[15px] text-zinc-300">
                                <Check size={17} className="mt-0.5 shrink-0 text-gold-400" />
                                {t}
                            </li>
                        ))}
                    </ul>
                    <a href="/start" className={`${primaryButton} mt-8 w-full`}>
                        Start your {TRIAL_DAYS}-day free trial
                    </a>
                    <p className="mt-3 text-center text-xs text-zinc-500">Cancel anytime from the app.</p>
                </div>
            </div>
        </section>
    );
}

// ---- FAQ ----

function Faq() {
    const questions = [
        {
            q: "Will my customers see PepBiz?",
            a: "No. Your shop shows your business's name and logo, and its privacy notice is in your name.",
        },
        {
            q: "How do my customers pay? Can they pay by card?",
            a: "By bank transfer, straight into your own account, using the payment details you set. They tap \"I've paid\" and you mark the order paid once the money arrives. Card payments aren't available at this stage. PepBiz never handles your money.",
        },
        {
            q: "Do I need my own website?",
            a: "No. Your shop link is your shop - share it in messages, on social media or in your bio. Customers sign up there, browse your products and order.",
        },
        {
            q: "Will I know when an order comes in?",
            a: "Yes. Turn on notifications and your phone or computer tells you when an order arrives, when a customer says they've paid, and if they cancel. Your customers get updates too - when you confirm their order, mark it paid and send it.",
        },
        {
            q: "Does it work on a phone?",
            a: "Yes, for you and your customers. It works in any phone browser and can be added to the home screen so it opens like an app - nothing to download from an app store.",
        },
        {
            q: "Is it hard to set up?",
            a: `No - register, choose your shop link, then add your products and stock. Most people are taking orders the same day. Stuck? Email ${SUPPORT_EMAIL} and we'll help you get going.`,
        },
        {
            q: "Which countries does it work in?",
            a: `${countryList}. Prices, costs and reports are in your own currency and time zone.`,
        },
        {
            q: "What happens if I cancel?",
            a: "You keep using PepBiz until the end of the time you've paid for. Your information is kept for 30 days in case you come back, then permanently deleted.",
        },
        {
            q: "Can I move my existing records in?",
            a: "Yes - you can enter past supplier orders, stock and customer orders so your costs and reports are right from the start.",
        },
    ];
    return (
        <section id="faq" className="py-16 md:py-28">
            <div className={`${container} grid gap-10 lg:grid-cols-[0.8fr_1.2fr]`}>
                <div>
                    <p className={eyebrow}>FAQ</p>
                    <h2 className="mt-4 text-[28px] leading-tight md:text-[40px] font-bold text-white" style={display}>
                        Questions, answered.
                    </h2>
                    <p className="mt-4 text-zinc-400">
                        Something else? Email{" "}
                        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold-400 hover:text-gold-300">
                            {SUPPORT_EMAIL}
                        </a>
                    </p>
                </div>
                <div className="divide-y divide-zinc-900 border-y border-zinc-900">
                    {questions.map(({ q, a }) => (
                        <details key={q} className="group py-5">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base md:text-lg font-bold text-white">
                                {q}
                                <span className="text-2xl font-light text-gold-400 transition group-open:rotate-45">+</span>
                            </summary>
                            <p className="mt-3 pr-8 text-[15px] md:text-base leading-relaxed text-zinc-400">{a}</p>
                        </details>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ---- Final CTA ----

function FinalCta() {
    return (
        <section className="px-5 pb-16 md:pb-28">
            <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-gold-500/30 px-6 py-14 md:px-16 md:py-20 text-center">
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{ background: "radial-gradient(40rem 20rem at 50% 0%, rgba(219,169,49,0.18), transparent 70%)" }}
                />
                <div className="relative">
                    <h2 className="mx-auto max-w-2xl text-[30px] leading-tight md:text-[48px] font-extrabold text-white" style={display}>
                        Spend less time on admin and more time selling.
                    </h2>
                    <p className="mx-auto mt-5 max-w-lg text-base md:text-lg text-zinc-400">
                        Start free for {TRIAL_DAYS} days. Set up your shop today.
                    </p>
                    <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
                        <a href="/start" className={primaryButton}>
                            Start your free trial <ArrowRight size={18} />
                        </a>
                        <SignInButton mode="modal">
                            <button className={`${quietButton} cursor-pointer`}>
                                <Link2 size={16} /> I already have an account
                            </button>
                        </SignInButton>
                    </div>
                </div>
            </div>
        </section>
    );
}

// ---- Footer ----

function Footer() {
    return (
        <div role="contentinfo" className="border-t border-zinc-900">
            <div className={`${container} flex flex-col md:flex-row gap-5 md:items-center md:justify-between py-8 text-sm text-zinc-500`}>
                <div className="flex items-center gap-2.5">
                    <img src={PEPBIZ_ICON} alt="" className="h-6 w-6" />
                    <span>© 2026 PepBiz</span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <a href="/privacy" className="hover:text-zinc-300">
                        Privacy Policy
                    </a>
                    <a href="/terms" className="hover:text-zinc-300">
                        Terms of Service
                    </a>
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-zinc-300">
                        {SUPPORT_EMAIL}
                    </a>
                </div>
            </div>
        </div>
    );
}
