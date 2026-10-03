import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import type { CartLine } from "../../shared/shop";

// The shopping cart, kept in this browser per signed-in user so it survives a refresh.
// Prices and stock are always re-checked by the server when the order is sent.

const storageKey = (userId: string | null | undefined) => `peppal-cart:${userId ?? "anon"}`;

function read(key: string): CartLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((l) => typeof l?.key === "string" && Number.isInteger(l?.qty) && l.qty > 0)
      : [];
  } catch {
    return [];
  }
}

export function useCart() {
  const { userId } = useAuth();
  const key = storageKey(userId);
  const [lines, setLines] = useState<CartLine[]>(() => read(key));

  useEffect(() => setLines(read(key)), [key]);

  const save = useCallback(
    (update: (lines: CartLine[]) => CartLine[]) =>
      setLines((current) => {
        const next = update(current).filter((l) => l.qty > 0);
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage blocked (e.g. private browsing) - the cart still works until the page is closed.
        }
        return next;
      }),
    [key]
  );

  const add = useCallback(
    (lineKey: string, qty: number) =>
      save((current) =>
        current.some((l) => l.key === lineKey)
          ? current.map((l) => (l.key === lineKey ? { ...l, qty: l.qty + qty } : l))
          : [...current, { key: lineKey, qty }]
      ),
    [save]
  );

  const setQty = useCallback(
    (lineKey: string, qty: number) => save((current) => current.map((l) => (l.key === lineKey ? { ...l, qty } : l))),
    [save]
  );

  const remove = useCallback((lineKey: string) => save((current) => current.filter((l) => l.key !== lineKey)), [save]);
  const clear = useCallback(() => save(() => []), [save]);

  const count = lines.reduce((t, l) => t + l.qty, 0);
  const qtyOf = (lineKey: string) => lines.find((l) => l.key === lineKey)?.qty ?? 0;

  return { lines, count, add, setQty, remove, clear, qtyOf };
}

export type Cart = ReturnType<typeof useCart>;
