// Checks that businesses can't see or change each other's data. Creates a throwaway test business with its
// own owner and customer, runs real API requests as them and as The Gene Protocol's owner, then deletes
// everything it made. Never run against the live database until the switch-over.
// Usage: npx tsx scripts/testIsolation.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import postgres from "postgres";
import { handleAdminRequest } from "../api/admin/[resource]";
import { handleShopRequest } from "../api/shop/[resource]";
import { handleLibraryRequest } from "../api/library";
import { handleBusinessRequest } from "../api/business/[action]";
import { runAsBusiness } from "../api/_lib/business";
import { customers, invItems } from "../api/_lib/schema";

const TEST_ID = "isolation-test";
const TEST_SLUG = "isolation-test-shop";
const OWNER_B = "user_isolation_test_owner";
const CUSTOMER_B = "user_isolation_test_customer";
const OWNER_C = "user_isolation_test_signup"; // signs up a business during the test
const SIGNUP_SLUG = "isolation-signup-test";
const STRANGER = "user_isolation_test_stranger"; // signed in, but no business and no shop link
const OWNER_TGP = (process.env.ADMIN_USER_IDS ?? "").split(",")[0]?.trim();
if (!OWNER_TGP) throw new Error("ADMIN_USER_IDS is empty in .env.local");

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1, onnotice: () => {} });

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      ${JSON.stringify(detail)}`}`);
}

async function call(
  handler: (req: any, res: any, userId: string) => Promise<unknown>,
  userId: string,
  method: string,
  query: Record<string, string>,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  const out = { status: 200, body: undefined as any };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(data: unknown) {
      out.body = data;
      return res;
    },
    setHeader() {},
  };
  await handler({ method, query, body, headers }, res, userId);
  return out;
}
const admin = (userId: string, method: string, query: Record<string, string>, body?: unknown) =>
  call(handleAdminRequest, userId, method, query, body);
const shop = (userId: string, method: string, query: Record<string, string>, body?: unknown, headers?: Record<string, string>) =>
  call(handleShopRequest, userId, method, query, body, headers);

const library = (userId: string, headers?: Record<string, string>) =>
  call(handleLibraryRequest, userId, "GET", {}, undefined, headers);
const business = (userId: string, method: string, action: string, body?: unknown, extra: Record<string, string> = {}) =>
  call(handleBusinessRequest, userId, method, { action, ...extra }, body);

async function cleanUp() {
  const signedUp = await sql`select id from businesses where slug = ${SIGNUP_SLUG}`;
  for (const id of [TEST_ID, ...signedUp.map((b) => b.id)]) await cleanBusiness(id);
}

async function cleanBusiness(id: string) {
  for (const table of [
    "peptide_library", "supplier_catalog", "notifications", "shop_orders", "sales", "stock_movements", "inventory_lots", "purchase_orders",
    "bundles", "expenses", "app_settings", "inv_items", "customers", "protocols", "user_state_documents",
    "business_members",
  ]) {
    await sql.unsafe(`delete from ${table} where business_id = $1`, [id]);
  }
  await sql`delete from businesses where id = ${id}`;
}

async function tgpCounts() {
  const [row] = await sql`
    select (select count(*) from customers where business_id = 'tgp')::int customers,
           (select count(*) from inv_items where business_id = 'tgp')::int items,
           (select count(*) from sales where business_id = 'tgp')::int sales,
           (select count(*) from shop_orders where business_id = 'tgp')::int shop_orders,
           (select count(*) from expenses where business_id = 'tgp')::int expenses,
           (select count(*) from bundles where business_id = 'tgp')::int bundles,
           (select coalesce(max(order_number), 0) from shop_orders where business_id = 'tgp')::int last_order,
           (select value::text from app_settings where business_id = 'tgp' and key = 'payment_details') payment`;
  return row;
}

