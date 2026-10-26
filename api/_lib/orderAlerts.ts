import "./env.js";
import { and, eq, inArray, isNull } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";
import { runAsBusiness, type Business, type Db } from "./business.js";
import { pushSubscriptions } from "./schema.js";
import { customerPrice } from "../../shared/countries.js";

// Phone/computer notifications (web push - they arrive even when the app is closed), on the devices people
// turned them on for: the business owner's get new-order alerts, a customer's get their order updates.
// Needs, in .env.local / Vercel:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT   (npx web-push generate-vapid-keys)
// Quietly does nothing until they're there. A notification that fails never affects anything else.

const SEND_TIMEOUT_MS = 8000;

export const pushKey = () => process.env.VAPID_PUBLIC_KEY || null;

let vapidSet = false;
function pushReady(): boolean {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
    if (!vapidSet) {
        webpush.setVapidDetails(
            process.env.VAPID_SUBJECT || "https://pepbiz.io",
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
        vapidSet = true;
    }
    return true;
}

export interface Alert {
    title: string;
    body: string;
    url: string; // opened when the notification is tapped
    tag: string; // a newer alert with the same tag replaces the older one
    icon?: string; // the business logo (owners without one get the PepBiz badge; customers never do)
}

type Subscription = typeof pushSubscriptions.$inferSelect;

// The owner's devices (customer devices have a customer id).
export const ownerDevices = isNull(pushSubscriptions.customerId);

// Sends to each device; returns the ids of devices that no longer exist (the browser was reset or the
// permission withdrawn) so they can be removed.
async function sendPush(subs: Subscription[], alert: Alert): Promise<string[]> {
    if (!subs.length || !pushReady()) return [];
    const payload = JSON.stringify(alert);
    const gone: string[] = [];
    await Promise.allSettled(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload,
                    { TTL: 24 * 60 * 60, urgency: "high", timeout: SEND_TIMEOUT_MS }
                );
            } catch (error: any) {
                if (error?.statusCode === 404 || error?.statusCode === 410) gone.push(sub.id);
                else console.error("Notification failed:", error?.statusCode ?? error);
            }
        })
    );
    return gone;
}

async function sendTo(db: Db, subs: Subscription[], alert: Alert) {
    const gone = await sendPush(subs, alert);
    if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
}

// Notifies every device the owner turned alerts on for (or just one, for a test).
export async function sendAlert(db: Db, business: Business, alert: Alert, onlyDeviceId?: string): Promise<void> {
    const subs = await db.select().from(pushSubscriptions).where(ownerDevices);
    const targets = onlyDeviceId ? subs.filter((s) => s.id === onlyDeviceId) : subs;
    await sendTo(db, targets, { ...alert, icon: alert.icon ?? business.logoUrl ?? "/favicon.png" });
}

// The owner's alerts about a shop order, run once the customer's change has been saved. They share the order's
// tag, so each new step replaces the last one for that order instead of piling up.
async function alertOwner(business: Business, alert: Alert): Promise<void> {
    try {
        await runAsBusiness(business.id, (db) => sendAlert(db, business, alert));
    } catch (error) {
        console.error(`Order alert for ${business.id} failed:`, error);
    }
}

export function alertNewOrder(
    business: Business,
    order: { orderNumber: number; subtotalNzd: number; itemCount: number; customerName: string }
): Promise<void> {
    const items = `${order.itemCount} item${order.itemCount === 1 ? "" : "s"}`;
    return alertOwner(business, {
        title: `New order #${order.orderNumber}`,
        body: `${order.customerName || "A customer"} - ${items}, ${customerPrice(order.subtotalNzd, business)}. Tap to confirm it.`,
        url: "/?open=new-orders",
        tag: `order-${order.orderNumber}`,
    });
}

