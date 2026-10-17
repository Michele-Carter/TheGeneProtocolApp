// Checks every step of a shop order notifies the right person: the owner when an order comes in, when the customer
// says they've paid and when they cancel; the customer when the order is confirmed, paid and sent. The owner and
// the customer use the SAME browser (an owner trying their own shop), which must still get both sets. Sets up a
// throwaway business, runs real API requests, records the notifications instead of sending them, then deletes
// everything it made. Dev database only.
// Usage: npx tsx scripts/testNotifications.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
// Notifications need keys to be "sent"; made-up ones are fine as nothing leaves this script.
process.env.VAPID_PUBLIC_KEY ||= "test";
process.env.VAPID_PRIVATE_KEY ||= "test";

import postgres from "postgres";
import webpush from "web-push";
import { handleAdminRequest } from "../api/admin/[resource]";
import { handleShopRequest } from "../api/shop/[resource]";
import { handleBusinessRequest } from "../api/business/[action]";

if (!process.env.DATABASE_URL?.includes("ep-ancient-flower")) throw new Error("Only for the dev database - stopping");

const SLUG = "notify-test";
const OWNER = "user_notify_test_owner";
const CUSTOMER = "user_notify_test_customer";
const BROWSER = "https://push.example.com/notify-test-browser"; // one browser, used by both
const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1, onnotice: () => {} });

// Record notifications instead of sending them.
const sent: { endpoint: string; title: string; body: string }[] = [];
(webpush as any).setVapidDetails = () => {};
(webpush as any).sendNotification = async (sub: { endpoint: string }, payload: string) => {
    const { title, body } = JSON.parse(payload);
    sent.push({ endpoint: sub.endpoint, title, body });
    return { statusCode: 201 };
};
const take = () => sent.splice(0);

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`);
    if (!ok) failures++;
}

async function call(handler: any, userId: string, method: string, query: Record<string, string>, body?: unknown): Promise<any> {
    const out = { status: 200, body: undefined as any };
    const res = {
        status(code: number) { out.status = code; return res; },
        json(data: unknown) { out.body = data; return res; },
        setHeader() {},
    };
    await handler({ method, query, body, headers: { "x-business": SLUG } }, res, userId);
    if (out.status >= 300) throw new Error(`${method} ${JSON.stringify(query)} -> ${out.status} ${JSON.stringify(out.body)}`);
    return out.body;
}
const admin = (method: string, query: Record<string, string>, body?: unknown) => call(handleAdminRequest, OWNER, method, query, body);
const shop = (method: string, query: Record<string, string>, body?: unknown) => call(handleShopRequest, CUSTOMER, method, query, body);
const device = { subscription: { endpoint: BROWSER, keys: { p256dh: "test-key", auth: "test-auth" } }, device: "Test browser" };

async function removeEverything() {
    const [b] = await sql`select id from businesses where slug = ${SLUG}`;
    if (!b) return;
    const tables = (await sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'business_id'`).map((r) => r.table_name);
    for (const t of tables) await sql`delete from ${sql(t)} where business_id = ${b.id}`;
    await sql`delete from businesses where id = ${b.id}`;
}