try {
  if (!process.env.DATABASE_URL!.includes("ep-ancient-flower")) {
    throw new Error("This test writes data - point .env.local at the dev database first.");
  }
  await cleanUp();
  const before = await tgpCounts();

  // A second business with an owner and a customer (with a full address, so they can order).
  await sql`insert into businesses (id, slug, name, billing_exempt) values (${TEST_ID}, ${TEST_SLUG}, 'Isolation Test Co', true)`;
  await sql`insert into business_members (business_id, clerk_user_id, role) values (${TEST_ID}, ${OWNER_B}, 'owner')`;
  await sql`
    insert into customers (id, business_id, clerk_user_id, name, email, shipping_address)
    values (gen_random_uuid()::text, ${TEST_ID}, ${CUSTOMER_B}, 'Test Customer', 'test@example.com',
            ${sql.json({ line1: "1 Test St", line2: "", suburb: "Testville", city: "Auckland", postcode: "1010", country: "New Zealand" })})`;

  console.log("\n-- Who's who");
  const meB = await admin(OWNER_B, "GET", { resource: "me" });
  check("Test owner is an owner of their own business only", meB.body?.isAdmin === true && meB.body?.business?.slug === TEST_SLUG, meB.body);
  const meTgp = await admin(OWNER_TGP, "GET", { resource: "me" });
  check("Your login is still the owner of The Gene Protocol", meTgp.body?.isAdmin === true && meTgp.body?.business?.slug === "the-gene-protocol", meTgp.body);
  const meCust = await admin(CUSTOMER_B, "GET", { resource: "me" });
  check("Test customer is not an owner", meCust.body?.isAdmin === false, meCust.body);
  const custAdmin = await admin(CUSTOMER_B, "GET", { resource: "customers" });
  check("Test customer is refused admin pages", custAdmin.status === 403, custAdmin);

  console.log("\n-- You still see all of your own data");
  for (const [resource, count] of [["items", before.items], ["sales", before.sales], ["customers", before.customers], ["expenses", before.expenses], ["bundles", before.bundles], ["shop-orders", before.shop_orders]] as const) {
    const r = await admin(OWNER_TGP, "GET", { resource });
    check(`You see all ${count} of your ${resource}`, Array.isArray(r.body) && r.body.length === count, { status: r.status, got: r.body?.length });
  }
  const yourPay = await admin(OWNER_TGP, "GET", { resource: "settings" });
  check("You see your payment details", JSON.stringify(yourPay.body?.paymentDetails ?? null) === (before.payment ? JSON.stringify(JSON.parse(before.payment)) : "null") || !before.payment, yourPay.body);

  console.log("\n-- A new business starts empty");
  for (const resource of ["items", "orders", "inventory", "sales", "expenses", "bundles", "customers", "shop-orders"]) {
    const r = await admin(OWNER_B, "GET", { resource });
    const rows = Array.isArray(r.body) ? r.body : [];
    const own = resource === "customers" ? rows.filter((c: any) => c.name !== "Test Customer") : rows;
    check(`Test owner sees none of your ${resource}`, r.status === 200 && own.length === 0, { status: r.status, count: own.length });
  }
  const settingsB = await admin(OWNER_B, "GET", { resource: "settings" });
  check("Test owner can't see your payment details", settingsB.body?.paymentDetails?.accountNumber === "", settingsB.body);
  const productsB = await shop(CUSTOMER_B, "GET", { resource: "products" });
  check("Test customer's shop shows none of your products", Array.isArray(productsB.body) && productsB.body.length === 0, productsB.body?.length);

  console.log("\n-- Reaching your records directly by their id");
  const [tgpItem] = await sql`select id from inv_items where business_id = 'tgp' limit 1`;
  const [tgpSale] = await sql`select id from sales where business_id = 'tgp' limit 1`;
  const [tgpCustomer] = await sql`select id from customers where business_id = 'tgp' limit 1`;
  if (tgpItem) {
    const inv = await admin(OWNER_B, "GET", { resource: "inventory", id: tgpItem.id });
    check("Test owner can't open one of your products", inv.status === 404, inv.status);
    const patch = await admin(OWNER_B, "PATCH", { resource: "items", id: tgpItem.id }, { name: "HACKED" });
    check("Test owner can't rename one of your products", patch.status === 404, patch.status);
  }
  if (tgpSale) {
    const s = await admin(OWNER_B, "GET", { resource: "sales", id: tgpSale.id });
    check("Test owner can't open one of your customer orders", s.status === 404, s.status);
    const d = await admin(OWNER_B, "DELETE", { resource: "sales", id: tgpSale.id });
    check("Test owner can't delete one of your customer orders", d.status === 404, d.status);
  }
  if (tgpCustomer) {
    const c = await admin(OWNER_B, "GET", { resource: "customers", id: tgpCustomer.id });
    check("Test owner can't open one of your customers", c.status === 404, c.status);
    const m = await admin(OWNER_B, "DELETE", { resource: "customers", id: tgpCustomer.id });
    const [still] = await sql`select id from customers where id = ${tgpCustomer.id}`;
    check("Test owner can't delete one of your customers", Boolean(still), m);
  }

  console.log("\n-- The test business works on its own");
  const item = await admin(OWNER_B, "POST", { resource: "items" }, { kind: "peptide", name: "Test Peptide", variant: "5mg", unit: "vial" });
  check("Test owner adds a product", item.status === 201, item);
  await admin(OWNER_B, "PATCH", { resource: "items", id: item.body.id }, { sellPriceNzd: 50, shopVisible: true });
  const adj = await admin(OWNER_B, "POST", { resource: "adjust" }, { itemId: item.body.id, qty: 5, reason: "Count", unitCostNzd: 10 });
  check("Test owner adds stock", adj.status === 200, adj);
  const pay = await admin(OWNER_B, "PUT", { resource: "settings" }, {
    paymentDetails: { bankName: "Test Bank", accountName: "Test Co", accountNumber: "12-3456-7890123-00", instructions: "" },
  });
  check("Test owner saves their own payment details", pay.status === 200, pay);
  const exp = await admin(OWNER_B, "POST", { resource: "expenses" }, {
    expenseDate: "2026-10-04", category: "Other", detail: { items: [{ id: "x", name: "Tape", qty: 1, unitCostNzd: 5 }], shippingNzd: 0, taxNzd: 0, discountNzd: 0 },
  });
  check("Test owner adds an expense", exp.status === 201, exp);

  // A catalogue product with the same fixed id as one of yours.
  const [tgpCat] = await sql`select id, name, variant from inv_items where business_id = 'tgp' and id like 'cat:%' limit 1`;
  if (tgpCat) {
    const order = await admin(OWNER_B, "POST", { resource: "orders" }, {
      data: {
        supplier: "Test Supplier", orderDate: "2026-10-04", currency: "NZD",
        lines: [{ id: "l1", itemId: tgpCat.id, kind: "peptide", name: "Test copy", variant: "", unit: "vial", packPrice: 10, packs: 1, unitsPerPack: 1 }],
        orderDiscountPct: 0, supplierCharges: [], supplierBilledTotal: null, totalPaidNzd: null, paymentFeesNzd: [], extraCostsNzd: [],
        manualRateUsdPerNzd: null, tracking: "", notes: "",
      },
    });
    check("Test owner can stock a catalogue product you also stock", order.status === 201, order);
    const [yours] = await sql`select name, variant from inv_items where business_id = 'tgp' and id = ${tgpCat.id}`;
    check("...and your product of the same id is untouched", yours?.name === tgpCat.name && yours?.variant === tgpCat.variant, yours);
  }

  console.log("\n-- The test business's customer");
  const products = await shop(CUSTOMER_B, "GET", { resource: "products" });
  check("Test customer sees only the test business's product", products.body?.length === 1 && products.body[0].name === "Test Peptide", products.body);
  const key = products.body?.[0]?.variants?.[0]?.key;
  const sent = await shop(CUSTOMER_B, "POST", { resource: "orders" }, { lines: [{ key, qty: 2 }], notes: "" });
  check("Test customer sends an order", sent.status === 201, sent);
  check("Their first order is #1001 (each business numbers its own)", sent.body?.orderNumber === 1001, sent.body?.orderNumber);
  const waiting = await admin(OWNER_B, "GET", { resource: "shop-orders", count: "1" });
  check("Test owner sees the order waiting", waiting.body?.waiting === 1, waiting.body);
  const confirm = await admin(OWNER_B, "POST", { resource: "shop-orders", id: sent.body.id, action: "confirm" }, { lines: [{ key, qty: 2 }], shippingNzd: 5, message: "" });
  check("Test owner confirms it", confirm.status === 200, confirm);
  const mine = await shop(CUSTOMER_B, "GET", { resource: "orders" });
  check(
    "Customer is shown the test business's bank details, not yours",
    mine.body?.[0]?.paymentDetails?.bankName === "Test Bank",
    mine.body?.[0]?.paymentDetails
  );
  const tgpWaiting = await admin(OWNER_TGP, "GET", { resource: "shop-orders" });
  check("The order isn't in your New Orders", Array.isArray(tgpWaiting.body) && !tgpWaiting.body.some((o: any) => o.id === sent.body.id), tgpWaiting.status);
  const tgpCustomers = await admin(OWNER_TGP, "GET", { resource: "customers" });
  check("The test customer isn't in your Customers", Array.isArray(tgpCustomers.body) && !tgpCustomers.body.some((c: any) => c.name === "Test Customer"), tgpCustomers.status);
  const tgpItems = await admin(OWNER_TGP, "GET", { resource: "items" });
  check("The test product isn't in your products", Array.isArray(tgpItems.body) && !tgpItems.body.some((i: any) => i.name === "Test Peptide"), tgpItems.status);
  const unknown = await shop(CUSTOMER_B, "GET", { resource: "products" }, undefined, { "x-business": "no-such-shop" });
  check("A made-up shop link finds nothing", unknown.status === 404, unknown);

  console.log("\n-- Peptide library and price list");
  const tgpLibraryCount = (await sql`select count(*)::int n from peptide_library where business_id = 'tgp'`)[0].n;
  const tgpLib = await library(OWNER_TGP);
  check(`You see all ${tgpLibraryCount} of your library records`, Array.isArray(tgpLib.body) && tgpLib.body.length === tgpLibraryCount, tgpLib.body?.length);
  const libB = await library(CUSTOMER_B);
  check("Test business's library starts with none of your records", Array.isArray(libB.body) && libB.body.length === 0, libB.body?.length);
  const priceB = await admin(OWNER_B, "GET", { resource: "supplier-catalog" });
  check("Test owner's price list starts empty (yours stays private)", Array.isArray(priceB.body) && priceB.body.length === 0, priceB.body?.length);
  const addPrice = await admin(OWNER_B, "POST", { resource: "supplier-catalog" }, { name: "Test Product", options: [{ code: "TP1", vialSize: "5mg", priceUsd: 20 }] });
  check("Test owner adds to their price list", addPrice.status === 201, addPrice);
  const tgpPrices = await admin(OWNER_TGP, "GET", { resource: "supplier-catalog" });
  const tgpPriceCount = (await sql`select count(*)::int n from supplier_catalog where business_id = 'tgp'`)[0].n;
  check(`You see your ${tgpPriceCount} price list products and not theirs`, tgpPrices.body?.length === tgpPriceCount && !tgpPrices.body.some((p: any) => p.name === "Test Product"), tgpPrices.body?.length);

  console.log("\n-- Shop links");
  const stranger = await admin(STRANGER, "GET", { resource: "me" });
  check("Someone with no shop link isn't put in any business", stranger.status === 404 && stranger.body?.code === "no-business", stranger);
  const strangerShop = await shop(STRANGER, "GET", { resource: "products" });
  check("...and can't see any shop", strangerShop.status === 404, strangerShop.status);
  const ownerLink = await admin(OWNER_B, "GET", { resource: "items" }, undefined);
  const ownerOther = await call(handleAdminRequest, OWNER_B, "GET", { resource: "me" }, undefined, { "x-business": "the-gene-protocol" });
  check("An owner opening someone else's shop link still only gets their own business", ownerOther.body?.business?.slug === TEST_SLUG && ownerLink.status === 200, ownerOther.body);
  const publicName = await business(STRANGER, "GET", "shop", undefined, { slug: TEST_SLUG });
  check("A shop link shows only its name and logo, nothing else", publicName.status === 200 && Object.keys(publicName.body).sort().join() === "logoUrl,name,slug", publicName.body);

  console.log("\n-- Signing up a business");
  const tgpLibCount = (await sql`select count(*)::int n from peptide_library where business_id = 'tgp'`)[0].n;
  const taken = await business(OWNER_C, "GET", "slug", undefined, { slug: "the-gene-protocol" });
  check("A shop link that's taken is refused", taken.body?.available === false, taken.body);
  const reserved = await business(OWNER_C, "GET", "slug", undefined, { slug: "admin" });
  check("A reserved shop link is refused", reserved.body?.available === false, reserved.body);
  const created = await business(OWNER_C, "POST", "create", { name: "Signup Test Co", slug: SIGNUP_SLUG, region: "INTL" });
  check("A new owner signs up a business", created.status === 201, created);
  const [newBiz] = await sql`select * from businesses where slug = ${SIGNUP_SLUG}`;
  const copied = newBiz ? (await sql`select count(*)::int n from peptide_library where business_id = ${newBiz.id}`)[0].n : 0;
  check(`It starts with a copy of your ${tgpLibCount} library records`, copied === tgpLibCount, copied);
  const newPrices = newBiz ? (await sql`select count(*)::int n from supplier_catalog where business_id = ${newBiz.id}`)[0].n : -1;
  check("...but not your price list", newPrices === 0, newPrices);
  check("It pays in US dollars (outside NZ)", newBiz?.country === "INTL", newBiz?.country);
  const second = await business(OWNER_C, "POST", "create", { name: "Second Co", slug: "isolation-signup-two", region: "NZ" });
  check("An owner can't sign up a second business", second.status === 409, second.status);
  const meC = await admin(OWNER_C, "GET", { resource: "me" });
  check("Before the free trial starts, the app asks them to start it", meC.body?.access === "needs-checkout" && meC.body?.isAdmin === true, meC.body);
  const itemsC = await admin(OWNER_C, "GET", { resource: "items" });
  check("...and their admin pages wait until then", itemsC.status === 402 && itemsC.body?.code === "subscription-required", itemsC);

  console.log("\n-- Subscriptions");
  await sql`update businesses set billing_exempt = false, subscription_status = 'trialing' where id = ${TEST_ID}`;
  const trialing = await admin(OWNER_B, "GET", { resource: "items" });
  check("A business on its free trial works", trialing.status === 200, trialing.status);
  await sql`update businesses set subscription_status = 'past_due' where id = ${TEST_ID}`;
  const pastDue = await admin(OWNER_B, "GET", { resource: "items" });
  check("...and keeps working while Stripe retries a failed payment", pastDue.status === 200, pastDue.status);
  await sql`update businesses set subscription_status = 'canceled' where id = ${TEST_ID}`;
  const pausedOwner = await admin(OWNER_B, "GET", { resource: "items" });
  check("When the subscription ends, the owner's pages pause", pausedOwner.status === 402 && pausedOwner.body?.code === "subscription-required", pausedOwner);
  const pausedMe = await admin(OWNER_B, "GET", { resource: "me" });
  check("...but the app can still tell them how to restart it", pausedMe.status === 200 && pausedMe.body?.access === "paused" && pausedMe.body?.billing?.subscriptionStatus === "canceled", pausedMe.body);
  const pausedCustomer = await shop(CUSTOMER_B, "GET", { resource: "products" });
  check("...and their customers see the shop is unavailable", pausedCustomer.status === 402 && pausedCustomer.body?.code === "shop-unavailable", pausedCustomer);
  const yoursStill = await admin(OWNER_TGP, "GET", { resource: "items" });
  check("Your business isn't affected", yoursStill.status === 200, yoursStill.status);
  await sql`update businesses set billing_exempt = true, subscription_status = null where id = ${TEST_ID}`;

  console.log("\n-- The database's own guard");
  const leaked = await runAsBusiness(TEST_ID, async (db) => (await db.select().from(customers)).filter((c) => c.businessId !== TEST_ID));
  check("Reading as the test business returns no other business's rows", leaked.length === 0, leaked.length);
  let blocked = false;
  try {
    await runAsBusiness(TEST_ID, async (db) => {
      await db.insert(invItems).values({ id: "sneaky", businessId: "tgp", kind: "supply", name: "Sneaky" });
    });
  } catch {
    blocked = true;
  }
  check("The test business can't add a row to your business", blocked);
  const [noBusiness] = await sql.begin(async (tx) => {
    await tx`set local role peppal_app`;
    return tx`select count(*)::int n from customers`;
  });
  check("A request with no business selected sees nothing", noBusiness.n === 0, noBusiness);

  console.log("\n-- Your data afterwards");
  const after = await tgpCounts();
  check("Your counts, last order number and payment details are unchanged", JSON.stringify(after) === JSON.stringify(before), { before, after });
} finally {
  await cleanUp();
  await sql.end();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
