// Checks changing an order after it's sent: the customer can change a waiting order, or a confirmed one that's
// unpaid and unsent (it goes back to waiting, its stock back and held for them), but not once payment is made or said
// to be made, or once the owner has changed its items; and when the owner changes a confirmed order the customer
// sees what's on it now and is told the new total. Sets up a throwaway business, runs real API requests, then
// deletes everything it made. Dev database only.
// Usage: npx tsx scripts/testChangeOrder.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
process.env.VAPID_PUBLIC_KEY ||= "test";
process.env.VAPID_PRIVATE_KEY ||= "test";

import postgres from "postgres";
import webpush from "web-push";
import { handleAdminRequest } from "../api/admin/[resource]";
import { handleShopRequest } from "../api/shop/[resource]";
import { handleBusinessRequest } from "../api/business/[action]";

if (!process.env.DATABASE_URL?.includes("ep-ancient-flower")) throw new Error("Only for the dev database - stopping");

const SLUG = "change-order-test";
const OWNER = "user_change_order_test_owner";
const CUSTOMER = "user_change_order_test_customer";
const OTHER = "user_change_order_test_other";
const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1, onnotice: () => {} });

// Nothing is sent from this script.
(webpush as any).setVapidDetails = () => {};
(webpush as any).sendNotification = async () => ({ statusCode: 201 });

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`);
    if (!ok) failures++;
}

async function call(handler: any, userId: string, method: string, query: Record<string, string>, body?: unknown) {
    const out = { status: 200, body: undefined as any };
    const res = {
        status(code: number) { out.status = code; return res; },
        json(data: unknown) { out.body = data; return res; },
        setHeader() {},
    };
    await handler({ method, query, body, headers: { "x-business": SLUG } }, res, userId);
    return out;
}
async function ok(handler: any, userId: string, method: string, query: Record<string, string>, body?: unknown): Promise<any> {
    const out = await call(handler, userId, method, query, body);
    if (out.status >= 300) throw new Error(`${method} ${JSON.stringify(query)} -> ${out.status} ${JSON.stringify(out.body)}`);
    return out.body;
}
const admin = (method: string, query: Record<string, string>, body?: unknown) => ok(handleAdminRequest, OWNER, method, query, body);
const shop = (method: string, query: Record<string, string>, body?: unknown) => ok(handleShopRequest, CUSTOMER, method, query, body);
const myOrder = async (id: string) => ((await shop("GET", { resource: "orders" })) as any[]).find((o) => o.id === id);
const confirm = (order: any, shippingNzd = 10) =>
    admin("POST", { resource: "shop-orders", id: order.id, action: "confirm" }, { lines: order.lines.map((l: any) => ({ key: l.key, qty: l.qty })), shippingNzd, message: "" });

async function removeEverything() {
    const [b] = await sql`select id from businesses where slug = ${SLUG}`;
    if (!b) return;
    const tables = (await sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'business_id'`).map((r) => r.table_name);
    for (const t of tables) await sql`delete from ${sql(t)} where business_id = ${b.id}`;
    await sql`delete from businesses where id = ${b.id}`;
}

