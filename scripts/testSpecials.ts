// Checks specials end to end: the owner sets one on an item or a bundle (and bad ones are refused), the shop shows it, an order
// sent with it is priced with the special taken off, and confirming it puts the saving on the customer order as its
// discount - worked out again on the quantity the owner confirms. Then the same for a storewide sale with a minimum spend,
// where each line gets its own special or the sale, whichever saves more. Sets up a throwaway business, runs real API
// requests, then deletes everything it made. Dev database only.
// Usage: npx tsx scripts/testSpecials.ts
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

const SLUG = "specials-test";
const OWNER = "user_specials_test_owner";
const CUSTOMER = "user_specials_test_customer";
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

async function removeEverything() {
    const [b] = await sql`select id from businesses where slug = ${SLUG}`;
    if (!b) return;
    const tables = (await sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'business_id'`).map((r) => r.table_name);
    for (const t of tables) await sql`delete from ${sql(t)} where business_id = ${b.id}`;
    await sql`delete from businesses where id = ${b.id}`;
}

try {
    await removeEverything();
    await ok(handleBusinessRequest, OWNER, "POST", { action: "create" }, { ownerName: "Test Owner", name: "Specials Test", slug: SLUG, country: "NZ" });
    const [business] = await sql`select id from businesses where slug = ${SLUG}`;
    await sql`update businesses set billing_exempt = true where id = ${business.id}`;

    // Two sizes at $50, 20 of each in stock.
    const small = await admin("POST", { resource: "items" }, { kind: "peptide", name: "Test Peptide", variant: "5mg", unit: "vial" });
    const large = await admin("POST", { resource: "items" }, { kind: "peptide", name: "Test Peptide", variant: "10mg", unit: "vial" });
    for (const item of [small, large]) {
        await admin("PATCH", { resource: "items", id: item.id }, { sellPriceNzd: 50, shopVisible: true, shopSection: "peptides" });
    }
    const line = (id: string, itemId: string, variant: string) => ({
        id, itemId, kind: "peptide", name: "Test Peptide", variant, unit: "vial", packPrice: 10, packs: 20, unitsPerPack: 1,
    });
    const supply = await admin("POST", { resource: "orders" }, {
        data: {
            orderType: "peptides", supplier: "Test Supplier", orderDate: "2026-01-01", currency: "USD",
            lines: [line("l1", small.id, "5mg"), line("l2", large.id, "10mg")],
            orderDiscountPct: 0, supplierCharges: [], supplierDiscounts: [], supplierBilledTotal: 400, totalPaidNzd: 680,
            paymentFeesNzd: [], extraCostsNzd: [], manualRateUsdPerNzd: null, orderNumber: "T1", tracking: "", notes: "",
        },
    });
    await admin("POST", { resource: "orders", id: supply.id, action: "receive" }, { receivedDate: "2026-01-02" });
    await sql`
        insert into customers (id, business_id, clerk_user_id, name, email, shipping_address)
        values (gen_random_uuid()::text, ${business.id}, ${CUSTOMER}, 'Casey Customer', 'casey@example.com',
                ${sql.json({ line1: "1 Test Street", line2: "", suburb: "", city: "Auckland", region: "", postcode: "1010", country: "New Zealand" })})`;

    // Setting specials.
    const bad = await call(handleAdminRequest, OWNER, "PATCH", { resource: "items", id: small.id }, { special: { kind: "percent", percentOff: 150 } });
    check("a special over 99% off is refused", bad.status === 400, bad);
    const saved = await admin("PATCH", { resource: "items", id: small.id }, {
        special: { kind: "free", buy: 2, free: 1, ribbonText: "  Sale ", ribbonColour: "#EF4444" },
    });
    check("buy 2 get 1 free saved, wording trimmed, colour tidied",
        saved.special?.kind === "free" && saved.special.buy === 2 && saved.special.free === 1 && saved.special.ribbonText === "Sale" && saved.special.ribbonColour === "#ef4444",
        saved.special);
    await admin("PATCH", { resource: "items", id: large.id }, { special: { kind: "percent", percentOff: 20, minQty: 4, ribbonText: "", ribbonColour: "" } });

    const catalog: any[] = await shop("GET", { resource: "products" });
    const variants = catalog[0].variants;
    const smallKey = `item:${small.id}`;
    const largeKey = `item:${large.id}`;
    check("the shop shows each size's special", variants.find((v: any) => v.key === smallKey)?.special?.kind === "free" &&
        variants.find((v: any) => v.key === largeKey)?.special?.minQty === 4, variants.map((v: any) => v.special));

    // 3 x 5mg (one free) + 3 x 10mg (not enough for 20% off): 100 + 150.
    const placed = await shop("POST", { resource: "orders" }, { lines: [{ key: smallKey, qty: 3 }, { key: largeKey, qty: 3 }], notes: "" });
    check("order subtotal has the free one taken off", Number(placed.subtotalNzd) === 250, placed.subtotalNzd);
    check("each line keeps the special it was sent with", placed.lines.every((l: any) => l.special), placed.lines);

    // A special changed after the order was sent doesn't change the order.
    await admin("PATCH", { resource: "items", id: small.id }, { special: null });
    const after: any[] = await shop("GET", { resource: "products" });
    check("removing a special takes it out of the shop", after[0].variants.find((v: any) => v.key === smallKey)?.special === null);

    // The owner confirms 4 x 10mg (now 20% off = $40) and the 3 x 5mg (one free = $50).
    await admin("POST", { resource: "shop-orders", id: placed.id, action: "confirm" }, {
        lines: [{ key: smallKey, qty: 3 }, { key: largeKey, qty: 4 }], shippingNzd: 10, message: "",
    });
    const [row] = await sql`select subtotal_nzd, sale_id, lines from shop_orders where id = ${placed.id}`;
    check("confirmed subtotal works the special out again on the new quantity", Number(row.subtotal_nzd) === 260, row.subtotal_nzd);
    const sale = (await admin("GET", { resource: "sales" })).find((s: any) => s.id === row.sale_id);
    check("the customer order has the specials as its discount", sale?.data.discountNzd === 90, sale?.data.discountNzd);
    check("  ...lines keep their full price", sale?.data.lines.every((l: any) => l.unitPriceNzd === 50), sale?.data.lines);
    check("  ...notes say what the specials were", /Specials: .*Buy 2, get 1 free/.test(sale?.data.notes ?? "") && /20% off/.test(sale?.data.notes ?? ""), sale?.data.notes);

    const mine: any[] = await shop("GET", { resource: "orders" });
    // 350 of items - 90 of specials + 10 shipping.
    check("the customer sees the confirmed total with specials off", mine[0]?.progress?.totalNzd === 270, mine[0]?.progress);

    // A bundle (one of each size) at $90, with 10% off.
    const badBundle = await call(handleAdminRequest, OWNER, "POST", { resource: "bundles" }, {
        name: "Test Kit", description: "", components: [{ itemId: small.id, qty: 1 }, { itemId: large.id, qty: 1 }],
        priceNzd: 90, shopVisible: true, shopCategories: [], special: { kind: "free", buy: 0, free: 1 },
    });
    check("a bundle special with nothing to buy is refused", badBundle.status === 400, badBundle);
    const bundle = await admin("POST", { resource: "bundles" }, {
        name: "Test Kit", description: "", components: [{ itemId: small.id, qty: 1 }, { itemId: large.id, qty: 1 }],
        priceNzd: 90, shopVisible: true, shopCategories: [], special: { kind: "percent", percentOff: 10, minQty: 1, ribbonText: "", ribbonColour: "" },
    });
    check("bundle special saved", bundle.special?.kind === "percent" && bundle.special.percentOff === 10, bundle.special);
    const withKit: any[] = await shop("GET", { resource: "products" });
    const kit = withKit.find((p) => p.kind === "bundle");
    check("the shop shows the bundle's special", kit?.variants[0]?.special?.percentOff === 10, kit?.variants);

    const kitOrder = await shop("POST", { resource: "orders" }, { lines: [{ key: kit.variants[0].key, qty: 2 }], notes: "" });
    check("bundle order subtotal has 10% off (180 - 18)", Number(kitOrder.subtotalNzd) === 162, kitOrder.subtotalNzd);
    await admin("POST", { resource: "shop-orders", id: kitOrder.id, action: "confirm" }, {
        lines: [{ key: kit.variants[0].key, qty: 2 }], shippingNzd: 0, message: "",
    });
    const [kitRow] = await sql`select sale_id from shop_orders where id = ${kitOrder.id}`;
    const kitSale = (await admin("GET", { resource: "sales" })).find((s: any) => s.id === kitRow.sale_id);
    check("the bundle's customer order has the 18 off as its discount", kitSale?.data.discountNzd === 18, kitSale?.data.discountNzd);
    check("  ...and its item lines still add up to the full bundle price",
        Math.round(kitSale?.data.lines.reduce((t: number, l: any) => t + l.qty * l.unitPriceNzd, 0) * 100) / 100 === 180, kitSale?.data.lines);

    // ---- Storewide sale: 15% off orders of $200 or more. Now: 5mg no special, 10mg 20% off from 4, kit 10% off. ----
    const zeroSale = await call(handleAdminRequest, OWNER, "PUT", { resource: "storewide" }, { sale: { percentOff: 0 } });
    check("a storewide sale of 0% is refused", zeroSale.status === 400, zeroSale);
    const pastSale = await call(handleAdminRequest, OWNER, "PUT", { resource: "storewide" }, { sale: { percentOff: 10, endsOn: "2020-01-01" } });
    check("a storewide sale ending in the past is refused", pastSale.status === 400, pastSale);
    const started = await admin("PUT", { resource: "storewide" }, {
        sale: { percentOff: 15, minSpendNzd: 200, endsOn: null, bannerText: "  Spring sale ", bannerColour: "#2563EB" },
    });
    check("storewide sale saved and on, wording trimmed, colour tidied",
        started.on && started.sale?.percentOff === 15 && started.sale.bannerText === "Spring sale" && started.sale.bannerColour === "#2563eb", started);
    check("the shop gets the sale", (await shop("GET", { resource: "sale" })).sale?.percentOff === 15);

    // Under the minimum spend: no sale.
    const under = await shop("POST", { resource: "orders" }, { lines: [{ key: smallKey, qty: 1 }], notes: "" });
    check("an order under the minimum spend doesn't get the sale", Number(under.subtotalNzd) === 50, under.subtotalNzd);
    check("  ...but its lines keep the sale they were sent under", under.lines[0]?.storewide?.percentOff === 15, under.lines);

    // 2 x 5mg ($100: sale 15 off) + 4 x 10mg ($200: own special 40 off beats the sale's 30) + 1 kit ($90: sale 13.50
    // beats its own 9). After specials that's 341, over the 200 minimum. 390 - 15 - 40 - 13.50 = 321.50.
    const over = await shop("POST", { resource: "orders" }, {
        lines: [{ key: smallKey, qty: 2 }, { key: largeKey, qty: 4 }, { key: kit.variants[0].key, qty: 1 }], notes: "",
    });
    check("each line gets its special or the sale, whichever saves more", Number(over.subtotalNzd) === 321.5, over.subtotalNzd);
    await admin("POST", { resource: "shop-orders", id: over.id, action: "confirm" }, {
        lines: over.lines.map((l: any) => ({ key: l.key, qty: l.qty })), shippingNzd: 0, message: "",
    });
    const [overRow] = await sql`select subtotal_nzd, sale_id from shop_orders where id = ${over.id}`;
    const overSale = (await admin("GET", { resource: "sales" })).find((s: any) => s.id === overRow.sale_id);
    check("the customer order has specials + sale as its discount (40 + 28.50)", overSale?.data.discountNzd === 68.5, overSale?.data.discountNzd);
    check("  ...notes say what the sale took off", /Storewide sale: 15% off/.test(overSale?.data.notes ?? "") && /20% off/.test(overSale?.data.notes ?? ""), overSale?.data.notes);

    // Confirming fewer, so it drops under the minimum: the sale comes off.
    const dropping = await shop("POST", { resource: "orders" }, { lines: [{ key: smallKey, qty: 5 }], notes: "" });
    check("5 x 5mg ($250) gets 15% off", Number(dropping.subtotalNzd) === 212.5, dropping.subtotalNzd);
    await admin("POST", { resource: "shop-orders", id: dropping.id, action: "confirm" }, { lines: [{ key: smallKey, qty: 3 }], shippingNzd: 0, message: "" });
    const [dropRow] = await sql`select subtotal_nzd, sale_id from shop_orders where id = ${dropping.id}`;
    const dropSale = (await admin("GET", { resource: "sales" })).find((s: any) => s.id === dropRow.sale_id);
    check("confirmed under the minimum ($150): no sale", Number(dropRow.subtotal_nzd) === 150 && dropSale?.data.discountNzd === 0, [dropRow, dropSale?.data.discountNzd]);

    // An end date that's passed switches it off by itself; ending it takes it away.
    await sql`update app_settings set value = jsonb_set(value, '{endsOn}', '"2020-01-01"') where business_id = ${business.id} and key = 'storewide_sale'`;
    check("a sale past its end date is off", (await shop("GET", { resource: "sale" })).sale === null && !(await admin("GET", { resource: "storewide" })).on);
    await admin("PUT", { resource: "storewide" }, { sale: { percentOff: 10 } });
    await admin("PUT", { resource: "storewide" }, { sale: null });
    const afterEnd = await shop("POST", { resource: "orders" }, { lines: [{ key: smallKey, qty: 1 }], notes: "" });
    check("after ending it, orders don't carry the sale", (await shop("GET", { resource: "sale" })).sale === null && !afterEnd.lines[0].storewide, afterEnd.lines);
} finally {
    await removeEverything();
    await sql.end();
}

console.log(failures === 0 ? "\nAll passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
