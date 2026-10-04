import "./env.js";
import Stripe from "stripe";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./db.js";
import { businesses } from "./schema.js";
import { PLANS, TRIAL_DAYS, accessState, planFor, type BillingInfo, type PlanId } from "../../shared/billing.js";

// Business subscriptions through Stripe. Businesses pay on Stripe's own pages (Checkout to start, the billing
// portal to change card or cancel), so card details never reach the app. Stripe tells us about changes
// through api/stripe-webhook.ts; syncFromStripe copies the subscription's state onto the business.

type Business = typeof businesses.$inferSelect;

let client: Stripe | null = null;
export function stripe(): Stripe {
    if (!client) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
        client = new Stripe(key);
    }
    return client;
}

export function billingInfo(b: Business): BillingInfo {
    return {
        state: accessState(b),
        exempt: b.billingExempt,
        plan: planFor(b.country),
        subscriptionStatus: b.subscriptionStatus,
        trialEndsAt: b.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: b.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: b.cancelAtPeriodEnd,
    };
}

// The app's address, for sending people back from Stripe's pages.
export function appUrl(req: any): string {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
    const proto = req.headers?.["x-forwarded-proto"] ?? (String(req.headers?.host ?? "").startsWith("localhost") ? "http" : "https");
    return `${proto}://${req.headers?.host}`;
}

// The monthly price for a plan (created by scripts/setupStripe.ts, found by its lookup key).
async function priceId(plan: PlanId): Promise<string> {
    const { lookupKey } = PLANS[plan];
    const { data } = await stripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    if (!data[0]) throw new Error(`Stripe has no price "${lookupKey}" - run scripts/setupStripe.ts`);
    return data[0].id;
}

// The business's Stripe customer, created the first time it's needed.
async function customerFor(business: Business): Promise<string> {
    if (business.stripeCustomerId) return business.stripeCustomerId;
    const customer = await stripe().customers.create({
        name: business.name,
        email: business.ownerEmail || undefined,
        metadata: { business_id: business.id },
    });
    const [saved] = await getDb()
        .update(businesses)
        .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
        .where(and(eq(businesses.id, business.id), isNull(businesses.stripeCustomerId)))
        .returning();
    if (saved) return customer.id;
    // Another request got there first: use theirs and drop ours.
    await stripe().customers.del(customer.id);
    const [current] = await getDb().select().from(businesses).where(eq(businesses.id, business.id));
    return current.stripeCustomerId!;
}

// A Stripe Checkout page where the owner enters their card and starts the subscription. The first
// subscription a business takes out starts with the free trial.
export async function checkoutUrl(business: Business, returnTo: string): Promise<string> {
    const customer = await customerFor(business);
    const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        customer,
        client_reference_id: business.id,
        line_items: [{ price: await priceId(planFor(business.country)), quantity: 1 }],
        payment_method_collection: "always",
        subscription_data: {
            ...(business.stripeSubscriptionId ? {} : { trial_period_days: TRIAL_DAYS }),
            metadata: { business_id: business.id },
        },
        success_url: `${returnTo}/?billing=done`,
        cancel_url: `${returnTo}/?billing=cancelled`,
    });
    if (!session.url) throw new Error("Stripe didn't return a checkout page");
    return session.url;
}

// Stripe's billing page, where the owner can change their card, see invoices or cancel.
export async function billingPortalUrl(business: Business, returnTo: string): Promise<string> {
    if (!business.stripeCustomerId) throw new Error("This business hasn't set up a subscription yet.");
    const session = await stripe().billingPortal.sessions.create({ customer: business.stripeCustomerId, return_url: `${returnTo}/` });
    return session.url;
}

// Copies the state of a Stripe customer's subscription onto their business. The subscription that matters is
// the newest one that hasn't ended (else the newest one).
export async function syncFromStripe(customerId: string): Promise<Business | null> {
    const { data } = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    const newestFirst = [...data].sort((a, b) => b.created - a.created);
    const sub = newestFirst.find((s) => s.status !== "canceled" && s.status !== "incomplete_expired") ?? newestFirst[0];
    const at = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);
    const [business] = await getDb()
        .update(businesses)
        .set({
            stripeSubscriptionId: sub?.id ?? null,
            subscriptionStatus: sub?.status ?? null,
            trialEndsAt: at(sub?.trial_end),
            currentPeriodEnd: at(sub?.items.data[0]?.current_period_end),
            cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
            updatedAt: new Date(),
        })
        .where(eq(businesses.stripeCustomerId, customerId))
        .returning();
    return business ?? null;
}
