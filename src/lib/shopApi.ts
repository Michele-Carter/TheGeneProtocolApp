import type { CustomerDetails, ShippingAddress } from "../../shared/customers";
import type { CartLine, ChatMessage, CustomerNotification, ShopOrder, ShopProduct } from "../../shared/shop";
import { businessHeaders } from "./business";
import { signedInFetch } from "./signedInFetch";
import { appLocale, homeCurrency } from "./locale";
import type { PushSubscriptionData } from "./orderAlerts";
import type { StorewideSale } from "../../shared/specials";

// Calls made by signed-in customers (api/shop). The server only ever returns the caller's own data.

type GetToken = () => Promise<string | null>;

export interface MyDetails extends CustomerDetails {
  addressComplete: boolean;
}

async function shopFetch<T>(path: string, init: RequestInit, getToken: GetToken): Promise<T> {
  const response = await signedInFetch(getToken, (token) =>
    fetch(`/api/shop/${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...businessHeaders(),
        ...(init.headers ?? {}),
      },
    })
  );
  if (!response) throw new Error("You're signed out - please sign in again.");

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
  sale: (t: GetToken) => shopFetch<{ sale: StorewideSale | null }>("sale", { method: "GET" }, t),
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

  // Phone/computer notifications for the customer's order updates (src/lib/customerNotifications.ts).
  pushInfo: (t: GetToken) => shopFetch<PushInfo>("push", { method: "GET" }, t),
  subscribePush: (subscription: PushSubscriptionData, device: string, t: GetToken) =>
    shopFetch<PushInfo>("push?action=subscribe", { method: "POST", body: JSON.stringify({ subscription, device }) }, t),
  unsubscribePush: (endpoint: string, t: GetToken) =>
    shopFetch<PushInfo>("push?action=unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }, t),

  // The customer's conversation with the shop.
  messages: (t: GetToken) => shopFetch<{ unread: number; messages: ChatMessage[] }>("messages", { method: "GET" }, t),
  unreadMessages: (t: GetToken) => shopFetch<{ unread: number }>("messages?summary=1", { method: "GET" }, t),
  sendMessage: (body: string, shopOrderId: string | null, t: GetToken) =>
    shopFetch<{ message: ChatMessage }>("messages", { method: "POST", body: JSON.stringify({ body, shopOrderId }) }, t),
  markMessagesRead: (t: GetToken) => shopFetch<{ success: true }>("messages?action=read", { method: "POST", body: "{}" }, t),
};

export interface PushInfo {
  pushKey: string | null; // null until notifications are set up on the server
  endpoints: string[]; // the customer's devices that get notifications
}

// Prices as customers see them: the shop's currency with its local symbol, e.g. "$90.00" or "£90.00".
export const money = (value: number) =>
  value.toLocaleString(appLocale(), { style: "currency", currency: homeCurrency(), currencyDisplay: "narrowSymbol" });