// The customer says they've paid a confirmed order: the owner checks the bank and marks it paid.
export function alertPaymentSent(
    business: Business,
    order: { orderNumber: number; totalNzd: number; customerName: string; reference: string }
): Promise<void> {
    const reference = order.reference ? ` (reference ${order.reference})` : "";
    return alertOwner(business, {
        title: `Payment sent for order #${order.orderNumber}`,
        body: `${order.customerName || "A customer"} says they've paid ${customerPrice(order.totalNzd, business)}${reference}. Tap to check and mark it paid.`,
        url: "/?open=new-orders",
        tag: `order-${order.orderNumber}`,
    });
}

// A customer sent the shop a message. Tapping it opens the conversation; a newer message from the same customer
// replaces the last one.
export function alertNewMessage(business: Business, m: { customerId: string; customerName: string; preview: string }): Promise<void> {
    return alertOwner(business, {
        title: `Message from ${m.customerName || "a customer"}`,
        body: m.preview,
        url: `/?open=messages&customer=${encodeURIComponent(m.customerId)}`,
        tag: `message-${m.customerId}`,
    });
}

// The customer withdrew an order before it was confirmed.
export function alertOrderCancelled(business: Business, order: { orderNumber: number; customerName: string }): Promise<void> {
    return alertOwner(business, {
        title: `Order #${order.orderNumber} cancelled`,
        body: `${order.customerName || "The customer"} cancelled this order before it was confirmed.`,
        url: "/?open=new-orders",
        tag: `order-${order.orderNumber}`,
    });
}

// A customer's own notification (order confirmed, declined, cancelled, paid, a message from the shop...) on their
// devices. Only ever shows their shop's name and logo. Tapping it opens My Orders (or wherever url points).
export function alertCustomer(
    business: Business,
    customerId: string,
    message: { title: string; body: string; shopOrderId: string | null; url?: string; tag?: string }
): Promise<void> {
    return alertCustomers(business, [customerId], message);
}

// The same notification to several customers (e.g. a message to all of them): their devices are looked up together
// and sent to a batch at a time, so a long customer list doesn't open a connection per customer.
export async function alertCustomers(
    business: Business,
    customerIds: string[],
    message: { title: string; body: string; shopOrderId: string | null; url?: string; tag?: string }
): Promise<void> {
    if (customerIds.length === 0) return;
    const alert: Alert = {
        title: message.title,
        body: message.body,
        url: message.url ?? `/shop/${business.slug}?open=orders`,
        tag: message.tag ?? (message.shopOrderId ? `order-${message.shopOrderId}` : `note-${Date.now()}`),
        ...(business.logoUrl ? { icon: business.logoUrl } : {}),
    };
    try {
        await runAsBusiness(business.id, async (db) => {
            const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.customerId, customerIds));
            for (let i = 0; i < subs.length; i += 50) await sendTo(db, subs.slice(i, i + 50), alert);
        });
    } catch (error) {
        console.error(`Customer notification for ${business.id} failed:`, error);
    }
}

// Stops notifications on a device (only the owner's devices, or only one customer's).
export async function removeDevice(db: Db, who: { customerId: string | null }, target: { endpoint?: string; id?: string }) {
    const which = target.endpoint ? eq(pushSubscriptions.endpoint, target.endpoint) : eq(pushSubscriptions.id, target.id ?? "");
    const whose = who.customerId ? eq(pushSubscriptions.customerId, who.customerId) : ownerDevices;
    await db.delete(pushSubscriptions).where(and(which, whose));
}

// A device turning notifications on: what the browser gives us.
export const subscribeSchema = z.object({
    subscription: z.object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
    }),
    device: z.string().trim().max(120).default(""),
});

// Saves (or refreshes) a device for the owner (customerId null) or a customer. One browser can be both - an owner
// trying their own shop as a customer - so it gets a row for each, and each gets its own notifications.
export async function saveDevice(
    db: Db,
    who: { clerkUserId: string; customerId: string | null },
    { subscription, device }: z.infer<typeof subscribeSchema>
) {
    const values = { ...who, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, device };
    await db
        .insert(pushSubscriptions)
        .values({ id: crypto.randomUUID(), endpoint: subscription.endpoint, ...values })
        .onConflictDoUpdate({
            target: [pushSubscriptions.businessId, pushSubscriptions.endpoint, pushSubscriptions.customerId],
            set: values,
        });
}
