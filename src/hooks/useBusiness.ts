import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { adminApi } from "../lib/adminApi";
import { ApiError, businessApi, forgetShopSlug, type BusinessContext } from "../lib/business";

// Which business the signed-in user is using the app as, whether they own it (shows Admin), and whether it
// can be used right now. The server re-checks all of this on every request; this decides what to show.
export type BusinessState =
  | { status: "loading" }
  | { status: "ready"; context: BusinessContext }
  | { status: "no-business" } // not an owner and hasn't opened a shop link yet
  | { status: "shop-not-found" } // the shop link they opened doesn't exist
  | { status: "error"; message: string };

export function useBusiness(enabled: boolean) {
  const { getToken, userId } = useAuth();
  const [state, setState] = useState<BusinessState>({ status: "loading" });

  const refresh = useCallback(async () => {
    if (!enabled || !userId) return;
    try {
      // Back from Stripe's checkout or billing page: start the subscription / pick up the change straight away,
      // rather than waiting for Stripe to tell the server.
      const params = new URLSearchParams(window.location.search);
      let notice: string | null = null;
      if (params.has("billing")) {
        const sessionId = params.get("session_id");
        params.delete("billing");
        params.delete("session_id");
        const rest = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
        notice = await businessApi
          .sync(sessionId, getToken)
          .then((r) => r.problem)
          .catch(() => null);
      }
      // A sign-in token can be refused just as it expires: try once more before giving up.
      const context = await adminApi.me(getToken).catch(async (error) => {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        return adminApi.me(getToken);
      });
      setState({ status: "ready", context: { ...context, notice } });
    } catch (error) {
      if (error instanceof ApiError && error.code === "shop-not-found") {
        forgetShopSlug();
        setState({ status: "shop-not-found" });
      } else if (error instanceof ApiError && error.code === "no-business") {
        setState({ status: "no-business" });
      } else {
        // A passing failure (e.g. a sign-in token expiring mid-check) while the app is open keeps it open -
        // the next check, on the next page change, tries again. Only a failed first load shows the error.
        setState((prev) => (prev.status === "ready" ? prev : { status: "error", message: (error as Error).message }));
      }
    }
  }, [enabled, userId, getToken]);

  useEffect(() => {
    if (!enabled || !userId) {
      setState({ status: "loading" });
      return;
    }
    void refresh();
  }, [enabled, userId, refresh]);

  return { state, refresh };
}
