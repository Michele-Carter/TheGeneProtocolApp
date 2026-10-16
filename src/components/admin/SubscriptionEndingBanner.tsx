import React, { useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import type { BillingInfo } from "../../../shared/billing";
import { businessApi } from "../../lib/business";
import { Spinner } from "../LoadingSpinner";
import { primaryButton } from "./ui";
import { formatDate } from "../../lib/locale";

// Shown to the owner on every page once they've cancelled, until the subscription actually ends: when it
// ends, what that means, any orders still waiting, and a one-click way to change their mind.

const date = (iso: string | null) =>
  iso ? formatDate(iso, { day: "numeric", month: "long", year: "numeric" }) : "soon";

export default function SubscriptionEndingBanner({
  billing,
  waitingOrders,
  onResumed,
}: {
  billing: BillingInfo | null;
  waitingOrders: number;
  onResumed: () => void;
}) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!billing || billing.exempt || !billing.cancelAtPeriodEnd || billing.state !== "ok") return null;

  const trial = billing.subscriptionStatus === "trialing";
  const endsOn = date(trial ? billing.trialEndsAt : billing.currentPeriodEnd);

  const resume = async () => {
    setBusy(true);
    setError(null);
    try {
      await businessApi.resume(getToken);
      onResumed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 hidden sm:block" />
      <div className="flex-1 space-y-0.5">
        <p className="text-sm font-bold text-white">
          {trial ? `Your free trial ends on ${endsOn} and won't continue.` : `Your PepBiz subscription ends on ${endsOn}.`}
        </p>
        <p className="text-xs text-slate-400">
          After that your shop closes to customers and PepBiz is locked. Everything is kept if you restart later.
          {waitingOrders > 0 && (
            <span className="text-amber-300 font-semibold">
              {" "}
              You still have {waitingOrders} customer {waitingOrders === 1 ? "order" : "orders"} to deal with.
            </span>
          )}
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
      <button className={`${primaryButton} self-start sm:self-auto`} disabled={busy} onClick={() => void resume()}>
        {busy ? <Spinner size={13} /> : <RotateCcw size={13} />} Resume subscription
      </button>
    </div>
  );
}
