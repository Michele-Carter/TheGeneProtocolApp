// Businesses pay a monthly subscription to use PepBiz: NZ$20 in New Zealand, US$20 everywhere else, after a
// 14-day free trial (card taken up front). Payments are handled by Stripe (api/_lib/billing.ts).

export const TRIAL_DAYS = 14;

export const PLANS = {
  nzd: { currency: "nzd", amount: 20, label: "NZ$20 a month", lookupKey: "peppal_monthly_nzd" },
  usd: { currency: "usd", amount: 20, label: "US$20 a month", lookupKey: "peppal_monthly_usd" },
} as const;
export type PlanId = keyof typeof PLANS;

export const planFor = (country: string): PlanId => (country === "NZ" ? "nzd" : "usd");

// Whether a business can be used right now:
//   ok              subscribed (or trialing, or a payment is being retried), or never pays
//   needs-checkout  signed up but hasn't started their trial yet
//   paused          subscription ended or payments stopped (or suspended by the platform owner)
export type AccessState = "ok" | "needs-checkout" | "paused";

const PAYING = new Set(["trialing", "active", "past_due"]);

export function accessState(b: { status: string; billingExempt: boolean; subscriptionStatus: string | null }): AccessState {
  if (b.status !== "active") return "paused";
  if (b.billingExempt) return "ok";
  if (b.subscriptionStatus == null || b.subscriptionStatus === "incomplete" || b.subscriptionStatus === "incomplete_expired") {
    return "needs-checkout";
  }
  return PAYING.has(b.subscriptionStatus) ? "ok" : "paused";
}

// What the app is told about the business it's being used as.
export interface BusinessInfo {
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface BillingInfo {
  state: AccessState;
  exempt: boolean;
  plan: PlanId;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hadSubscription: boolean; // the free trial is only for a business's first subscription
}

// ---- Shop links: /shop/<slug> ----

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVED_SLUGS = new Set(["start", "shop", "api", "admin", "app", "www", "peppal", "pepbiz", "help", "support", "billing", "login", "signup"]);

export function slugProblem(slug: string): string | null {
  if (!SLUG_PATTERN.test(slug)) return "Use 3-40 lower-case letters, numbers and dashes (not at the start or end).";
  if (RESERVED_SLUGS.has(slug)) return "That link name is reserved - please choose another.";
  return null;
}

export const toSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40)
    .replace(/-$/, "");

// Where a business is, as chosen at sign-up: only whether it's in New Zealand matters (the price and currency).
export const REGIONS = [
  { code: "NZ", label: "New Zealand", price: PLANS.nzd.label },
  { code: "INTL", label: "International", price: PLANS.usd.label },
] as const;
export type RegionCode = (typeof REGIONS)[number]["code"];

// A first guess at where a new business is, from the computer's time zone (the owner can change it). Only
// the matching price is shown unless they do, so businesses overseas don't see the NZ price.
export function guessRegion(): RegionCode {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone === "Pacific/Auckland" || zone === "Pacific/Chatham" || zone === "NZ" ? "NZ" : "INTL";
  } catch {
    return "INTL";
  }
}
