import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { adminApi } from "../lib/adminApi";

const REFRESH_MS = 60_000;

// How many shop orders are waiting for the owner to confirm, for the badge on the admin menu.
// Checks every minute while the app is open, and again whenever `refresh` is called.
export function useWaitingOrders(enabled: boolean) {
  const { getToken } = useAuth();
  const [waiting, setWaiting] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setWaiting((await adminApi.waitingShopOrders(getToken)).waiting);
    } catch {
      // Keep the last count; the next check will try again.
    }
  }, [enabled, getToken]);

  useEffect(() => {
    if (!enabled) {
      setWaiting(0);
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  return { waiting, refresh };
}
