import React, { useEffect, useMemo, useRef, useState } from "react";
import { SignOutButton, useAuth, useClerk, useUser } from "@clerk/react";
import { AlertTriangle, CheckCircle2, CreditCard, Link2, Store } from "lucide-react";
import { PLANS, TRIAL_DAYS, planFor, slugProblem, toSlug } from "../../../shared/billing";
import { COUNTRIES, countryInfo, defaultTimeZone } from "../../../shared/countries";
import {
  businessApi,
  forgetInvite,
  saveRegistration,
  savedInvite,
  savedRegistration,
  setWantsToStartBusiness,
  type BusinessContext,
  type RegistrationDraft,
} from "../../lib/business";
import { PEPBIZ_ICON, setTabBranding } from "../../lib/tabBranding";
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
      {eyebrow && <p className="text-xs uppercase tracking-[0.3em] text-gold-400 font-bold">{eyebrow}</p>}
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
      <Heading eyebrow="PepBiz" title={shopNotFound ? "That shop link didn't work" : "Open your shop's link"}>
        <p>
          {shopNotFound
            ? "Please check the link with the shop that sent it to you, then open it again."
            : "To get started, open the link your shop sent you. You'll only need to do this once."}
        </p>
      </Heading>
      <div className="mt-6 rounded-3xl bg-zinc-950/80 border border-zinc-800 p-4 text-sm text-zinc-300">
        <p className="font-semibold text-zinc-100">Run your own business?</p>
        <p className="mt-1 text-zinc-400">Set up PepBiz for your own shop, customers and stock.</p>
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

// The customer's shop has stopped using PepBiz for now.
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

const fieldClass =
  "w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-gold-500/70";

const currencyName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
};

