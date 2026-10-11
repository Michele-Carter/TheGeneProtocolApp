import "./env.js";
import { inArray } from "drizzle-orm";
import webpush from "web-push";
import { runAsBusiness, type Business, type Db } from "./business.js";
import { pushSubscriptions } from "./schema.js";

// Tells a business owner about a new shop order with a phone/computer notification on every device they turned
// it on for (web push - arrives even when the app is closed). Needs, in .env.local / Vercel:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT   (npx web-push generate-vapid-keys)
// Quietly does nothing until they're there. An alert that fails never affects the order.

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
    icon?: string; // the business logo, or the PepBiz badge
}

type Subscription = typeof pushSubscriptions.$inferSelect;

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
                else console.error("Order notification failed:", error?.statusCode ?? error);
            }
        })
    );
    return gone;
}

// Notifies every device the owner turned alerts on for (or just one, for a test).
export async function sendAlert(db: Db, business: Business, alert: Alert, onlyDeviceId?: string): Promise<void> {
    const subs = await db.select().from(pushSubscriptions);
    const targets = onlyDeviceId ? subs.filter((s) => s.id === onlyDeviceId) : subs;
    const gone = await sendPush(targets, { ...alert, icon: alert.icon ?? business.logoUrl ?? "/favicon.png" });
    if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
}

const money = (n: number) => `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Called once a customer's order has been saved.
export async function alertNewOrder(
    business: Business,
    order: { orderNumber: number; subtotalNzd: number; itemCount: number; customerName: string }
): Promise<void> {
    const items = `${order.itemCount} item${order.itemCount === 1 ? "" : "s"}`;
    const alert: Alert = {
        title: `New order #${order.orderNumber}`,
        body: `${order.customerName || "A customer"} - ${items}, ${money(order.subtotalNzd)}. Tap to confirm it.`,
        url: "/?open=new-orders",
        tag: `order-${order.orderNumber}`,
    };
    try {
        await runAsBusiness(business.id, (db) => sendAlert(db, business, alert));
    } catch (error) {
        console.error(`New order alert for ${business.id} failed:`, error);
    }
}
