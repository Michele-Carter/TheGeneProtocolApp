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

// The Privacy Policy and Terms promise a business's data is kept for this long after its subscription ends,
// then deleted (api/_lib/cleanup.ts).
export const KEEP_DAYS_AFTER_ENDING = 30;

// When a business is due to be deleted, or null while it's kept. Only a business whose subscription was
// cancelled and has ended, or one that never started a subscription (an abandoned sign-up), counts down
// from when that happened. One whose payment failed is kept until Stripe cancels it; exempt and suspended
// businesses are never deleted.
export function deletionDate(b: {
  status: string;
  billingExempt: boolean;
  subscriptionStatus: string | null;
  subscriptionEndedAt: Date | null;
  createdAt: Date;
}): Date | null {
  if (b.status !== "active" || b.billingExempt) return null;
  let from: Date | null = null;
  if (b.subscriptionStatus === "canceled") from = b.subscriptionEndedAt;
  else if (accessState(b) === "needs-checkout") {
    from = b.subscriptionEndedAt && b.subscriptionEndedAt > b.createdAt ? b.subscriptionEndedAt : b.createdAt;
  }
  return from ? new Date(from.getTime() + KEEP_DAYS_AFTER_ENDING * 24 * 60 * 60 * 1000) : null;
}

// What a shop link shows before sign-in.
export interface BusinessInfo {
  name: string;
  slug: string;
  logoUrl: string | null;
  contactEmail?: string; // how its customers reach it (its privacy notice)
}

// What the app is told about the business it's being used as (see shared/countries.ts).
export interface BusinessSettings extends BusinessInfo {
  country: string;
  currency: string;
  timeZone: string;
  contactEmail: string; // the email customers see (the owner's sign-in email unless customContactEmail is set)
  customContactEmail: string; // the one set on the Business page, or ""
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
  trialDays: number; // its free trial: 14 days, or longer from an invite link
  deleteOn: string | null; // when the business will be deleted if it isn't restarted (deletionDate)
  // The country (and so currency) can't change any more: the business has recorded money (/api/admin/me only).
  countryLocked?: boolean;
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

