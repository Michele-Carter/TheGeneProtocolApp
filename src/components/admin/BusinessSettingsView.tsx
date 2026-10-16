import React, { useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { Check, Copy, CreditCard, ImagePlus, RotateCcw, Save, Trash2, XCircle } from "lucide-react";
import { PLANS } from "../../../shared/billing";
import { businessApi, type BusinessContext } from "../../lib/business";
import { Card, ErrorNote, Field, inputClass, primaryButton, secondaryButton } from "./ui";
import { prepareImage } from "./ProductImages";
import { Spinner } from "../LoadingSpinner";
import OrderAlertsCard from "./OrderAlertsCard";
import { formatDate } from "../../lib/locale";
import { COUNTRIES, countryInfo, defaultTimeZone } from "../../../shared/countries";

// The business itself: its name and logo (shown to customers), its shop link, and its PepBiz subscription.

const LOGO_EDGE = 512;

const date = (iso: string | null) =>
  iso ? formatDate(iso, { day: "numeric", month: "long", year: "numeric" }) : "";

export default function BusinessSettingsView({ context, onChanged }: { context: BusinessContext; onChanged: () => void }) {
  const { getToken } = useAuth();
  const [name, setName] = useState(context.business.name);
  const [contactEmail, setContactEmail] = useState(context.business.customContactEmail);
  const [busy, setBusy] = useState<null | "name" | "logo" | "billing" | "cancel" | "resume" | "timezone" | "country" | "contact">(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const shopLink = `${window.location.origin}/shop/${context.business.slug}`;
  const country = countryInfo(context.business.country);
  // The country (and its currency) can be changed until the business records stock, orders, sales or expenses.
  const countryLocked = context.billing?.countryLocked ?? true;

  const run = async (what: "name" | "logo" | "resume" | "timezone" | "country" | "contact", fn: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shopLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy - select the link and copy it instead.");
    }
  };

  const openBilling = async (flow?: "cancel") => {
    setBusy(flow ?? "billing");
    setError(null);
    try {
      window.location.assign((await businessApi.portal(getToken, flow)).url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const billing = context.billing;

  return (
    <div className="max-w-2xl space-y-5">
      <ErrorNote message={error} />

      <Card title="Your business">
        <div className="space-y-4">
          <Field label="Business name" hint="Shown to your customers at the top of the app and on the sign-in page.">
            <div className="flex gap-2">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              <button
                className={primaryButton}
                disabled={busy != null || name.trim().length < 2 || name.trim() === context.business.name}
                onClick={() => void run("name", () => businessApi.rename(name.trim(), getToken))}
              >
                {busy === "name" ? <Spinner size={13} /> : <Save size={13} />} Save
              </button>
            </div>
          </Field>

          <div>
            <span className="block text-[11px] font-bold text-white mb-1">Logo</span>
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 rounded-xl border border-slate-800 bg-slate-950/70 flex items-center justify-center overflow-hidden">
                {context.business.logoUrl ? (
                  <img src={context.business.logoUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[10px] text-slate-600">No logo</span>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void run("logo", async () => businessApi.uploadLogo(await prepareImage(file, LOGO_EDGE), getToken));
                }}
              />
              <button className={secondaryButton} disabled={busy != null} onClick={() => fileInput.current?.click()}>
                {busy === "logo" ? <Spinner size={13} /> : <ImagePlus size={13} />} {context.business.logoUrl ? "Change" : "Upload"}
              </button>
              {context.business.logoUrl && (
                <button
                  className={secondaryButton}
                  disabled={busy != null}
                  onClick={() => void run("logo", () => businessApi.removeLogo(getToken))}
                >
                  <Trash2 size={13} /> Remove
                </button>
              )}
            </div>
            <span className="block text-[11px] text-slate-500 mt-1">A square image works best.</span>
          </div>

          <Field
            label="Contact email for customers"
            hint="Shown on your shop's privacy notice, for customers' questions about their details. Leave blank to use the email you sign in with."
          >
            <div className="flex gap-2">
              <input
                className={inputClass}
                type="email"
                value={contactEmail}
                placeholder={context.business.customContactEmail ? "" : context.business.contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
              <button
                className={primaryButton}
                disabled={busy != null || contactEmail.trim() === context.business.customContactEmail}
                onClick={() => void run("contact", () => businessApi.setContactEmail(contactEmail.trim(), getToken))}
              >
                {busy === "contact" ? <Spinner size={13} /> : <Save size={13} />} Save
              </button>
            </div>
          </Field>
        </div>
      </Card>

      <Card title="Where you are">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {countryLocked ? (
            <div>
              <span className="block text-[11px] font-bold text-white mb-1">Country</span>
              <span className="text-sm text-slate-400">{country.name}</span>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <span className="block text-[11px] font-bold text-white mb-1">Country</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5" role="radiogroup" aria-label="Country">
                {COUNTRIES.map((c) => {
                  const selected = c.code === country.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={busy != null}
                      onClick={() => {
                        if (!selected) void run("country", () => businessApi.setCountry(c.code, defaultTimeZone(c), getToken));
                      }}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition cursor-pointer disabled:cursor-not-allowed ${
                        selected ? "border-gold-500/60 text-gold-400 bg-gold-500/10" : "border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <span className="block text-[11px] font-bold text-white mb-1">Currency</span>
            <span className="text-sm text-slate-400 inline-flex items-center gap-2">
              {context.business.currency}
              {busy === "country" && <Spinner size={13} />}
            </span>
          </div>
          {country.timeZones.length > 1 && (
            <div className="sm:col-span-2">
              <Field label="Time zone" hint="Which day your orders and stock changes fall on.">
                <div className="flex items-center gap-2">
                  <select
                    className={inputClass}
                    value={context.business.timeZone}
                    disabled={busy != null}
                    onChange={(e) => {
                      const zone = e.target.value;
                      void run("timezone", () => businessApi.setTimeZone(zone, getToken));
                    }}
                  >
                    {country.timeZones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.label} time
                      </option>
                    ))}
                  </select>
                  {busy === "timezone" && <Spinner size={13} />}
                </div>
              </Field>
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          {countryLocked
            ? `Your prices, costs and reports are all in ${context.business.currency}. Now that you've recorded stock, orders, sales or expenses, the country and currency can't be changed.`
            : `Your prices, costs and reports will be in ${context.business.currency}. You can change your country until you start recording stock, orders, sales or expenses.`}
        </p>
      </Card>

      <Card title="Your shop link">
        <p className="text-xs text-slate-400 mb-3">
          Send this to your customers. When they open it and register, they join your shop - and only ever see your
          business.
        </p>
        <div className="flex gap-2">
          <input className={`${inputClass} font-mono`} value={shopLink} readOnly onFocus={(e) => e.target.select()} />
          <button className={secondaryButton} onClick={() => void copyLink()}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </Card>

      <OrderAlertsCard />

      <Card title="PepBiz subscription">
        {!billing || billing.exempt ? (
          <p className="text-sm text-slate-400">No subscription is needed for this business.</p>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-slate-300 space-y-1">
              <div>
                Plan: <span className="text-white font-bold">{PLANS[billing.plan].label}</span>
              </div>
              <div>{subscriptionLine(billing)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {billing.cancelAtPeriodEnd && (
                <button
                  className={primaryButton}
                  disabled={busy != null}
                  onClick={() => void run("resume", () => businessApi.resume(getToken))}
                >
                  {busy === "resume" ? <Spinner size={13} /> : <RotateCcw size={13} />} Resume subscription
                </button>
              )}
              <button
                className={billing.cancelAtPeriodEnd ? secondaryButton : primaryButton}
                disabled={busy != null}
                onClick={() => void openBilling()}
              >
                {busy === "billing" ? <Spinner size={13} /> : <CreditCard size={13} />} Manage billing
              </button>
              {!billing.cancelAtPeriodEnd && billing.state === "ok" && (
                <button className={secondaryButton} disabled={busy != null} onClick={() => void openBilling("cancel")}>
                  {busy === "cancel" ? <Spinner size={13} /> : <XCircle size={13} />} Cancel subscription
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {billing.cancelAtPeriodEnd
                ? "Changed your mind? Resume and your subscription carries on as normal."
                : "Change your card or see invoices on Stripe's secure page. If you cancel, you can keep using PepBiz until the end of the time you've paid for. Your shop, customers and stock are then kept for 30 days in case you come back, and deleted after that."}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function subscriptionLine(billing: NonNullable<BusinessContext["billing"]>): string {
  if (billing.subscriptionStatus === "trialing") {
    return billing.cancelAtPeriodEnd
      ? `Free trial - ends ${date(billing.trialEndsAt)} and won't renew.`
      : `Free trial until ${date(billing.trialEndsAt)}, then billed monthly.`;
  }
  if (billing.subscriptionStatus === "past_due") return "Your last payment didn't go through - please update your card.";
  if (billing.cancelAtPeriodEnd) return `Cancelled - you can keep using PepBiz until ${date(billing.currentPeriodEnd)}.`;
  return `Active - next payment ${date(billing.currentPeriodEnd)}.`;
}
