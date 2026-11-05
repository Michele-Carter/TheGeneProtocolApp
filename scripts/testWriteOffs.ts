// Checks stock written off: taking stock out without a sale (Personal use, Damaged...) is listed with the expenses at
// what that stock cost, follows the adjustment when it's edited or deleted, can't be changed from Expenses, and stock
// added by an adjustment isn't listed. Sets up a throwaway business, runs real API requests, then deletes everything
// it made. Dev database only.
// Usage: npx tsx scripts/testWriteOffs.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
process.env.VAPID_PUBLIC_KEY ||= "test";
process.env.VAPID_PRIVATE_KEY ||= "test";

import postgres from "postgres";
import { handleAdminRequest } from "../api/admin/[resource]";
import { handleBusinessRequest } from "../api/business/[action]";

if (!process.env.DATABASE_URL?.includes("ep-ancient-flower")) throw new Error("Only for the dev database - stopping");

const SLUG = "write-offs-test";
const OWNER = "user_write_offs_test_owner";
const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1, onnotice: () => {} });

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`);
    if (!ok) failures++;
}

async function call(handler: any, method: string, query: Record<string, string>, body?: unknown) {
    const out = { status: 200, body: undefined as any };
    const res = {
        status(code: number) { out.status = code; return res; },
        json(data: unknown) { out.body = data; return res; },
        setHeader() {},
    };
    await handler({ method, query, body, headers: { "x-business": SLUG } }, res, OWNER);
    return out;
}
async function admin(method: string, query: Record<string, string>, body?: unknown): Promise<any> {
    const out = await call(handleAdminRequest, method, query, body);
    if (out.status >= 300) throw new Error(`${method} ${JSON.stringify(query)} -> ${out.status} ${JSON.stringify(out.body)}`);
    return out.body;
}

async function removeEverything() {
    const [b] = await sql`select id from businesses where slug = ${SLUG}`;
    if (!b) return;
    const tables = (await sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'business_id'`).map((r) => r.table_name);
    for (const t of tables) await sql`delete from ${sql(t)} where business_id = ${b.id}`;
    await sql`delete from businesses where id = ${b.id}`;
}

try {
    await removeEverything();
    const created = await call(handleBusinessRequest, "POST", { action: "create" }, { ownerName: "Test Owner", name: "Write Offs Test", slug: SLUG, country: "NZ" });
    if (created.status >= 300) throw new Error(JSON.stringify(created.body));
    await sql`update businesses set billing_exempt = true where slug = ${SLUG}`;

    // 10 pens at $17 each landed.
    const pen = await admin("POST", { resource: "items" }, { kind: "supply", name: "Test Pen", variant: "Purple", unit: "unit" });
    const supply = await admin("POST", { resource: "orders" }, {
        data: {
            orderType: "supplies", supplier: "Test Supplier", orderDate: "2026-01-01", currency: "USD",
            lines: [{ id: "l1", itemId: pen.id, kind: "supply", name: "Test Pen", variant: "Purple", unit: "unit", packPrice: 10, packs: 10, unitsPerPack: 1 }],
            orderDiscountPct: 0, supplierCharges: [], supplierDiscounts: [], supplierBilledTotal: 100, totalPaidNzd: 170,
            paymentFeesNzd: [], extraCostsNzd: [], manualRateUsdPerNzd: null, orderNumber: "T1", tracking: "", notes: "",
        },
    });
    await admin("POST", { resource: "orders", id: supply.id, action: "receive" }, { receivedDate: "2026-01-02" });
    await admin("POST", { resource: "expenses" }, {
        expenseDate: "2026-01-05", supplier: "Printer shop", category: "Labels & printing", orderNumber: "", notes: "",
        detail: { items: [{ id: "e1", name: "Labels", qty: 1, unitCostNzd: 20 }], shippingNzd: 0, taxNzd: 0, discountNzd: 0 },
    });

    const writeOffs = async () => ((await admin("GET", { resource: "expenses" })) as any[]).filter((e) => e.stockItemId);

    check("nothing written off before any stock is taken out", (await writeOffs()).length === 0);

    await admin("POST", { resource: "adjust" }, { itemId: pen.id, qty: -3, reason: "Personal use", note: "my own", date: "2026-01-10" });
    await admin("POST", { resource: "adjust" }, { itemId: pen.id, qty: 5, reason: "Found stock", unitCostNzd: 4, date: "2026-01-11" });

    const all: any[] = await admin("GET", { resource: "expenses" });
    const [w] = all.filter((e) => e.stockItemId);
    check("a removal is listed as stock written off", all.filter((e) => e.stockItemId).length === 1 && w.category === "Stock written off", all);
    check("at what the stock cost (3 x $17)", Math.abs(w.amountNzd - 51) < 0.01, w);
    check("on the day it was taken out, with its reason and note", w.expenseDate === "2026-01-10" && w.notes === "Personal use - my own", w);
    check("for the right item", w.stockItemId === pen.id && w.description === "Personal use: 3 × Test Pen Purple", w);
    check("stock added by an adjustment isn't listed", !all.some((e) => e.stockItemId && e.notes.startsWith("Found stock")));
    check("ordinary expenses are still listed, newest first", all.length === 2 && all[0].id === w.id && all[1].category === "Labels & printing" && all[1].stockItemId === null, all);

    const patched = await call(handleAdminRequest, "PATCH", { resource: "expenses", id: w.id }, {
        expenseDate: "2026-01-10", supplier: "", category: "Other", orderNumber: "", notes: "",
        detail: { items: [{ id: "x", name: "x", qty: 1, unitCostNzd: 1 }], shippingNzd: 0, taxNzd: 0, discountNzd: 0 },
    });
    const deleted = await call(handleAdminRequest, "DELETE", { resource: "expenses", id: w.id });
    check("it can't be changed or deleted from Expenses", patched.status === 404 && deleted.status === 404, { patched, deleted });
    const bad = await call(handleAdminRequest, "POST", { resource: "expenses" }, {
        expenseDate: "2026-01-05", supplier: "", category: "Stock written off", orderNumber: "", notes: "",
        detail: { items: [{ id: "e1", name: "x", qty: 1, unitCostNzd: 1 }], shippingNzd: 0, taxNzd: 0, discountNzd: 0 },
    });
    check("an expense can't be saved by hand as stock written off", bad.status === 400, bad);

    // Editing the adjustment changes it; deleting the adjustment takes it away.
    const adjustmentId = w.id.replace(/^stock-/, "");
    await admin("PATCH", { resource: "adjust", id: adjustmentId }, { qty: -1, reason: "Damaged / broken", note: "", date: "2026-01-12" });
    const [edited] = await writeOffs();
    check("editing the adjustment changes it", Math.abs(edited.amountNzd - 17) < 0.01 && edited.expenseDate === "2026-01-12" && edited.notes === "Damaged / broken", edited);
    await admin("DELETE", { resource: "adjust", id: adjustmentId });
    check("deleting the adjustment takes it away", (await writeOffs()).length === 0);

    // One removal that spans two batches ($17 and $4) is one write-off at what each part cost.
    await admin("POST", { resource: "adjust" }, { itemId: pen.id, qty: -12, reason: "Expired", date: "2026-01-20" });
    const spanning = await writeOffs();
    check("a removal across two batches is one write-off (10 x $17 + 2 x $4)", spanning.length === 1 && Math.abs(spanning[0].amountNzd - 178) < 0.01, spanning);
} finally {
    await removeEverything();
    await sql.end();
}

console.log(failures === 0 ? "\nAll passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
