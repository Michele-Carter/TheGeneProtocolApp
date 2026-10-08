import React, { useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { Check, Copy, CreditCard, ImagePlus, Save, Trash2 } from "lucide-react";
import { PLANS } from "../../../shared/billing";
import { businessApi, type BusinessContext } from "../../lib/business";
import { Card, ErrorNote, Field, inputClass, primaryButton, secondaryButton } from "./ui";
import { prepareImage } from "./ProductImages";
import { Spinner } from "../LoadingSpinner";

// The business itself: its name and logo (shown to customers), its shop link, and its PepPal subscription.

const LOGO_EDGE = 512;

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" }) : "";

export default function BusinessSettingsView({ context, onChanged }: { context: BusinessContext; onChanged: () => void }) {
  const { getToken } = useAuth();
  const [name, setName] = useState(context.business.name);
  const [busy, setBusy] = useState<null | "name" | "logo" | "billing">(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const shopLink = `${window.location.origin}/shop/${context.business.slug}`;

  const run = async (what: "name" | "logo" | "billing", fn: () => Promise<unknown>) => {
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

  const openBilling = async () => {
    setBusy("billing");
    setError(null);
    try {
      window.location.assign((await businessApi.portal(getToken)).url);
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
        </div>
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

      <Card title="PepPal subscription">
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
            <button className={primaryButton} disabled={busy != null} onClick={() => void openBilling()}>
              {busy === "billing" ? <Spinner size={13} /> : <CreditCard size={13} />} Manage billing
            </button>
            <p className="text-[11px] text-slate-500">Change your card, see invoices or cancel - on Stripe's secure page.</p>
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
  if (billing.cancelAtPeriodEnd) return `Cancelled - you can keep using PepPal until ${date(billing.currentPeriodEnd)}.`;
  return `Active - next payment ${date(billing.currentPeriodEnd)}.`;
}
