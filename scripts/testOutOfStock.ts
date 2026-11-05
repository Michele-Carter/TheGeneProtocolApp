// Checks out of stock: the shop says how many can be ordered (no more than are free to sell), an item or bundle with
// none free is "out" and can't be added, and an order asking for more than is in stock is refused with a clear
// message - counting a bundle and the same item on its own together - so every order sent can be confirmed as it is.
// Sets up a throwaway business, runs real API requests, then deletes everything it made. Dev database only.
// Usage: npx tsx scripts/testOutOfStock.ts
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

const SLUG = "out-of-stock-test";
const OWNER = "user_out_of_stock_test_owner";
const CUSTOMER = "user_out_of_stock_test_customer";
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
const send = (lines: { key: string; qty: number }[]) => call(handleShopRequest, CUSTOMER, "POST", { resource: "orders" }, { lines, notes: "" });

async function removeEverything() {
    const [b] = await sql`select id from businesses where slug = ${SLUG}`;
    if (!b) return;
    const tables = (await sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'business_id'`).map((r) => r.table_name);
    for (const t of tables) await sql`delete from ${sql(t)} where business_id = ${b.id}`;
    await sql`delete from businesses where id = ${b.id}`;
}

try {
    await removeEverything();
    await ok(handleBusinessRequest, OWNER, "POST", { action: "create" }, { ownerName: "Test Owner", name: "Out Of Stock Test", slug: SLUG, country: "NZ" });
    const [business] = await sql`select id from businesses where slug = ${SLUG}`;
    await sql`update businesses set billing_exempt = true where id = ${business.id}`;

    // 3 pens in stock, cartridges with none.
    const pen = await admin("POST", { resource: "items" }, { kind: "supply", name: "Test Pen", variant: "Blue", unit: "unit" });
    const cartridge = await admin("POST", { resource: "items" }, { kind: "supply", name: "Test Cartridge", variant: "", unit: "unit" });
    for (const item of [pen, cartridge]) await admin("PATCH", { resource: "items", id: item.id }, { sellPriceNzd: 30, shopVisible: true });
    const supply = await admin("POST", { resource: "orders" }, {
        data: {
            orderType: "supplies", supplier: "Test Supplier", orderDate: "2026-01-01", currency: "USD",
            lines: [{ id: "l1", itemId: pen.id, kind: "supply", name: "Test Pen", variant: "Blue", unit: "unit", packPrice: 10, packs: 3, unitsPerPack: 1 }],
            orderDiscountPct: 0, supplierCharges: [], supplierDiscounts: [], supplierBilledTotal: 30, totalPaidNzd: 51,
            paymentFeesNzd: [], extraCostsNzd: [], manualRateUsdPerNzd: null, orderNumber: "T1", tracking: "", notes: "",
        },
    });
    await admin("POST", { resource: "orders", id: supply.id, action: "receive" }, { receivedDate: "2026-01-02" });
    const kit = await admin("POST", { resource: "bundles" }, {
        name: "Pen Kit", description: "", components: [{ itemId: pen.id, qty: 1 }], priceNzd: 25, shopVisible: true, shopCategories: [], special: null,
    });
    const kitWithCartridge = await admin("POST", { resource: "bundles" }, {
        name: "Pen And Cartridge Kit", description: "", components: [{ itemId: pen.id, qty: 1 }, { itemId: cartridge.id, qty: 1 }], priceNzd: 50, shopVisible: true, shopCategories: [], special: null,
    });
    await sql`insert into customers (id, business_id, clerk_user_id, name, email, shipping_address)
        values (gen_random_uuid()::text, ${business.id}, ${CUSTOMER}, 'Casey Customer', 'casey@example.com',
                ${sql.json({ line1: "1 Test Street", line2: "", suburb: "", city: "Auckland", region: "", postcode: "1010", country: "New Zealand" })})`;

    const variant = async (key: string) => ((await shop("GET", { resource: "products" })) as any[]).flatMap((p) => p.variants).find((v: any) => v.key === key);
    const penKey = `item:${pen.id}`, cartridgeKey = `item:${cartridge.id}`, kitKey = `bundle:${kit.id}`, cartridgeKitKey = `bundle:${kitWithCartridge.id}`;

    const penBefore = await variant(penKey);
    check("an item in stock can be ordered up to what's in stock", penBefore.stock === "low" && penBefore.maxQty === 3, penBefore);
    const cartridgeV = await variant(cartridgeKey);
    check("an item with none is out of stock and can't be ordered", cartridgeV.stock === "out" && cartridgeV.maxQty === 0, cartridgeV);
    const kitV = await variant(cartridgeKitKey);
    check("a bundle missing an item is out of stock", kitV.stock === "out" && kitV.maxQty === 0, kitV);
    check("a bundle can be ordered up to what its items allow", (await variant(kitKey)).maxQty === 3);

    // The customer's case: something in stock plus something out of stock - refused, naming what's out.
    const mixed = await send([{ key: penKey, qty: 1 }, { key: cartridgeKey, qty: 1 }]);
    check("an order with an out of stock item is refused", mixed.status === 409 && mixed.body.error === "Sorry, Test Cartridge is out of stock. Please remove it from your cart.", mixed);
    const tooMany = await send([{ key: penKey, qty: 4 }]);
    check("more than is in stock is refused, saying how many are left", tooMany.status === 409 && tooMany.body.error === "Sorry, there are only 3 of Test Pen Blue left. Please reduce the quantity in your cart.", tooMany);
    const together = await send([{ key: penKey, qty: 2 }, { key: kitKey, qty: 2 }]);
    check("a bundle and the same item on its own count together", together.status === 409 && together.body.error.includes("only 3 of Test Pen Blue"), together);
    const none = await sql`select count(*)::int n from shop_orders where business_id = ${business.id}`;
    check("nothing refused was saved", none[0].n === 0, none);

    // Within stock it goes through, and can be confirmed as it is.
    const placed = await shop("POST", { resource: "orders" }, { lines: [{ key: penKey, qty: 1 }, { key: kitKey, qty: 1 }], notes: "" });
    check("an order within stock goes through, not marked pre-order", placed.status === "submitted" && placed.lines.every((l: any) => !l.preorder), placed);
    check("what's waiting to be confirmed is held back from the shop", (await variant(penKey)).maxQty === 1);
    const last = await send([{ key: penKey, qty: 2 }]);
    check("so the held stock can't be ordered again", last.status === 409 && last.body.error.includes("only 1 of Test Pen Blue"), last);
    await admin("POST", { resource: "shop-orders", id: placed.id, action: "confirm" }, { lines: placed.lines.map((l: any) => ({ key: l.key, qty: l.qty })), shippingNzd: 0, message: "" });
    const [confirmed] = await sql`select status from shop_orders where id = ${placed.id}`;
    check("it confirms as it is", confirmed.status === "confirmed", confirmed);

    await shop("POST", { resource: "orders" }, { lines: [{ key: penKey, qty: 1 }], notes: "" });
    const penAfter = await variant(penKey);
    check("once the last one is ordered it shows out of stock", penAfter.stock === "out" && penAfter.maxQty === 0, penAfter);
} finally {
    await removeEverything();
    await sql.end();
}

console.log(failures === 0 ? "\nAll passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
