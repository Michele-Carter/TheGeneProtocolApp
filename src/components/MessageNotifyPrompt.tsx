import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Bell, X } from "lucide-react";
import { customerNotificationState, turnOnCustomerNotifications } from "../lib/customerNotifications";
import { currentSubscription, needsHomeScreen, pushSupported, subscribeThisDevice, thisDeviceName } from "../lib/orderAlerts";
import { adminApi } from "../lib/adminApi";
import { primaryButton } from "./admin/ui";
import { Spinner } from "./LoadingSpinner";

// A slim "get notified" prompt at the top of the Messages screens, shown only while this device isn't getting
// notifications and could. Hidden for good on this device with the X. The customer and the owner each have their
// own (one browser can be both - an owner trying their own shop), so hiding one never hides the other.

type Shown = "off" | "needs-home-screen" | null;

const hiddenKey = (who: "customer" | "owner") => `peppal.messageNotifyHidden.${who}.v1`;
function isHidden(who: "customer" | "owner") {
  try {
    return window.localStorage.getItem(hiddenKey(who)) === "1";
  } catch {
    return false;
  }
}
function hide(who: "customer" | "owner") {
  try {
    window.localStorage.setItem(hiddenKey(who), "1");
  } catch {
    // Only means the prompt comes back next time.
  }
}

function Prompt({
  who,
  shown,
  text,
  onTurnOn,
  onDone,
  className = "",
}: {
  who: "customer" | "owner";
  shown: Shown;
  text: string;
  onTurnOn: () => Promise<void>;
  onDone: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [dismissed, setDismissed] = useState(() => isHidden(who));

  if (dismissed || (!shown && !done)) return null;

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      await onTurnOn();
      setDone(true);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex items-start gap-3 rounded-xl border border-gold-500/30 bg-gold-500/10 px-3 py-2.5 ${className}`}>
      <Bell size={15} className="mt-0.5 flex-shrink-0 text-gold-400" />
      <div className="min-w-0 flex-1 space-y-2">
        {done ? (
          <p className="text-xs font-semibold text-emerald-400">Done - notifications are on for this device.</p>
        ) : shown === "needs-home-screen" ? (
          <p className="text-xs text-slate-400">
            <span className="font-bold text-white">Want a notification for new messages?</span> On iPhone, add this app to your home screen
            first (Share, then Add to Home Screen) and open it from there.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-400">{text}</p>
            <button className={primaryButton} disabled={busy} onClick={() => void turnOn()}>
              {busy ? <Spinner size={13} /> : <Bell size={13} />} Turn on notifications
            </button>
          </>
        )}
        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>
      <button
        className="-m-1 cursor-pointer rounded p-1 text-slate-500 hover:text-white"
        aria-label="Hide"
        title="Don't show this again"
        onClick={() => {
          hide(who);
          setDismissed(true);
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// Customer: in their Messages window.
export function CustomerMessageNotify({ shopName, className }: { shopName: string; className?: string }) {
  const { getToken } = useAuth();
  const [shown, setShown] = useState<Shown>(null);

  const check = useCallback(async () => {
    try {
      const state = await customerNotificationState(getToken);
      setShown(state === "off" || state === "needs-home-screen" ? state : null);
    } catch {
      setShown(null);
    }
  }, [getToken]);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <Prompt
      who="customer"
      shown={shown}
      text={`Get a notification on this phone or computer when ${shopName} replies - and when your orders are updated.`}
      onTurnOn={() => turnOnCustomerNotifications(getToken)}
      onDone={() => setShown(null)}
      className={className}
    />
  );
}

// Owner: on the Messages page.
export function OwnerMessageNotify({ className }: { className?: string }) {
  const { getToken } = useAuth();
  const [shown, setShown] = useState<Shown>(null);
  const [pushKey, setPushKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) return;
      const info = await adminApi.getAlerts(getToken);
      if (!info.pushKey || cancelled) return;
      setPushKey(info.pushKey);
      if (needsHomeScreen()) return setShown("needs-home-screen");
      if (Notification.permission === "denied") return;
      const subscription = await currentSubscription();
      const on = subscription != null && info.devices.some((d) => d.endpoint === subscription.endpoint);
      if (!cancelled) setShown(on ? null : "off");
    })().catch(() => setShown(null));
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return (
    <Prompt
      who="owner"
      shown={shown}
      text="Get a notification on this phone or computer when a customer messages you (and for new orders), even when the app is closed."
      onTurnOn={async () => {
        const subscription = await subscribeThisDevice(pushKey!);
        await adminApi.subscribeAlerts(subscription, thisDeviceName(), getToken);
      }}
      onDone={() => setShown(null)}
      className={className}
    />
  );
}
