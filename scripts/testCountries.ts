// Checks businesses outside New Zealand work in their own country's way: currency, time zone, bank details,
// addresses and supplier orders. Signs up a throwaway business in Los Angeles (US) and one in the UK, runs real
// API requests as their owners and a customer, then deletes everything it made. Dev database only.
// Usage: npx tsx scripts/testCountries.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import postgres from "postgres";
import { handleAdminRequest } from "../api/admin/[resource]";
import { handleShopRequest } from "../api/shop/[resource]";
import { handleBusinessRequest } from "../api/business/[action]";
import { customerPrice } from "../shared/countries";

if (!process.env.DATABASE_URL?.includes("ep-ancient-flower")) throw new Error("Only for the dev database - stopping");

const US_OWNER = "user_country_test_us";
const GB_OWNER = "user_country_test_gb";
const US_CUSTOMER = "user_country_test_us_customer";
const US_SLUG = "country-test-us";
const GB_SLUG = "country-test-gb";

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
const business = (userId: string, method: string, action: string, body?: unknown) =>
  call(handleBusinessRequest, userId, method, { action }, body);

async function cleanUp() {
  const made = await sql`select id from businesses where slug in (${US_SLUG}, ${GB_SLUG})`;
  for (const { id } of made) {
    for (const table of [
      "peptide_library", "supplier_catalog", "notifications", "shop_orders", "sales", "stock_movements", "inventory_lots",
      "purchase_orders", "bundles", "expenses", "app_settings", "inv_items", "customers", "protocols", "user_state_documents",
      "push_subscriptions", "business_members",
    ]) {
      await sql.unsafe(`delete from ${table} where business_id = $1`, [id]);
    }
    await sql`delete from businesses where id = ${id}`;
  }
}

// The calendar day a stored moment falls on in a time zone.
const dayIn = (moment: Date | string, timeZone: string) => new Date(moment).toLocaleDateString("en-CA", { timeZone });

