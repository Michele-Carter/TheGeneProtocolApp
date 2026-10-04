import React, { useEffect, useState } from "react";
import { SignOutButton, useAuth } from "@clerk/react";
import { AlertTriangle, CheckCircle2, CreditCard, Link2, Store } from "lucide-react";
import { PLANS, REGIONS, TRIAL_DAYS, planFor, slugProblem, toSlug, type RegionCode } from "../../../shared/billing";
import { businessApi, setWantsToStartBusiness, type BusinessContext } from "../../lib/business";
import { Spinner } from "../LoadingSpinner";

// Full-page screens shown instead of the app when there's something to do first: set up a new business,
// start or restart its subscription, or open a shop link.

export function ScreenFrame({ children, footer = true }: { children: React.ReactNode; footer?: boolean }) {
  return (
    <div className="min-h-dvh relative flex items-center justify-center bg-zinc-950 px-4 py-6 sm:py-10 overflow-hidden">
      <div className="absolute top-0 left-0 w-[25rem] h-[25rem] bg-zinc-400/5 rounded-full blur-[120px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-[25rem] h-[25rem] bg-neutral-400/5 rounded-full blur-[120px] pointer-events-none translate-x-1/2 translate-y-1/2" />
      <div className="relative z-10 w-full max-w-lg bg-zinc-900/95 border border-zinc-800 rounded-[2rem] p-5 sm:p-8 shadow-2xl">
        {children}
        {footer && (
          <div className="mt-6 text-center">
            <SignOutButton>
              <button className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer">Sign out</button>
            </SignOutButton>
          </div>
        )}
      </div>
    </div>
  );
}

function Heading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="text-center space-y-2.5">
      <p className="text-xs uppercase tracking-[0.3em] text-gold-400 font-bold">{eyebrow}</p>
      <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">{title}</h1>
      {children && <div className="text-zinc-400 text-sm sm:text-base space-y-2">{children}</div>}
    </div>
  );
}

const bigButton =
  "app-action-button w-full rounded-2xl px-4 py-3 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer";

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-xl px-3 py-2">{message}</p>;
}

// Signed in, but not an owner and no shop link opened yet.
export function NoBusinessScreen({ shopNotFound, onStart }: { shopNotFound: boolean; onStart: () => void }) {
  return (
    <ScreenFrame>
      <Heading eyebrow="PepPal" title={shopNotFound ? "That shop link didn't work" : "Open your shop's link"}>
        <p>
          {shopNotFound
            ? "Please check the link with the shop that sent it to you, then open it again."
            : "To get started, open the link your shop sent you. You'll only need to do this once."}
        </p>
      </Heading>
      <div className="mt-6 rounded-3xl bg-zinc-950/80 border border-zinc-800 p-4 text-sm text-zinc-300">
        <p className="font-semibold text-zinc-100">Run your own business?</p>
        <p className="mt-1 text-zinc-400">Set up PepPal for your own shop, customers and stock.</p>
        <button
          className="mt-3 text-gold-400 hover:text-gold-300 font-bold cursor-pointer"
          onClick={() => {
            setWantsToStartBusiness(true);
            onStart();
          }}
        >
          Set up my business →
        </button>
      </div>
    </ScreenFrame>
  );
}

// The customer's shop has stopped using PepPal for now.
export function ShopUnavailableScreen({ context }: { context: BusinessContext }) {
  return (
    <ScreenFrame>
      <div className="flex justify-center mb-4">
        {context.business.logoUrl ? (
          <img src={context.business.logoUrl} alt="" className="h-14 w-14 object-contain rounded-xl" />
        ) : (
          <Store size={28} className="text-gold-400" />
        )}
      </div>
      <Heading eyebrow={context.business.name} title="Unavailable right now">
        <p>{context.business.name} isn't available at the moment. Your details are kept safe - please check back later or get in touch with them.</p>
      </Heading>
    </ScreenFrame>
  );
}

