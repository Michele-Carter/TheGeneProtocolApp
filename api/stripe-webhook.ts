import { stripe, syncFromStripe } from "./_lib/billing.js";
import { sendJson } from "./_lib/http.js";

// POST /api/stripe-webhook - Stripe tells us a business's subscription changed (trial started, payment failed,
// cancelled...), and the business's access is updated to match. Set up in Stripe -> Developers -> Webhooks,
// with its signing secret in STRIPE_WEBHOOK_SECRET.

const SUBSCRIPTION_EVENTS = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
    "invoice.payment_failed",
    "invoice.paid",
]);

// Stripe's signature is over the exact bytes it sent, so read the body unparsed.
async function rawBody(req: any): Promise<Buffer> {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === "string") return Buffer.from(req.body);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
}

export const config = { api: { bodyParser: false } };

export default async function handler(req: any, res: any) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return sendJson(res, 405, { error: "Method not allowed" });
    }
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return sendJson(res, 500, { error: "STRIPE_WEBHOOK_SECRET is missing" });

    let event;
    try {
        event = stripe().webhooks.constructEvent(await rawBody(req), req.headers["stripe-signature"], secret);
    } catch (error) {
        console.error("Stripe webhook signature check failed:", error);
        return sendJson(res, 400, { error: "Invalid signature" });
    }

    if (SUBSCRIPTION_EVENTS.has(event.type)) {
        const customer = (event.data.object as { customer?: string | { id: string } | null }).customer;
        const customerId = typeof customer === "string" ? customer : customer?.id;
        if (customerId) {
            try {
                await syncFromStripe(customerId);
            } catch (error) {
                // Stripe retries a failed webhook, so let it.
                console.error(`Syncing Stripe customer ${customerId} failed:`, error);
                return sendJson(res, 500, { error: "Sync failed" });
            }
        }
    }
    return sendJson(res, 200, { received: true });
}
