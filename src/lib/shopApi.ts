import type { CustomerDetails, ShippingAddress } from "../../shared/customers";

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
};