try {
    await removeEverything();
    await call(handleBusinessRequest, OWNER, "POST", { action: "create" }, { ownerName: "Test Owner", name: "Notify Test", slug: SLUG, country: "NZ" });
    const [business] = await sql`select id from businesses where slug = ${SLUG}`;
    await sql`update businesses set billing_exempt = true where id = ${business.id}`;

    // A product with stock, payment details, and a customer with an address.
    const item = await admin("POST", { resource: "items" }, { kind: "peptide", name: "Test Peptide", variant: "5mg", unit: "vial" });
    await admin("PATCH", { resource: "items", id: item.id }, { sellPriceNzd: 50, shopVisible: true, shopSection: "peptides" });
    const order = await admin("POST", { resource: "orders" }, {
        data: {
            orderType: "peptides", supplier: "Test Supplier", orderDate: "2026-01-01", currency: "USD",
            lines: [{ id: "l1", itemId: item.id, kind: "peptide", name: "Test Peptide", variant: "5mg", unit: "vial", packPrice: 10, packs: 10, unitsPerPack: 1 }],
            orderDiscountPct: 0, supplierCharges: [], supplierDiscounts: [], supplierBilledTotal: 100, totalPaidNzd: 170,
            paymentFeesNzd: [], extraCostsNzd: [], manualRateUsdPerNzd: null, orderNumber: "T1", tracking: "", notes: "",
        },
    });
    await admin("POST", { resource: "orders", id: order.id, action: "receive" }, { receivedDate: "2026-01-02" });
    await admin("PUT", { resource: "settings" }, { paymentDetails: { bankName: "ANZ", accountName: "Notify Test", accountNumber: "01-0123-0456789-00", instructions: "" } });
    await sql`
        insert into customers (id, business_id, clerk_user_id, name, email, shipping_address)
        values (gen_random_uuid()::text, ${business.id}, ${CUSTOMER}, 'Casey Customer', 'casey@example.com',
                ${sql.json({ line1: "1 Test Street", line2: "", suburb: "", city: "Auckland", region: "", postcode: "1010", country: "New Zealand" })})`;

    // The same browser turns on notifications as the owner, then as the customer.
    await admin("POST", { resource: "alerts", action: "subscribe" }, device);
    await shop("POST", { resource: "push", action: "subscribe" }, device);
    const rows = await sql`select customer_id from push_subscriptions where business_id = ${business.id} and endpoint = ${BROWSER}`;
    check("one browser is both the owner's device and the customer's", rows.length === 2 && rows.some((r) => r.customer_id === null) && rows.some((r) => r.customer_id !== null), rows);

    const catalog: any[] = await shop("GET", { resource: "products" });
    const key = catalog[0].variants[0].key;
    const titles = () => take().map((n) => n.title);

    // 1. Customer sends an order -> owner.
    const placed = await shop("POST", { resource: "orders" }, { lines: [{ key, qty: 2 }], notes: "" });
    check("new order -> owner", JSON.stringify(titles()) === JSON.stringify([`New order #${placed.orderNumber}`]));

    // 2. Owner confirms -> customer.
    await admin("POST", { resource: "shop-orders", id: placed.id, action: "confirm" }, { lines: placed.lines.map((l: any) => ({ key: l.key, qty: l.qty })), shippingNzd: 10, message: "" });
    check("confirmed -> customer", JSON.stringify(titles()) === JSON.stringify([`Order #${placed.orderNumber} confirmed`]));

    // 3. Customer says they've paid -> owner.
    await shop("POST", { resource: "orders", id: placed.id, action: "paid" }, { reference: "REF-42" });
    const paidAlert = take();
    check("payment sent -> owner", paidAlert.length === 1 && paidAlert[0].title === `Payment sent for order #${placed.orderNumber}`, paidAlert);
    check("  ...with the amount and reference", /\$110\.00/.test(paidAlert[0]?.body ?? "") && /REF-42/.test(paidAlert[0]?.body ?? ""), paidAlert[0]?.body);

    // 4. Owner marks it paid -> customer.
    await admin("POST", { resource: "shop-orders", id: placed.id, action: "mark-paid" }, {});
    check("payment received -> customer", JSON.stringify(titles()) === JSON.stringify([`Payment received for order #${placed.orderNumber}`]));

    // 5. Owner marks it sent -> customer.
    const [saleRow] = await sql`select sale_id from shop_orders where id = ${placed.id}`;
    const sale = (await admin("GET", { resource: "sales" })).find((s: any) => s.id === saleRow.sale_id);
    await admin("PATCH", { resource: "sales", id: sale.id }, { data: { ...sale.data, shipping: { status: "sent", courier: "NZ Post", tracking: "TRACK123", sentDate: "2026-01-05" } } });
    const sentAlert = take();
    check("sent -> customer", sentAlert.length === 1 && sentAlert[0].title === `Order #${placed.orderNumber} is on its way` && /TRACK123/.test(sentAlert[0].body), sentAlert);

    // 6. Customer cancels a second order before it's confirmed -> owner.
    const second = await shop("POST", { resource: "orders" }, { lines: [{ key, qty: 1 }], notes: "" });
    take();
    await shop("POST", { resource: "orders", id: second.id, action: "cancel" });
    check("cancelled by customer -> owner", JSON.stringify(titles()) === JSON.stringify([`Order #${second.orderNumber} cancelled`]));

    // Turning notifications off as the customer leaves the owner's on (same browser).
    await shop("POST", { resource: "push", action: "unsubscribe" }, { endpoint: BROWSER });
    const left = await sql`select customer_id from push_subscriptions where business_id = ${business.id} and endpoint = ${BROWSER}`;
    check("customer turning off keeps the owner's alerts on", left.length === 1 && left[0].customer_id === null, left);
} finally {
    await removeEverything();
    await sql.end();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
