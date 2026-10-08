import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { adminApi } from "../lib/adminApi";

// Asks the server whether the signed-in user is the owner. The server re-checks on every
// admin request, so this only decides whether the Admin tab is shown.
export function useIsAdmin(enabled: boolean): boolean {
  const { getToken, userId } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !userId) {
      setIsAdmin(false);
      return;
    }
    adminApi
      .me(getToken)
      .then((result) => {
        if (!cancelled) setIsAdmin(result.isAdmin);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, getToken]);

  return isAdmin;
}
