import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import type { CartLine } from "../../shared/shop";

// The shopping cart, kept in this browser per signed-in user so it survives a refresh.
// Prices and stock are always re-checked by the server when the order is sent.
// While the customer is changing one of their orders, the cart holds that order's items and sending it updates the
// order instead of placing a new one.

const storageKey = (userId: string | null | undefined) => `peppal-cart:${userId ?? "anon"}`;
const editingKey = (userId: string | null | undefined) => `peppal-cart-editing:${userId ?? "anon"}`;

export interface EditingOrder {
  orderId: string;
  orderNumber: number;
  notes: string;
}

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

function readEditing(key: string): EditingOrder | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
    return typeof parsed?.orderId === "string" && Number.isInteger(parsed?.orderNumber)
      ? { orderId: parsed.orderId, orderNumber: parsed.orderNumber, notes: typeof parsed.notes === "string" ? parsed.notes : "" }
      : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked (e.g. private browsing) - the cart still works until the page is closed.
  }
}

export function useCart() {
  const { userId } = useAuth();
  const key = storageKey(userId);
  const editKey = editingKey(userId);
  const [lines, setLines] = useState<CartLine[]>(() => read(key));
  const [editing, setEditing] = useState<EditingOrder | null>(() => readEditing(editKey));

  useEffect(() => setLines(read(key)), [key]);
  useEffect(() => setEditing(readEditing(editKey)), [editKey]);

  const save = useCallback(
    (update: (lines: CartLine[]) => CartLine[]) =>
      setLines((current) => {
        const next = update(current).filter((l) => l.qty > 0);
        write(key, next);
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

  // Empties the cart, and stops changing an order if one was being changed (it stays as it was).
  const clear = useCallback(() => {
    save(() => []);
    write(editKey, null);
    setEditing(null);
  }, [save, editKey]);

  // Puts an order's items in the cart to change them.
  const startEditing = useCallback(
    (order: EditingOrder, orderLines: CartLine[]) => {
      save(() => orderLines);
      write(editKey, order);
      setEditing(order);
    },
    [save, editKey]
  );

  const count = lines.reduce((t, l) => t + l.qty, 0);
  const qtyOf = (lineKey: string) => lines.find((l) => l.key === lineKey)?.qty ?? 0;

  return { lines, count, add, setQty, remove, clear, qtyOf, editing, startEditing };
}

export type Cart = ReturnType<typeof useCart>;
