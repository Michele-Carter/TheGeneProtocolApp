import type { BillingInfo, BusinessInfo, AccessState, RegionCode } from "../../shared/billing";

// Which business the app is being used as. Customers join a business by opening its shop link
// (/shop/<slug>); the slug is remembered and sent with every request (the server checks it). Owners always
// use their own business, whatever link they opened.

const SLUG_KEY = "peppal.business.v1";
const START_KEY = "peppal.startBusiness.v1";

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value == null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Without storage the link only works until the page is reloaded.
  }
}

let slug: string | null = read(() => window.localStorage, SLUG_KEY);
let startRequested = read(() => window.sessionStorage, START_KEY) === "1";

// Picks up /shop/<slug> and /start from the address, then tidies the address back to the app's home.
(function captureFromUrl() {
  const shop = /^\/shop\/([a-z0-9-]{3,40})\/?$/i.exec(window.location.pathname);
  if (shop) {
    slug = shop[1].toLowerCase();
    write(() => window.localStorage, SLUG_KEY, slug);
  } else if (/^\/start\/?$/i.test(window.location.pathname)) {
    startRequested = true;
    write(() => window.sessionStorage, START_KEY, "1");
  } else {
    return;
  }
  window.history.replaceState(null, "", "/" + window.location.search);
})();

export const shopSlug = () => slug;
export function forgetShopSlug() {
  slug = null;
  write(() => window.localStorage, SLUG_KEY, null);
}

// Someone came to set up their own business (/start).
export const wantsToStartBusiness = () => startRequested;
export function setWantsToStartBusiness(value: boolean) {
  startRequested = value;
  write(() => window.sessionStorage, START_KEY, value ? "1" : null);
}

// Added to every API request.
export function businessHeaders(): Record<string, string> {
  return slug ? { "X-Business": slug } : {};
}

// ---- /api/business ----

type GetToken = () => Promise<string | null>;

export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string | null) {
    super(message);
  }
}

async function businessFetch<T>(path: string, init: RequestInit, getToken: GetToken | null): Promise<T> {
  const token = getToken ? await getToken() : null;
  if (getToken && !token) throw new ApiError("You're signed out - please sign in again.", 401, null);
  const response = await fetch(`/api/business/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(body?.error ?? `Request failed (${response.status})`, response.status, body?.code ?? null);
  return body as T;
}

export const businessApi = {
  // The name and logo behind a shop link, shown on the sign-in page (no sign-in needed).
  shop: (s: string) => businessFetch<BusinessInfo>(`shop?slug=${encodeURIComponent(s)}`, { method: "GET" }, null),
  checkSlug: (s: string, t: GetToken) =>
    businessFetch<{ available: boolean; problem: string | null }>(`slug?slug=${encodeURIComponent(s)}`, { method: "GET" }, t),
  create: (data: { name: string; slug: string; region: RegionCode }, t: GetToken) =>
    businessFetch<{ slug: string }>("create", { method: "POST", body: JSON.stringify(data) }, t),
  checkout: (t: GetToken) => businessFetch<{ url: string }>("checkout", { method: "POST", body: "{}" }, t),
  portal: (t: GetToken) => businessFetch<{ url: string }>("portal", { method: "POST", body: "{}" }, t),
  sync: (t: GetToken) => businessFetch<{ billing: BillingInfo }>("sync", { method: "POST", body: "{}" }, t),
  rename: (name: string, t: GetToken) => businessFetch<{ name: string }>("details", { method: "PATCH", body: JSON.stringify({ name }) }, t),
  uploadLogo: (dataUrl: string, t: GetToken) =>
    businessFetch<{ logoUrl: string | null }>("logo", { method: "POST", body: JSON.stringify({ dataUrl }) }, t),
  removeLogo: (t: GetToken) => businessFetch<{ logoUrl: string | null }>("logo", { method: "DELETE" }, t),
};

// What /api/admin/me says about the business the app is being used as.
export interface BusinessContext {
  isAdmin: boolean;
  business: BusinessInfo;
  access: AccessState;
  billing: BillingInfo | null; // owners only
}
