import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { adminApi } from "../lib/adminApi";

const REFRESH_MS = 60_000;

// Shop orders needing the owner: new ones to confirm, and ones the customer says they've paid.
// Checked every minute while the app is open, and again whenever `refresh` is called.
export function useWaitingOrders(enabled: boolean) {
  const { getToken } = useAuth();
  const [counts, setCounts] = useState({ waiting: 0, paymentsToCheck: 0 });

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setCounts(await adminApi.waitingShopOrders(getToken));
    } catch {
      // Keep the last count; the next check will try again.
    }
  }, [enabled, getToken]);

  useEffect(() => {
    if (!enabled) {
      setCounts({ waiting: 0, paymentsToCheck: 0 });
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  return { ...counts, total: counts.waiting + counts.paymentsToCheck, refresh };
}