// Where the business is: sets its currency, how dates are written and its time zone. Only the chosen country's
// subscription price is shown. country "" = not chosen yet (nothing is picked for the owner).
function CountryChoice({
  country,
  timeZone,
  onChange,
  disabled,
}: {
  country: string;
  timeZone: string;
  onChange: (country: string, timeZone: string) => void;
  disabled?: boolean;
}) {
  const info = country ? countryInfo(country) : null;
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-bold text-white">Where is your business?</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Where is your business?">
        {COUNTRIES.map((c) => {
          const selected = c.code === info?.code;
          return (
            <button
              key={c.code}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => {
                if (!selected) onChange(c.code, defaultTimeZone(c));
              }}
              className={`rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition ${
                selected
                  ? "border-gold-500/70 bg-gold-500/10 text-white"
                  : "border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white cursor-pointer"
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
      {info && info.timeZones.length > 1 && (
        <label className="block space-y-1 pt-1">
          <span className="block text-xs font-bold text-white">Time zone</span>
          <select className={fieldClass} value={timeZone} disabled={disabled} onChange={(e) => onChange(info.code, e.target.value)}>
            {info.timeZones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label} time
              </option>
            ))}
          </select>
        </label>
      )}
      {info && (
        <div className="pt-1 space-y-1">
          <span className="block text-xs font-bold text-white">Currency</span>
          <div className={`${fieldClass} text-zinc-400`}>
            {currencyName(info.currency)} ({info.currency})
          </div>
          <p className="text-xs text-zinc-500">
            Your prices, costs and reports will be in {info.currency}. It follows your country, and you can change it until
            you start recording stock, orders or sales.
          </p>
        </div>
      )}
    </div>
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

  const switchCountry = async (country: string, timeZone: string) => {
    setBusy(true);
    setError(null);
    try {
      await businessApi.setCountry(country, timeZone, getToken);
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
          Your first {billing.trialDays} days are free, then it's {plan.label}. You'll need a card to start, but you won't be charged if
          you cancel before the trial ends.
        </p>
      </>
    );
    action = { label: `Start ${billing.trialDays}-day free trial`, where: "checkout" };
  } else if (status === "unpaid" || status === "paused") {
    title = "Your payment didn't go through";
    text = <p>Update your card to carry on using PepBiz. Your shop, customers and stock are all kept safe in the meantime.</p>;
    action = { label: "Update payment details", where: "portal" };
  } else if (status === "trialing" || status === "active" || status === "past_due") {
    title = "Your account is on hold";
    text = <p>Please get in touch with PepBiz support to sort this out. Your data is kept safe.</p>;
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
        {billing.state === "needs-checkout" && !billing.hadSubscription && (
          <div className="space-y-1.5">
            <CountryChoice
              country={context.business.country}
              timeZone={context.business.timeZone}
              disabled={busy}
              onChange={(country, timeZone) => void switchCountry(country, timeZone)}
            />
            {context.business.country === "NZ" && (
              <p className="text-xs text-zinc-500">The New Zealand price needs a card issued in New Zealand.</p>
            )}
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

// Registering a business. Signed out (/start), the form comes first: Continue keeps the details for this tab and
// opens "Create your account" with the email and name already filled in (or Sign in, for an existing login).
// Once signed in, the business is set up from those details straight away, then it's on to Stripe for the free
// trial. Signed in without saved details (e.g. a different tab), the same form sets it up directly.
export function StartBusinessScreen({
  signedIn,
  onCancel,
  onCreated,
}: {
  signedIn: boolean;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const draft = useMemo(() => savedRegistration(), []);
  // About you: when signed in, the name from their login if it has one, and the email they sign in with.
  const [ownerName, setOwnerName] = useState(draft?.ownerName ?? "");
  const [ownerNameEdited, setOwnerNameEdited] = useState(Boolean(draft?.ownerName));
  const effectiveOwnerName = ownerNameEdited ? ownerName : user?.fullName ?? "";
  const [email, setEmail] = useState(draft?.email ?? "");
  const loginEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  // Your business.
  const [name, setName] = useState(draft?.name ?? "");
  const [slug, setSlug] = useState(draft?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(draft?.slug));
  const [country, setCountry] = useState(draft?.country ?? "");
  const [timeZone, setTimeZone] = useState(draft?.timeZone ?? "");
  const [slugCheck, setSlugCheck] = useState<{ slug: string; problem: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  // Setting the business up from details given before signing in.
  const [settingUp, setSettingUp] = useState(signedIn && draft != null);
  const [error, setError] = useState<string | null>(null);
  // From an invite link (/start?invite=...): free, no card. null until checked.
  const invite = useMemo(() => savedInvite(), []);
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [inviteTrialDays, setInviteTrialDays] = useState<number | null>(null);
  useEffect(() => {
    if (!invite) return;
    businessApi
      .checkInvite(invite)
      .then((r) => {
        setInviteValid(r.valid);
        setInviteTrialDays(r.trialDays);
      })
      .catch(() => setInviteValid(null));
  }, [invite]);
  // The invite gives a longer free trial than the usual 14 days.
  const trialDays = invite && inviteValid === true && inviteTrialDays != null ? inviteTrialDays : TRIAL_DAYS;

  useEffect(() => {
    if (!signedIn) setTabBranding("PepBiz", PEPBIZ_ICON);
  }, [signedIn]);

  const effectiveSlug = slugEdited ? slug : toSlug(name);
  const localProblem = effectiveSlug ? slugProblem(effectiveSlug) : null;

  // Checks the link is free once typing pauses.
  useEffect(() => {
    if (!effectiveSlug || localProblem) return;
    const timer = window.setTimeout(() => {
      businessApi
        .checkSlug(effectiveSlug)
        .then((r) => setSlugCheck({ slug: effectiveSlug, problem: r.problem }))
        .catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [effectiveSlug, localProblem]);

  const slugMessage = localProblem ?? (slugCheck?.slug === effectiveSlug ? slugCheck.problem : null);
  const slugOk = Boolean(effectiveSlug) && !localProblem && slugCheck?.slug === effectiveSlug && slugCheck.problem == null;
  // A full stop left at the end ("...@gmail.com.") is dropped; the rest must look like name@domain.tld.
  const cleanEmail = email.trim().replace(/\.+$/, "");
  const emailOk = signedIn || /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(cleanEmail);
  const ready = effectiveOwnerName.trim().length >= 2 && emailOk && name.trim().length >= 2 && slugOk && Boolean(country);

  const details = (): RegistrationDraft => ({
    ownerName: effectiveOwnerName.trim(),
    email: cleanEmail,
    name: name.trim(),
    slug: effectiveSlug,
    country,
    timeZone,
  });

  const create = async (d: RegistrationDraft) => {
    setBusy(true);
    setError(null);
    try {
      await businessApi.create(
        {
          ownerName: d.ownerName,
          name: d.name,
          slug: d.slug,
          country: d.country,
          timeZone: d.timeZone,
          ...(invite && inviteValid !== false ? { invite } : {}),
        },
        getToken
      );
      saveRegistration(null);
      forgetInvite();
      setWantsToStartBusiness(false);
      // Their login gets the name too (shown in Manage account) - if the sign-in settings allow names.
      if (user && d.ownerName !== (user.fullName ?? "")) {
        const [firstName, ...rest] = d.ownerName.split(/\s+/);
        await user.update({ firstName, lastName: rest.join(" ") }).catch(() => undefined);
      }
      try {
        const { url } = await businessApi.checkout(getToken);
        window.location.assign(url);
      } catch {
        // The business exists; the app will offer the free trial again.
        onCreated();
      }
    } catch (e) {
      // e.g. the shop link was taken meanwhile: back to the form, filled in, to fix it.
      setError((e as Error).message);
      setBusy(false);
      setSettingUp(false);
    }
  };

  // Just signed in with details from before they had a login: set the business up straight away.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!signedIn || !draft || !user || autoStarted.current) return;
    autoStarted.current = true;
    void create(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, draft, user]);

  // Signed out: keep the details for this tab, then create the login (or sign in to an existing one).
  const toAccount = (mode: "signUp" | "signIn") => {
    if (ready) saveRegistration(details());
    const [firstName, ...rest] = effectiveOwnerName.trim().split(/\s+/);
    if (mode === "signUp") {
      clerk.openSignUp({ initialValues: { emailAddress: cleanEmail, firstName, lastName: rest.join(" ") } });
    } else {
      clerk.openSignIn({ initialValues: { emailAddress: cleanEmail } });
    }
  };

  if (settingUp) {
    return (
      <ScreenFrame footer={false}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Spinner size={20} />
          <p className="text-sm text-zinc-300">Setting up {draft?.name ?? "your business"}...</p>
        </div>
      </ScreenFrame>
    );
  }

  const input = fieldClass;

  return (
    <ScreenFrame footer={signedIn}>
      <Heading eyebrow="PepBiz for business" title="Register your business">
        <p>Your own shop, customers, stock and peptide library - kept completely separate from anyone else's.</p>
      </Heading>

      <div className="mt-6 space-y-4">
        {invite && inviteValid === true && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            <span className="font-bold text-white">You've been invited.</span>{" "}
            {`Your first ${trialDays} days are free (instead of the usual ${TRIAL_DAYS}).`}
          </div>
        )}
        {invite && inviteValid === false && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            This invite link has already been used or isn't valid. You can still register with the normal free trial, or ask
            PepBiz for a new link.
          </div>
        )}
        <SectionTitle>About you</SectionTitle>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-white">Your name</span>
          <input
            className={input}
            value={effectiveOwnerName}
            autoComplete="name"
            placeholder="e.g. Sam Smith"
            onChange={(e) => {
              setOwnerNameEdited(true);
              setOwnerName(e.target.value);
            }}
          />
        </label>
        {signedIn ? (
          <div className="space-y-1.5">
            <span className="block text-xs font-bold text-white">Email</span>
            <div className={`${input} text-zinc-400 truncate`}>{loginEmail || "—"}</div>
            <span className="block text-xs text-zinc-500">The email you sign in with. You can change it later in Manage account.</span>
          </div>
        ) : (
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-white">Email</span>
            <input
              className={input}
              type="email"
              value={email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
            <span className="block text-xs text-zinc-500">You'll sign in with this.</span>
          </label>
        )}

        <SectionTitle>Your business</SectionTitle>
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

        <CountryChoice
          country={country}
          timeZone={timeZone}
          disabled={busy}
          onChange={(nextCountry, nextZone) => {
            setCountry(nextCountry);
            setTimeZone(nextZone);
          }}
        />

        <div className="rounded-2xl bg-zinc-950/80 border border-zinc-800 p-3.5 text-xs text-zinc-400 space-y-1">
          <p className="text-zinc-200 font-semibold">
            {country ? `${trialDays} days free, then ${PLANS[planFor(country)].label}` : `${trialDays} days free`}
          </p>
          <p>
            {signedIn
              ? "Next you'll enter a card on Stripe's secure page. Cancel before the trial ends and you won't be charged."
              : "Next you'll create your login, then enter a card on Stripe's secure page. Cancel before the trial ends and you won't be charged."}
          </p>
          {country === "NZ" && <p>The New Zealand price needs a card issued in New Zealand.</p>}
        </div>

        <ErrorLine message={error} />
        {signedIn ? (
          <button className={bigButton} disabled={busy || !ready} onClick={() => void create(details())}>
            {busy ? <Spinner size={14} /> : <Link2 size={14} />} Continue to free trial
          </button>
        ) : (
          <>
            <button className={bigButton} disabled={!ready} onClick={() => toAccount("signUp")}>
              <Link2 size={14} /> Continue - create your login
            </button>
            <p className="text-center text-xs text-zinc-400">
              Already have a PepBiz login?{" "}
              <button className="font-bold text-gold-400 hover:text-gold-300 cursor-pointer" onClick={() => toAccount("signIn")}>
                Sign in
              </button>
            </p>
          </>
        )}
        <button className="w-full text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </ScreenFrame>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="pt-2 text-[11px] font-black uppercase tracking-widest text-gold-400">{children}</div>;
}

// Something went wrong finding out which business to show.
export function BusinessErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <ScreenFrame>
      <div className="flex justify-center mb-3">
        <AlertTriangle size={24} className="text-red-400" />
      </div>
      {/* Anyone can land here, customers included, so no PepBiz name. */}
      <Heading eyebrow="" title="Something went wrong">
        <p>{message}</p>
      </Heading>
      <button className={`${bigButton} mt-6`} onClick={onRetry}>
        Try again
      </button>
    </ScreenFrame>
  );
}
