import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Bell, BellOff } from "lucide-react";
import {
  customerNotificationState,
  turnOffCustomerNotifications,
  turnOnCustomerNotifications,
  type NotificationState,
} from "../../lib/customerNotifications";
import { notificationTip } from "../../lib/orderAlerts";
import { Card, ErrorNote, primaryButton, secondaryButton } from "../admin/ui";
import { Spinner } from "../LoadingSpinner";

// My Details: whether this phone/computer gets a notification when the customer's orders are updated.
export default function NotificationsCard() {
  const { getToken } = useAuth();
  const [state, setState] = useState<NotificationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await customerNotificationState(getToken));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message || "Couldn't check notifications.");
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const change = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (on) await turnOnCustomerNotifications(getToken);
      else await turnOffCustomerNotifications(getToken);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await load();
      setBusy(false);
    }
  };

  if (state == null && !loadError) return null;

  return (
    <Card title="Notifications">
      <div className="space-y-3">
        <p className="text-xs text-slate-400">
          A notification on this phone or computer when your order is confirmed, changed or marked as paid, or the shop
          messages you - even when the app is closed.
        </p>
        <ErrorNote message={error} />

        {loadError ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">Couldn't check notifications on this device ({loadError}).</p>
            <button className={secondaryButton} onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : state === "unsupported" ? (
          <p className="text-xs text-slate-400">
            This browser can't show notifications. Open this page in Chrome (or Safari on iPhone) to turn them on.
          </p>
        ) : state === "not-set-up" ? (
          <p className="text-xs text-slate-400">Notifications aren't available yet - please check back later.</p>
        ) : state === "needs-home-screen" ? (
          <div className="text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-white">On iPhone, add this app to your home screen first:</p>
            <ol className="list-decimal pl-5 space-y-0.5 text-slate-400">
              <li>Open this page in Safari.</li>
              <li>Tap the Share button, then Add to Home Screen.</li>
              <li>Open the app from the new icon on your home screen and sign in.</li>
              <li>Come back to My Details and tap Turn on.</li>
            </ol>
          </div>
        ) : state === "on" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <Bell size={13} /> On for this device
              </span>
              <button className={secondaryButton} disabled={busy} onClick={() => void change(false)}>
                {busy ? <Spinner size={13} /> : <BellOff size={13} />} Turn off
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">{notificationTip()}</p>
          </>
        ) : state === "blocked" ? (
          <p className="text-xs text-slate-400">
            Notifications are blocked for this site. To turn them on, allow notifications in your browser's settings for
            this site (tap the icon next to the address), then come back here.
          </p>
        ) : (
          <button className={primaryButton} disabled={busy} onClick={() => void change(true)}>
            {busy ? <Spinner size={13} /> : <Bell size={13} />} Turn on
          </button>
        )}
      </div>
    </Card>
  );
}