try {
  await cleanUp();

  console.log("-- Signing up");
  const us = await business(US_OWNER, "POST", "create", { ownerName: "Uma Tester", name: "Country Test US", slug: US_SLUG, country: "US", timeZone: "America/Los_Angeles" });
  check("A US business signs up", us.status === 201, us);
  const gb = await business(GB_OWNER, "POST", "create", { ownerName: "Gail Tester", name: "Country Test UK", slug: GB_SLUG, country: "GB" });
  check("A UK business signs up", gb.status === 201, gb);
  // Skip the free trial for the test.
  await sql`update businesses set billing_exempt = true where slug in (${US_SLUG}, ${GB_SLUG})`;

  const meUs = await admin(US_OWNER, "GET", { resource: "me" });
  check(
    "The app is told the US business is in the US, in US dollars, on Pacific time",
    meUs.body?.business?.country === "US" && meUs.body?.business?.currency === "USD" && meUs.body?.business?.timeZone === "America/Los_Angeles",
    meUs.body?.business
  );
  check("...and its subscription is the US$ price", meUs.body?.billing?.plan === "usd", meUs.body?.billing?.plan);
  const meGb = await admin(GB_OWNER, "GET", { resource: "me" });
  check(
    "The UK business is in pounds on UK time",
    meGb.body?.business?.currency === "GBP" && meGb.body?.business?.timeZone === "Europe/London",
    meGb.body?.business
  );

  console.log("\n-- Settings");
  const zone = await business(US_OWNER, "PATCH", "details", { timeZone: "America/New_York" });
  check("The owner can switch to another US time zone", zone.status === 200 && zone.body?.timeZone === "America/New_York", zone);
  const badZone = await business(US_OWNER, "PATCH", "details", { timeZone: "Europe/London" });
  check("...but not one outside their country", badZone.status === 400, badZone.status);
  await business(US_OWNER, "PATCH", "details", { timeZone: "America/Los_Angeles" });
  const lockedAtStart = await admin(US_OWNER, "GET", { resource: "me" });
  check("A new business can still choose its country", lockedAtStart.body?.billing?.countryLocked === false, lockedAtStart.body?.billing);
  const moveBefore = await business(US_OWNER, "PATCH", "country", { country: "CA" });
  check("...and change it (the currency follows)", moveBefore.status === 200 && moveBefore.body?.currency === "CAD", moveBefore);
  await business(US_OWNER, "PATCH", "country", { country: "US", timeZone: "America/Los_Angeles" });
  await sql`update businesses set stripe_subscription_id = 'sub_country_test' where slug = ${US_SLUG}`;
  const toNz = await business(US_OWNER, "PATCH", "country", { country: "NZ" });
  check("With a subscription running, it can't move to the NZ price", toNz.status === 409, toNz.status);
  const toCa = await business(US_OWNER, "PATCH", "country", { country: "CA" });
  check("...but can move to another overseas country", toCa.status === 200, toCa.status);
  await business(US_OWNER, "PATCH", "country", { country: "US", timeZone: "America/Los_Angeles" });
  await sql`update businesses set stripe_subscription_id = null where slug = ${US_SLUG}`;

  console.log("\n-- Bank details");
  const zelle = await admin(US_OWNER, "PUT", { resource: "settings" }, {
    paymentDetails: { bankName: "Chase", accountName: "Country Test US", accountNumber: "Zelle: shop@example.com", instructions: "" },
  });
  check("A US business can save Zelle details (no NZ account number needed)", zelle.status === 200, zelle);
  const sortCode = await admin(GB_OWNER, "PUT", { resource: "settings" }, {
    paymentDetails: { bankName: "Barclays", accountName: "Country Test UK", accountNumber: "Sort code 12-34-56, account 12345678", instructions: "" },
  });
  check("A UK business can save a sort code and account", sortCode.status === 200, sortCode);
  const tgpRule = await admin(US_OWNER, "PUT", { resource: "settings" }, {
    paymentDetails: { bankName: "", accountName: "Country Test US", accountNumber: "", instructions: "" },
  });
  check("...but still has to say how to pay", tgpRule.status === 400, tgpRule.status);

  console.log("\n-- A customer's address");
  const shopLink = { "x-business": US_SLUG };
  // The test customer isn't a real login, so their customer record is made here (a real one is made from
  // their login's email on their first visit).
  const [usBiz] = await sql`select id from businesses where slug = ${US_SLUG}`;
  await sql`
    insert into customers (id, business_id, clerk_user_id, name, email)
    values (gen_random_uuid()::text, ${usBiz.id}, ${US_CUSTOMER}, 'Test Customer', 'country-test-customer@example.com')`;
  const joined = await shop(US_CUSTOMER, "GET", { resource: "me" }, undefined, shopLink);
  check("A customer joins the US shop", joined.status === 200, joined);
  const saved = await shop(US_CUSTOMER, "PUT", { resource: "me" }, {
    name: "Test Customer",
    email: "country-test-customer@example.com",
    shippingAddress: { line1: "1 Main St", line2: "", suburb: "", city: "Austin", region: "TX", postcode: "78701", country: "" },
  }, shopLink);
  check(
    "Their address keeps its state, and a blank country becomes the shop's (not New Zealand)",
    saved.status === 200 && saved.body?.shippingAddress?.region === "TX" && saved.body?.shippingAddress?.country === "United States",
    saved.body?.shippingAddress ?? saved
  );

  console.log("\n-- Stock and a supplier order");
  const item = await admin(US_OWNER, "POST", { resource: "items" }, { kind: "peptide", name: "Country Test Peptide", variant: "5mg", unit: "vial" });
  check("The owner adds a product", item.status === 201 || item.status === 200, item);
  const order = await admin(US_OWNER, "POST", { resource: "orders" }, {
    data: {
      supplier: "Test Supplier",
      orderDate: "2026-10-16",
      currency: "USD",
      lines: [{ id: "l1", itemId: item.body?.id, kind: "peptide", name: "Country Test Peptide", variant: "5mg", unit: "vial", packPrice: 100, packs: 1, unitsPerPack: 10 }],
      orderDiscountPct: 0,
      supplierCharges: [{ id: "c1", label: "Shipping", amount: 20 }],
      supplierBilledTotal: null,
      totalPaidNzd: 120,
      paymentFeesNzd: [],
      extraCostsNzd: [],
      manualRateUsdPerNzd: null,
      tracking: "",
      notes: "",
    },
  });
  check("A supplier order in US dollars is saved", order.status === 201, order);
  check("...worked out in the business's own currency (US$, no conversion)", order.body?.data?.homeCurrency === "USD", order.body?.data?.homeCurrency);
  check("...so $120 for 10 vials lands at $12 each", Math.abs((order.body?.summary?.averagePerUnitNzd ?? 0) - 12) < 0.001, order.body?.summary);
  const received = await admin(US_OWNER, "POST", { resource: "orders", id: order.body?.id, action: "receive" }, { receivedDate: "2026-10-16" });
  check("The order is received on 16 October", received.status === 200, received);
  const [lot] = await sql`select received_at from inventory_lots where item_id = ${item.body?.id}`;
  check(
    "...and in Los Angeles it's recorded as 16 October (not the 15th)",
    lot != null && dayIn(lot.received_at, "America/Los_Angeles") === "2026-10-16",
    lot && dayIn(lot.received_at, "America/Los_Angeles")
  );

  const lockedNow = await admin(US_OWNER, "GET", { resource: "me" });
  check("Once stock is recorded, the country is fixed", lockedNow.body?.billing?.countryLocked === true, lockedNow.body?.billing);
  const moveLate = await business(US_OWNER, "PATCH", "country", { country: "GB" });
  check("...and a change is refused (the currency stays US$)", moveLate.status === 409, moveLate.status);

  console.log("\n-- Prices as customers see them");
  check("US prices read $90.00", customerPrice(90, { country: "US", currency: "USD" }) === "$90.00", customerPrice(90, { country: "US", currency: "USD" }));
  check("UK prices read £90.00", customerPrice(90, { country: "GB", currency: "GBP" }) === "£90.00", customerPrice(90, { country: "GB", currency: "GBP" }));
  check("NZ prices still read $90.00", customerPrice(90, { country: "NZ", currency: "NZD" }) === "$90.00", customerPrice(90, { country: "NZ", currency: "NZD" }));

  console.log("\n-- The Gene Protocol");
  const [tgp] = await sql`select country, currency, time_zone from businesses where id = 'tgp'`;
  check("The Gene Protocol is still New Zealand, NZD, NZ time", tgp?.country === "NZ" && tgp?.currency === "NZD" && tgp?.time_zone === "Pacific/Auckland", tgp);
} finally {
  await cleanUp();
  await sql.end();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
