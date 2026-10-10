import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Bell, BellOff, Send, X } from "lucide-react";
import type { OrderAlertsInfo } from "../../../shared/shop";
import { adminApi } from "../../lib/adminApi";
import {
  currentSubscription,
  needsHomeScreen,
  notificationTip,
  pushSupported,
  subscribeThisDevice,
  thisDeviceName,
  unsubscribeThisDevice,
} from "../../lib/orderAlerts";
import { Card, ErrorNote, primaryButton, secondaryButton } from "./ui";
import { Spinner } from "../LoadingSpinner";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });

// Admin -> Business: a notification on the owner's phone or computer for every new shop order (turned on per
// device; arrives even when the app is closed).
export default function OrderAlertsCard() {
  const { getToken } = useAuth();
  const [info, setInfo] = useState<OrderAlertsInfo | null>(null);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "on" | "off" | "test" | string>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const show = setInfo;

  useEffect(() => {
    adminApi.getAlerts(getToken).then(show).catch((e) => setError((e as Error).message));
    currentSubscription()
      .then((s) => setThisEndpoint(s?.endpoint ?? null))
      .catch(() => setThisEndpoint(null));
  }, [getToken]);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!info) {
    return (
      <Card title="New order alerts">
        {error ? <ErrorNote message={error} /> : <Spinner size={16} className="text-gold-400" />}
      </Card>
    );
  }

  const thisDeviceOn = thisEndpoint != null && info.devices.some((d) => d.endpoint === thisEndpoint);
  const otherDevices = info.devices.filter((d) => d.endpoint !== thisEndpoint);

  return (
    <Card title="New order alerts">
      <div className="space-y-5">
        <ErrorNote message={error} />
        {notice && <p className="text-xs text-emerald-400">{notice}</p>}

        <div className="space-y-2">
          <span className="block text-[11px] font-bold text-white">Notifications</span>
          <p className="text-xs text-slate-400">
            A pop-up on this phone or computer whenever a customer sends an order - even when the app is closed. Tap it to
            open the order. Turn it on separately on each device you want alerts on.
          </p>

          {!info.pushKey ? (
            <p className="text-xs text-slate-500">Phone notifications aren't switched on for PepBiz yet.</p>
          ) : !pushSupported() ? (
            <p className="text-xs text-slate-500">This browser can't show notifications. Open PepBiz in Chrome to turn them on.</p>
          ) : needsHomeScreen() ? (
            <p className="text-xs text-slate-500">
              On iPhone, first add PepBiz to your home screen (Share, then Add to Home Screen), open it from there, and turn
              notifications on in this card.
            </p>
          ) : thisDeviceOn ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <Bell size={13} /> On for this device
              </span>
              <button
                className={secondaryButton}
                disabled={busy != null}
                onClick={() =>
                  void run("test", async () => {
                    await adminApi.testAlert(thisEndpoint, getToken);
                    setNotice("Test sent - it should pop up in a few seconds.");
                  })
                }
              >
                {busy === "test" ? <Spinner size={13} /> : <Send size={13} />} Send a test
              </button>
              <button
                className={secondaryButton}
                disabled={busy != null}
                onClick={() =>
                  void run("off", async () => {
                    const endpoint = await unsubscribeThisDevice();
                    if (endpoint) show(await adminApi.unsubscribeAlerts({ endpoint }, getToken));
                    setThisEndpoint(null);
                  })
                }
              >
                {busy === "off" ? <Spinner size={13} /> : <BellOff size={13} />} Turn off
              </button>
            </div>
          ) : (
            <button
              className={primaryButton}
              disabled={busy != null}
              onClick={() =>
                void run("on", async () => {
                  const subscription = await subscribeThisDevice(info.pushKey!);
                  show(await adminApi.subscribeAlerts(subscription, thisDeviceName(), getToken));
                  setThisEndpoint(subscription.endpoint);
                  setNotice("Done - you'll get a notification here for every new order. Try 'Send a test'.");
                })
              }
            >
              {busy === "on" ? <Spinner size={13} /> : <Bell size={13} />} Turn on for this device
            </button>
          )}

          {thisDeviceOn && <p className="text-[11px] text-slate-500 leading-snug">{notificationTip()}</p>}

          {otherDevices.length > 0 && (
            <div className="pt-1">
              <span className="block text-[11px] text-slate-500 mb-1">Also on for:</span>
              <ul className="space-y-1">
                {otherDevices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                    <span>
                      {d.device || "A device"} <span className="text-slate-500">- since {date(d.createdAt)}</span>
                    </span>
                    <button
                      className="text-slate-500 hover:text-red-400 p-1"
                      title="Stop alerts on this device"
                      disabled={busy != null}
                      onClick={() => void run(d.id, async () => show(await adminApi.unsubscribeAlerts({ id: d.id }, getToken)))}
                    >
                      {busy === d.id ? <Spinner size={12} /> : <X size={13} />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
