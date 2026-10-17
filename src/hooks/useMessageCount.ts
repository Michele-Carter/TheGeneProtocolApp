import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { adminApi } from "../lib/adminApi";
import { shopApi } from "../lib/shopApi";

// Unread messages, for the badge on Messages: the customer's from the shop, or (owners) every customer's.
// Checked every half minute and when someone comes back to the tab.

const REFRESH_MS = 30_000;

export function useMessageCount(enabled: boolean, isAdmin: boolean) {
  const { getToken } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const result = isAdmin ? await adminApi.unreadMessages(getToken) : await shopApi.unreadMessages(getToken);
      setUnread(result.unread);
    } catch {
      // Keep what's shown; the next check will try again.
    }
  }, [enabled, isAdmin, getToken]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled, refresh]);

  return { unread, refresh };
}