try {
    await removeEverything();
    await ok(handleBusinessRequest, OWNER, "POST", { action: "create" }, { ownerName: "Test Owner", name: "Change Order Test", slug: SLUG, country: "NZ" });
    const [business] = await sql`select id from businesses where slug = ${SLUG}`;
    await sql`update businesses set billing_exempt = true where id = ${business.id}`;

    // 4 pens and 10 cartridges in stock; a kit of 1 pen + 2 cartridges.
    const pen = await admin("POST", { resource: "items" }, { kind: "supply", name: "Test Pen", variant: "Blue", unit: "unit" });
    const cartridge = await admin("POST", { resource: "items" }, { kind: "supply", name: "Test Cartridge", variant: "", unit: "unit" });
    for (const item of [pen, cartridge]) await admin("PATCH", { resource: "items", id: item.id }, { sellPriceNzd: 30, shopVisible: true });
    const line = (id: string, item: any, packs: number) => ({ id, itemId: item.id, kind: "supply", name: item.name, variant: item.variant, unit: "unit", packPrice: 10, packs, unitsPerPack: 1 });
    const supply = await admin("POST", { resource: "orders" }, {
        data: {
            orderType: "supplies", supplier: "Test Supplier", orderDate: "2026-01-01", currency: "USD",
            lines: [line("l1", pen, 4), line("l2", cartridge, 10)],
            orderDiscountPct: 0, supplierCharges: [], supplierDiscounts: [], supplierBilledTotal: 140, totalPaidNzd: 238,
            paymentFeesNzd: [], extraCostsNzd: [], manualRateUsdPerNzd: null, orderNumber: "T1", tracking: "", notes: "",
        },
    });
    await admin("POST", { resource: "orders", id: supply.id, action: "receive" }, { receivedDate: "2026-01-02" });
    const kit = await admin("POST", { resource: "bundles" }, {
        name: "Pen Kit", description: "", components: [{ itemId: pen.id, qty: 1 }, { itemId: cartridge.id, qty: 2 }], priceNzd: 80, shopVisible: true, shopCategories: [], special: null,
    });
    const address = { line1: "1 Test Street", line2: "", suburb: "", city: "Auckland", region: "", postcode: "1010", country: "New Zealand" };
    for (const [clerk, name] of [[CUSTOMER, "Casey Customer"], [OTHER, "Olive Other"]]) {
        await sql`insert into customers (id, business_id, clerk_user_id, name, email, shipping_address)
            values (gen_random_uuid()::text, ${business.id}, ${clerk}, ${name}, ${`${clerk}@example.com`}, ${sql.json(address)})`;
    }
    const penKey = `item:${pen.id}`, cartridgeKey = `item:${cartridge.id}`, kitKey = `bundle:${kit.id}`;
    const onHand = async (itemId: string) => (await sql`select coalesce(sum(qty_remaining), 0)::int n from inventory_lots where item_id = ${itemId}`)[0].n;
    const maxQty = async (key: string, editing?: string) =>
        ((await shop("GET", { resource: "products", ...(editing ? { editing } : {}) })) as any[]).flatMap((p) => p.variants).find((v: any) => v.key === key).maxQty;

    // A waiting order can be changed.
    const sent = await shop("POST", { resource: "orders" }, { lines: [{ key: penKey, qty: 1 }, { key: kitKey, qty: 1 }], notes: "first" });
    check("a waiting order can be changed", (await myOrder(sent.id)).canChange === true);

    // Confirmed: the customer sees what's on it - the kit as one entry with what's in it - and can still change it.
    await confirm(sent);
    let mine = await myOrder(sent.id);
    check("once confirmed the customer sees each item and the bundle as one entry",
        mine.progress.items.length === 2 && mine.progress.items[0].name === "1× Test Pen Blue" &&
        mine.progress.items[1].name === "Pen Kit" && mine.progress.items[1].contents === "1× Test Pen Blue, 2× Test Cartridge" &&
        Math.abs(mine.progress.items[1].totalNzd - 80) < 0.01 && mine.progress.shippingNzd === 10 && Math.abs(mine.progress.totalNzd - 120) < 0.01,
        mine.progress);
    check("a confirmed, unpaid order can be changed", mine.canChange === true);
    check("confirming took its stock out", (await onHand(pen.id)) === 2 && (await onHand(cartridge.id)) === 8);

    // The customer starts changing it: back to waiting, stock back, held for them.
    const other = await call(handleShopRequest, OTHER, "POST", { resource: "orders", id: sent.id, action: "change" }, {});
    check("another customer can't change it", other.status === 409, other);
    const changing = await shop("POST", { resource: "orders", id: sent.id, action: "change" }, {});
    const [saleLeft] = await sql`select count(*)::int n from sales where business_id = ${business.id}`;
    check("changing a confirmed order takes it back to waiting", changing.status === "submitted" && changing.shippingNzd === null && changing.progress === null, changing);
    check("its customer order is gone and its stock is back", saleLeft.n === 0 && (await onHand(pen.id)) === 4 && (await onHand(cartridge.id)) === 10, saleLeft);
    check("the shop holds its items for others (4 pens - 2 on the order)", (await maxQty(penKey)) === 2);
    check("but while changing it, the customer can have their own back", (await maxQty(penKey, sent.id)) === 4);
    check("someone else's order isn't theirs to count", (await call(handleShopRequest, OTHER, "GET", { resource: "products", editing: sent.id })).body.flatMap((p: any) => p.variants).find((v: any) => v.key === penKey).maxQty === 2);

    // Sending the changes: replaced, still waiting, same order number; can't go beyond stock.
    const tooMany = await call(handleShopRequest, CUSTOMER, "PATCH", { resource: "orders", id: sent.id }, { lines: [{ key: penKey, qty: 5 }], notes: "" });
    check("a change beyond stock is refused", tooMany.status === 409 && tooMany.body.error.includes("only 4 of Test Pen Blue"), tooMany);
    const byOther = await call(handleShopRequest, OTHER, "PATCH", { resource: "orders", id: sent.id }, { lines: [{ key: penKey, qty: 1 }], notes: "" });
    check("another customer can't change it", byOther.status === 409, byOther);
    const changed = await shop("PATCH", { resource: "orders", id: sent.id }, { lines: [{ key: penKey, qty: 3 }, { key: cartridgeKey, qty: 4 }], notes: "changed my mind" });
    check("the changed order replaces the old one, same number, waiting",
        changed.status === "submitted" && changed.orderNumber === sent.orderNumber && changed.lines.length === 2 &&
        changed.lines[0].qty === 3 && changed.notes === "changed my mind" && Number(changed.subtotalNzd) === 210, changed);
    check("it holds its new items", (await maxQty(penKey)) === 1);

    // The owner confirms it again.
    await confirm(changed, 5);
    mine = await myOrder(sent.id);
    check("it can be confirmed again with the new items", mine.status === "confirmed" && Math.abs(mine.progress.totalNzd - 215) < 0.01 && (await onHand(pen.id)) === 1, mine.progress);
    const confirmedPatch = await call(handleShopRequest, CUSTOMER, "PATCH", { resource: "orders", id: sent.id }, { lines: [{ key: penKey, qty: 1 }], notes: "" });
    check("a confirmed order can't be replaced without changing it first", confirmedPatch.status === 409, confirmedPatch);

    // Once the customer says they've paid, it can't be changed.
    await shop("POST", { resource: "orders", id: sent.id, action: "paid" }, { reference: "x" });
    check("once they've said they paid, it can't be changed", (await myOrder(sent.id)).canChange === false);
    const afterPaid = await call(handleShopRequest, CUSTOMER, "POST", { resource: "orders", id: sent.id, action: "change" }, {});
    check("...and asking to change it is refused", afterPaid.status === 409 && (await myOrder(sent.id)).status === "confirmed", afterPaid);

    // The owner changes a confirmed order: the customer sees it and is told; they can't change it themselves now.
    const second = await shop("POST", { resource: "orders" }, { lines: [{ key: cartridgeKey, qty: 1 }], notes: "" });
    const { saleId } = await confirm(second);
    const reopened = await admin("POST", { resource: "sales", id: saleId, action: "reopen" }, {});
    const extra = { ...reopened.data.lines[0], id: "extra", qty: 2 };
    await admin("PATCH", { resource: "sales", id: saleId }, { data: { ...reopened.data, lines: [...reopened.data.lines, extra] } });
    mine = await myOrder(second.id);
    const [note] = await sql`select title, body from notifications where shop_order_id = ${second.id} and kind = 'updated'`;
    check("the customer sees the owner's change", mine.progress.items.length === 2 && mine.progress.items[1].name === "2× Test Cartridge" && Math.abs(mine.progress.totalNzd - 100) < 0.01, mine.progress);
    check("and is told the new total", note?.title === `Order #${second.orderNumber} updated` && note.body.includes("$100.00"), note);
    check("an order the owner changed can't be changed by the customer", mine.canChange === false);
    const saveAgain = await admin("GET", { resource: "sales", id: saleId });
    await admin("PATCH", { resource: "sales", id: saleId }, { data: { ...saveAgain.data, notes: "packed" } });
    const notes = await sql`select count(*)::int n from notifications where shop_order_id = ${second.id} and kind = 'updated'`;
    check("saving it with nothing charged differently doesn't tell them again", notes[0].n === 1, notes);
} finally {
    await removeEverything();
    await sql.end();
}

console.log(failures === 0 ? "\nAll passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