// The owner's subscription isn't running: start the trial, restart, or fix the payment.
export function BillingScreen({ context, onChanged }: { context: BusinessContext; onChanged: () => void }) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(context.notice ?? null);
  const billing = context.billing!;
  const plan = PLANS[billing.plan];
  const status = billing.subscriptionStatus;

  const switchRegion = async (region: RegionCode) => {
    setBusy(true);
    setError(null);
    try {
      await businessApi.setRegion(region, getToken);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const go = async (where: "checkout" | "portal") => {
    setBusy(true);
    setError(null);
    try {
      const { url } = where === "checkout" ? await businessApi.checkout(getToken) : await businessApi.portal(getToken);
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  let title: string;
  let text: React.ReactNode;
  let action: { label: string; where: "checkout" | "portal" } | null;
  if (billing.state === "needs-checkout" && billing.hadSubscription) {
    title = "Restart your subscription";
    text = <p>It's {plan.label}. Your shop, customers and stock are all still here.</p>;
    action = { label: "Restart subscription", where: "checkout" };
  } else if (billing.state === "needs-checkout") {
    title = "Start your free trial";
    text = (
      <>
        <p>
          Your first {TRIAL_DAYS} days are free, then it's {plan.label}. You'll need a card to start, but you won't be charged if
          you cancel before the trial ends.
        </p>
      </>
    );
    action = { label: `Start ${TRIAL_DAYS}-day free trial`, where: "checkout" };
  } else if (status === "unpaid" || status === "paused") {
    title = "Your payment didn't go through";
    text = <p>Update your card to carry on using PepPal. Your shop, customers and stock are all kept safe in the meantime.</p>;
    action = { label: "Update payment details", where: "portal" };
  } else if (status === "trialing" || status === "active" || status === "past_due") {
    title = "Your account is on hold";
    text = <p>Please get in touch with PepPal support to sort this out. Your data is kept safe.</p>;
    action = null;
  } else {
    title = "Your subscription has ended";
    text = (
      <p>
        Restart it to pick up where you left off - {plan.label}. Your shop, customers and stock are all still here.
      </p>
    );
    action = { label: "Restart subscription", where: "checkout" };
  }

  return (
    <ScreenFrame>
      <Heading eyebrow={context.business.name} title={title}>
        {text}
      </Heading>
      <div className="mt-6 space-y-3">
        <ErrorLine message={error} />
        {billing.state === "needs-checkout" && (
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-white">Where is your business?</span>
            <div className="grid grid-cols-2 gap-2">
              {REGIONS.map((r) => {
                const selected = planFor(r.code) === billing.plan;
                return (
                  <button
                    key={r.code}
                    type="button"
                    disabled={busy || selected}
                    onClick={() => void switchRegion(r.code)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      selected ? "border-gold-500/70 bg-gold-500/10" : "border-zinc-800 hover:border-zinc-600 cursor-pointer"
                    }`}
                  >
                    <div className="text-sm font-bold text-white">{r.label}</div>
                    <div className="text-xs text-zinc-400">{r.price}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-zinc-500">The New Zealand price needs a card issued in New Zealand.</p>
          </div>
        )}
        {action && (
          <button className={bigButton} disabled={busy} onClick={() => void go(action.where)}>
            {busy ? <Spinner size={14} /> : <CreditCard size={14} />} {action.label}
          </button>
        )}
        {billing.state !== "needs-checkout" && action?.where !== "portal" && status && (
          <button
            className="w-full text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
            disabled={busy}
            onClick={() => void go("portal")}
          >
            See past invoices
          </button>
        )}
        <p className="text-center text-xs text-zinc-500">Payments are handled securely by Stripe.</p>
      </div>
    </ScreenFrame>
  );
}

// Signing up a new business: name, shop link and where it is, then on to Stripe for the free trial.
export function StartBusinessScreen({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const { getToken } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [region, setRegion] = useState<RegionCode>("NZ");
  const [slugCheck, setSlugCheck] = useState<{ slug: string; problem: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugEdited ? slug : toSlug(name);
  const localProblem = effectiveSlug ? slugProblem(effectiveSlug) : null;

  // Checks the link is free once typing pauses.
  useEffect(() => {
    if (!effectiveSlug || localProblem) return;
    const timer = window.setTimeout(() => {
      businessApi
        .checkSlug(effectiveSlug, getToken)
        .then((r) => setSlugCheck({ slug: effectiveSlug, problem: r.problem }))
        .catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [effectiveSlug, localProblem, getToken]);

  const slugMessage = localProblem ?? (slugCheck?.slug === effectiveSlug ? slugCheck.problem : null);
  const slugOk = Boolean(effectiveSlug) && !localProblem && slugCheck?.slug === effectiveSlug && slugCheck.problem == null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await businessApi.create({ name: name.trim(), slug: effectiveSlug, region }, getToken);
      setWantsToStartBusiness(false);
      try {
        const { url } = await businessApi.checkout(getToken);
        window.location.assign(url);
      } catch {
        // The business exists; the app will offer the free trial again.
        onCreated();
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const input =
    "w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-gold-500/70";

  return (
    <ScreenFrame>
      <Heading eyebrow="PepPal for business" title="Set up your business">
        <p>Your own shop, customers, stock and peptide library - kept completely separate from anyone else's.</p>
      </Heading>

      <div className="mt-6 space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-white">Business name</span>
          <input className={input} value={name} placeholder="e.g. Peak Peptides" onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-white">Your shop link</span>
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl focus-within:border-gold-500/70">
            <span className="pl-3 text-sm text-zinc-500 whitespace-nowrap">{window.location.host}/shop/</span>
            <input
              className="flex-1 min-w-0 !bg-transparent !border-0 !shadow-none px-1 py-2.5 text-sm text-zinc-100 focus:outline-none"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
            />
            {slugOk && <CheckCircle2 size={15} className="mr-3 text-emerald-400 flex-shrink-0" />}
          </div>
          <span className={`block text-xs ${slugMessage ? "text-amber-300" : "text-zinc-500"}`}>
            {slugMessage ?? "You'll send this to your customers so they can join your shop. It can't be changed later."}
          </span>
        </label>

        <div className="space-y-1.5">
          <span className="text-xs font-bold text-white">Where is your business?</span>
          <div className="grid grid-cols-2 gap-2">
            {REGIONS.map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => setRegion(r.code)}
                className={`rounded-xl border px-3 py-2.5 text-left cursor-pointer transition ${
                  region === r.code ? "border-gold-500/70 bg-gold-500/10" : "border-zinc-800 hover:border-zinc-600"
                }`}
              >
                <div className="text-sm font-bold text-white">{r.label}</div>
                <div className="text-xs text-zinc-400">{r.price}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-950/80 border border-zinc-800 p-3.5 text-xs text-zinc-400 space-y-1">
          <p className="text-zinc-200 font-semibold">
            {TRIAL_DAYS} days free, then {PLANS[planFor(region)].label}
          </p>
          <p>Next you'll enter a card on Stripe's secure page. Cancel before the trial ends and you won't be charged.</p>
          {region === "NZ" && <p>The New Zealand price needs a card issued in New Zealand.</p>}
        </div>

        <ErrorLine message={error} />
        <button className={bigButton} disabled={busy || name.trim().length < 2 || !slugOk} onClick={() => void submit()}>
          {busy ? <Spinner size={14} /> : <Link2 size={14} />} Continue to free trial
        </button>
        <button className="w-full text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </ScreenFrame>
  );
}

// Something went wrong finding out which business to show.
export function BusinessErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <ScreenFrame>
      <div className="flex justify-center mb-3">
        <AlertTriangle size={24} className="text-red-400" />
      </div>
      <Heading eyebrow="PepPal" title="Something went wrong">
        <p>{message}</p>
      </Heading>
      <button className={`${bigButton} mt-6`} onClick={onRetry}>
        Try again
      </button>
    </ScreenFrame>
  );
}
