import "./env.js";
import Stripe from "stripe";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./db.js";
import { businesses } from "./schema.js";
import { PLANS, TRIAL_DAYS, accessState, planFor, type BillingInfo, type PlanId } from "../../shared/billing.js";

// Business subscriptions through Stripe. Owners enter their card on Stripe's own pages (Checkout to start, the
// billing portal to change card or cancel), so card details never reach the app. Starting is two steps:
// Checkout only saves the card, then completeCheckout checks it (NZ pricing needs an NZ card) and starts the
// subscription. Stripe tells us about later changes through api/stripe-webhook.ts; syncFromStripe copies the
// subscription's state onto the business.

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
        hadSubscription: b.stripeSubscriptionId != null,
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

// Step 1: a Stripe Checkout page that saves the owner's card and billing address. Nothing is charged and no
// subscription exists until completeCheckout has checked the card.
export async function checkoutUrl(business: Business, returnTo: string): Promise<string> {
    const customer = await customerFor(business);
    const session = await stripe().checkout.sessions.create({
        mode: "setup",
        customer,
        currency: PLANS[planFor(business.country)].currency,
        allowed_payment_method_types: ["card"],
        billing_address_collection: "required",
        client_reference_id: business.id,
        metadata: { business_id: business.id },
        setup_intent_data: { metadata: { business_id: business.id } },
        success_url: `${returnTo}/?billing=done&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${returnTo}/?billing=cancelled`,
    });
    if (!session.url) throw new Error("Stripe didn't return a checkout page");
    return session.url;
}

// The NZ price is for New Zealand businesses, so it needs a card issued in New Zealand.
export const WRONG_REGION_MESSAGE =
    "That card is from outside New Zealand, so it can't be used for the New Zealand price. Choose \"International\" below (US$20 a month) and try again.";

// Step 2, once the owner has saved their card (when they come back from Stripe, or when Stripe's webhook
// says so - whichever is first; both are safe to run). Checks the card, then starts the subscription with
// the free trial if it's the business's first. Returns why it didn't start, if it didn't.
export async function completeCheckout(sessionId: string, ownerBusinessId?: string): Promise<{ problem: string | null }> {
    const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["setup_intent.payment_method"] });
    if (session.mode !== "setup" || session.status !== "complete") return { problem: null };
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const [business] = customerId ? await getDb().select().from(businesses).where(eq(businesses.stripeCustomerId, customerId)) : [];
    if (!business || (ownerBusinessId && business.id !== ownerBusinessId)) return { problem: null };

    const intent = session.setup_intent;
    const card = intent && typeof intent !== "string" && typeof intent.payment_method !== "string" ? intent.payment_method : null;
    if (!card) return { problem: "Stripe didn't save a card - please try again." };
    // The same key from both callers gives one subscription.
    return startWithCard(business, card, `start-subscription-${session.id}`);
}

// Checks a saved card is allowed for the business's price, and if so starts the subscription with it.
export async function startWithCard(business: Business, card: Stripe.PaymentMethod, idempotencyKey: string): Promise<{ problem: string | null }> {
    const customerId = business.stripeCustomerId!;
    if (business.country === "NZ" && card.card?.country && card.card.country !== "NZ") {
        await stripe().paymentMethods.detach(card.id).catch(() => undefined); // already removed by the other caller
        return { problem: WRONG_REGION_MESSAGE };
    }

    if (!(accessState(business) === "ok" && business.subscriptionStatus)) {
        await stripe().subscriptions.create(
            {
                customer: customerId,
                items: [{ price: await priceId(planFor(business.country)) }],
                default_payment_method: card.id,
                off_session: true,
                ...(business.stripeSubscriptionId ? {} : { trial_period_days: TRIAL_DAYS }),
                metadata: { business_id: business.id },
            },
            { idempotencyKey }
        );
    }
    await syncFromStripe(customerId);
    return { problem: null };
}

// Switching between the NZ and overseas price, before a subscription is running. The business gets a fresh
// Stripe customer, as a Stripe customer can only ever pay in one currency.
export async function changeRegion(business: Business, region: string): Promise<void> {
    await getDb()
        .update(businesses)
        .set({ country: region, ...(region !== business.country ? { stripeCustomerId: null } : {}), updatedAt: new Date() })
        .where(eq(businesses.id, business.id));
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
