import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import type { CustomerNotification } from "../../shared/shop";
import { shopApi } from "../lib/shopApi";

const REFRESH_MS = 60_000;

// The signed-in customer's notifications (order confirmed / declined / on its way), checked every minute.
export function useNotifications(enabled: boolean) {
  const { getToken } = useAuth();
  const [items, setItems] = useState<CustomerNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const result = await shopApi.notifications(getToken);
      setItems(result.items);
      setUnread(result.unread);
    } catch {
      // Keep what's shown; the next check will try again.
    }
  }, [enabled, getToken]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  const markAllRead = useCallback(async () => {
    if (unread === 0) return;
    setUnread(0);
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    try {
      await shopApi.markNotificationsRead(getToken);
    } catch {
      void refresh();
    }
  }, [unread, getToken, refresh]);

  return { items, unread, refresh, markAllRead };
}
