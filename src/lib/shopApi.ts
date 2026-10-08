import type { CustomerDetails, ShippingAddress } from "../../shared/customers";
import type { CartLine, CustomerNotification, ShopOrder, ShopProduct } from "../../shared/shop";
import { businessHeaders } from "./business";

// Calls made by signed-in customers (api/shop). The server only ever returns the caller's own data.

type GetToken = () => Promise<string | null>;

export interface MyDetails extends CustomerDetails {
  addressComplete: boolean;
}

async function shopFetch<T>(path: string, init: RequestInit, getToken: GetToken): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("You're signed out - please sign in again.");

  const response = await fetch(`/api/shop/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...businessHeaders(),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return body as T;
}

export const shopApi = {
  me: (t: GetToken) => shopFetch<MyDetails>("me", { method: "GET" }, t),
  updateMe: (data: { name: string; email: string; shippingAddress: ShippingAddress }, t: GetToken) =>
    shopFetch<MyDetails>("me", { method: "PUT", body: JSON.stringify(data) }, t),

  products: (t: GetToken) => shopFetch<ShopProduct[]>("products", { method: "GET" }, t),
  orders: (t: GetToken) => shopFetch<ShopOrder[]>("orders", { method: "GET" }, t),
  sendOrder: (data: { lines: CartLine[]; notes: string }, t: GetToken) =>
    shopFetch<ShopOrder>("orders", { method: "POST", body: JSON.stringify(data) }, t),
  reportPayment: (id: string, reference: string, t: GetToken) =>
    shopFetch<ShopOrder>(
      `orders?id=${encodeURIComponent(id)}&action=paid`,
      { method: "POST", body: JSON.stringify({ reference }) },
      t
    ),
  cancelOrder: (id: string, t: GetToken) =>
    shopFetch<ShopOrder>(`orders?id=${encodeURIComponent(id)}&action=cancel`, { method: "POST", body: "{}" }, t),

  notifications: (t: GetToken) =>
    shopFetch<{ unread: number; items: CustomerNotification[] }>("notifications", { method: "GET" }, t),
  markNotificationsRead: (t: GetToken) =>
    shopFetch<{ success: true }>("notifications?action=read", { method: "POST", body: "{}" }, t),
};

export const money = (value: number) =>
  `$${value.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
