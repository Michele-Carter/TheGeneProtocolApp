// Fills a test business with made-up products, stock, customers and orders in every state, so its screens can be
// checked (e.g. a business in another country). Goes through the app's own API as the business's owner and its
// customers, so stock, order numbers and payment status work exactly as in real use. Dev database only, and only
// for a business that has no products yet.
// Usage: npx tsx scripts/seedDemoBusiness.ts <shop-link>      e.g. npx tsx scripts/seedDemoBusiness.ts pepper-country
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import postgres from "postgres";
import { handleAdminRequest } from "../api/admin/[resource]";
import { handleShopRequest } from "../api/shop/[resource]";
import { countryInfo } from "../shared/countries";

if (!process.env.DATABASE_URL?.includes("ep-ancient-flower")) throw new Error("Only for the dev database - stopping");
const slug = process.argv[2];
if (!slug) throw new Error("Pass the business's shop link, e.g. pepper-country");

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1, onnotice: () => {} });

async function call(
  handler: (req: any, res: any, userId: string) => Promise<unknown>,
  userId: string,
  method: string,
  query: Record<string, string>,
  body?: unknown
): Promise<any> {
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
  await handler({ method, query, body, headers: { "x-business": slug } }, res, userId);
  if (out.status >= 300) throw new Error(`${method} ${JSON.stringify(query)} -> ${out.status} ${JSON.stringify(out.body)}`);
  return out.body;
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
};

const [business] = await sql`select id, name, country from businesses where slug = ${slug}`;
if (!business) throw new Error(`No business with the shop link "${slug}"`);
const [owner] = await sql`select clerk_user_id from business_members where business_id = ${business.id} limit 1`;
if (!owner) throw new Error("That business has no owner");
const [{ n: existing }] = await sql`select count(*)::int n from inv_items where business_id = ${business.id}`;
if (existing > 0) throw new Error(`${business.name} already has ${existing} products - this only fills an empty business`);
const OWNER = owner.clerk_user_id as string;
const country = countryInfo(business.country);
const admin = (method: string, query: Record<string, string>, body?: unknown) => call(handleAdminRequest, OWNER, method, query, body);

console.log(`Filling ${business.name} (${country.name}, ${country.currency})...`);

// ---- Products, with shop prices ----
type P = { name: string; variant: string; kind: "peptide" | "supply"; unit: string; price: number; cats: string[]; stock: number; cost: number; extra?: Record<string, unknown> };
const products: P[] = [
  { name: "BPC-157", variant: "5mg", kind: "peptide", unit: "vial", price: 45, cats: ["Healing"], stock: 20, cost: 9 },
  { name: "BPC-157", variant: "10mg", kind: "peptide", unit: "vial", price: 70, cats: ["Healing"], stock: 15, cost: 14 },
  { name: "TB-500", variant: "5mg", kind: "peptide", unit: "vial", price: 50, cats: ["Healing"], stock: 15, cost: 11 },
  { name: "TB-500", variant: "10mg", kind: "peptide", unit: "vial", price: 85, cats: ["Healing"], stock: 10, cost: 19 },
  { name: "Semaglutide", variant: "5mg", kind: "peptide", unit: "vial", price: 90, cats: ["Weight Loss"], stock: 10, cost: 22 },
  { name: "Tirzepatide", variant: "10mg", kind: "peptide", unit: "vial", price: 120, cats: ["Weight Loss"], stock: 8, cost: 30 },
  { name: "Ipamorelin", variant: "5mg", kind: "peptide", unit: "vial", price: 40, cats: ["Growth Hormone"], stock: 12, cost: 8 },
  // Low stock.
  { name: "GHK-Cu", variant: "50mg", kind: "peptide", unit: "vial", price: 55, cats: ["Longevity", "Skin"], stock: 3, cost: 10, extra: { reorderLevel: 5 } },
  // No stock: sold as a pre-order.
  { name: "Retatrutide", variant: "10mg", kind: "peptide", unit: "vial", price: 150, cats: ["Weight Loss"], stock: 0, cost: 0 },
  // No stock and not orderable yet.
  { name: "MOTS-c", variant: "10mg", kind: "peptide", unit: "vial", price: 80, cats: ["Longevity"], stock: 0, cost: 0, extra: { comingSoon: true } },
  { name: "Bacteriostatic Water", variant: "10ml", kind: "supply", unit: "vial", price: 12, cats: ["Supplies"], stock: 30, cost: 2.5 },
  { name: "Insulin Syringes", variant: "Pack of 10", kind: "supply", unit: "pack", price: 8, cats: ["Supplies"], stock: 20, cost: 1.5 },
];

const ids: Record<string, string> = {};
const key = (p: Pick<P, "name" | "variant">) => `${p.name} ${p.variant}`;
for (const p of products) {
  const item = await admin("POST", { resource: "items" }, { kind: p.kind, name: p.name, variant: p.variant, unit: p.unit });
  await admin("PATCH", { resource: "items", id: item.id }, {
    sellPriceNzd: p.price,
    shopVisible: true,
    shopCategories: p.cats,
    shopDescription: `${p.name} ${p.variant} - demo product for testing.`,
    shopSection: p.kind === "supply" ? "supplies" : "peptides",
    ...(p.extra ?? {}),
  });
  ids[key(p)] = item.id;
}
console.log(`  ${products.length} products`);

// ---- Stock: one supplier order each for peptides and supplies, bought in US dollars and received ----
for (const [orderType, kind] of [["peptides", "peptide"], ["supplies", "supply"]] as const) {
  const lines = products
    .filter((p) => p.kind === kind && p.stock > 0)
    .map((p, i) => ({
      id: `l${i}`,
      itemId: ids[key(p)],
      kind: p.kind,
      name: p.name,
      variant: p.variant,
      unit: p.unit,
      packPrice: p.cost,
      packs: p.stock,
      unitsPerPack: 1,
    }));
  const subtotal = lines.reduce((t, l) => t + l.packPrice * l.packs, 0);
  const shipping = orderType === "peptides" ? 45 : 15;
  // A business paying in US dollars pays what was billed; anywhere else, a made-up conversion.
  const rate = country.currency === "USD" ? 1 : 1.5;
  const order = await admin("POST", { resource: "orders" }, {
    data: {
      orderType,
      supplier: orderType === "peptides" ? "Demo Peptide Supplier" : "Demo Supplies Co",
      orderDate: daysAgo(21),
      currency: "USD",
      lines,
      orderDiscountPct: 0,
      supplierCharges: [{ id: "c1", label: "Shipping", amount: shipping }],
      supplierDiscounts: [],
      supplierBilledTotal: subtotal + shipping,
      totalPaidNzd: Math.round((subtotal + shipping) * rate * 100) / 100,
      paymentFeesNzd: [],
      extraCostsNzd: [],
      manualRateUsdPerNzd: null,
      orderNumber: orderType === "peptides" ? "INV-1001" : "INV-2001",
      tracking: "",
      notes: "Demo order",
    },
  });
  await admin("POST", { resource: "orders", id: order.id, action: "receive" }, { receivedDate: daysAgo(14) });
}
console.log("  2 supplier orders, received into stock");

// ---- Payment details customers see on confirmed orders ----
await admin("PUT", { resource: "settings" }, {
  paymentDetails: {
    bankName: country.code === "NZ" ? "ANZ" : "Demo Bank",
    accountName: business.name,
    accountNumber: country.code === "NZ" ? "12-3456-7890123-00" : country.bank.accountPlaceholder.replace(/^e\.g\. /, ""),
    instructions: "Please use your order number as the reference.",
  },
});

// ---- Customers: six who shop online (with a login) and one entered by hand ----
const places: Record<string, [string, string, string][]> = {
  US: [["Austin", "TX", "78701"], ["Denver", "CO", "80202"], ["Miami", "FL", "33130"], ["Seattle", "WA", "98101"], ["Phoenix", "AZ", "85004"], ["Boston", "MA", "02108"], ["Chicago", "IL", "60601"]],
  AU: [["Bondi", "NSW", "2026"], ["Fitzroy", "VIC", "3065"], ["New Farm", "QLD", "4005"], ["Subiaco", "WA", "6008"], ["Glenelg", "SA", "5045"], ["Sandy Bay", "TAS", "7005"], ["Braddon", "ACT", "2612"]],
  CA: [["Toronto", "ON", "M5V 2T6"], ["Vancouver", "BC", "V6B 1A1"], ["Calgary", "AB", "T2P 1J9"], ["Montreal", "QC", "H2Y 1C6"], ["Halifax", "NS", "B3J 1S9"], ["Winnipeg", "MB", "R3C 0V8"], ["Ottawa", "ON", "K1P 1J1"]],
  GB: [["London", "", "SW1A 1AA"], ["Manchester", "", "M1 1AE"], ["Bristol", "", "BS1 4DJ"], ["Leeds", "", "LS1 1UR"], ["Edinburgh", "", "EH1 1YZ"], ["Cardiff", "", "CF10 1EP"], ["Brighton", "", "BN1 1EE"]],
  NZ: [["Auckland", "", "1010"], ["Wellington", "", "6011"], ["Christchurch", "", "8011"], ["Hamilton", "", "3204"], ["Tauranga", "", "3110"], ["Dunedin", "", "9016"], ["Nelson", "", "7010"]],
};
const names = ["Emily Johnson", "Michael Brown", "Sarah Davis", "James Wilson", "Olivia Martinez", "David Lee", "Chris Taylor"];
const address = (i: number) => {
  const [city, region, postcode] = (places[country.code] ?? places.US)[i];
  return { line1: `${100 + i * 17} Demo Street`, line2: "", suburb: "", city, region, postcode, country: country.name };
};
const shoppers: string[] = [];
for (let i = 0; i < 6; i++) {
  const login = `user_demo_${slug}_${i}`;
  shoppers.push(login);
  await sql`
    insert into customers (id, business_id, clerk_user_id, name, email, shipping_address)
    values (gen_random_uuid()::text, ${business.id}, ${login}, ${names[i]},
            ${`${names[i].split(" ")[0].toLowerCase()}.demo@example.com`}, ${sql.json(address(i))})`;
}
const byHand = await admin("POST", { resource: "customers" }, {
  name: names[6],
  email: "chris.demo@example.com",
  shippingAddress: address(6),
  notes: "Orders by text message.",
});
console.log("  7 customers");

// ---- Shop orders in every state ----
const shop = (who: number, method: string, query: Record<string, string>, body?: unknown) =>
  call(handleShopRequest, shoppers[who], method, query, body);
const catalog: any[] = await shop(0, "GET", { resource: "products" });
const variantKey = (name: string, variant: string) => {
  const product = catalog.find((p) => p.name === name);
  const v = product?.variants.find((x: any) => x.label === variant);
  if (!v) throw new Error(`${name} ${variant} isn't in the shop`);
  return v.key as string;
};
const send = (who: number, lines: [string, string, number][], notes = "") =>
  shop(who, "POST", { resource: "orders" }, { lines: lines.map(([n, v, qty]) => ({ key: variantKey(n, v), qty })), notes });
const confirm = (order: any, shippingNzd: number, message = "") =>
  admin("POST", { resource: "shop-orders", id: order.id, action: "confirm" }, {
    lines: order.lines.map((l: any) => ({ key: l.key, qty: l.qty })),
    shippingNzd,
    message,
  });

// Waiting to be confirmed.
await send(0, [["BPC-157", "5mg", 2], ["Bacteriostatic Water", "10ml", 1]], "Please send ASAP, thanks!");
// Waiting, with a pre-order (no stock yet).
await send(1, [["Retatrutide", "10mg", 1]]);
// Confirmed, waiting for the customer to pay.
const awaiting = await send(2, [["Semaglutide", "5mg", 1], ["Insulin Syringes", "Pack of 10", 1]]);
await confirm(awaiting, 10, "Thanks Sarah - payment details are below.");
// Confirmed, customer says they've paid (owner to check).
const reported = await send(3, [["TB-500", "10mg", 1], ["BPC-157", "10mg", 1]]);
await confirm(reported, 8);
await shop(3, "POST", { resource: "orders", id: reported.id, action: "paid" }, { reference: `#${reported.orderNumber}` });
// Confirmed and paid: ready to send.
const paid = await send(4, [["Tirzepatide", "10mg", 1]]);
await confirm(paid, 10);
await admin("POST", { resource: "shop-orders", id: paid.id, action: "mark-paid" }, {});
// Confirmed, paid and sent.
const sent = await send(5, [["Ipamorelin", "5mg", 2]]);
const sentConfirmed = await confirm(sent, 10);
await admin("POST", { resource: "shop-orders", id: sent.id, action: "mark-paid" }, {});
// Declined.
const declined = await send(0, [["GHK-Cu", "50mg", 5]]);
await admin("POST", { resource: "shop-orders", id: declined.id, action: "decline" }, { message: "Sorry, we only have 3 left - happy to send those instead?" });
// Cancelled by the customer before it was confirmed.
const cancelled = await send(1, [["TB-500", "5mg", 1]]);
await shop(1, "POST", { resource: "orders", id: cancelled.id, action: "cancel" });

// Mark the "sent" one as posted, with tracking.
const allSales: any[] = await admin("GET", { resource: "sales" });
const sentSaleId = sentConfirmed?.saleId ?? (await sql`select sale_id from shop_orders where id = ${sent.id}`)[0]?.sale_id;
const sentSale = allSales.find((s) => s.id === sentSaleId);
if (sentSale) {
  await admin("PATCH", { resource: "sales", id: sentSale.id }, {
    data: {
      ...sentSale.data,
      shipping: { status: "sent", courier: country.couriers[0], tracking: "DEMO123456789", sentDate: daysAgo(0) },
    },
  });
}
console.log("  8 shop orders: 2 waiting (1 pre-order), awaiting payment, payment sent, paid, paid + sent, declined, cancelled");

// ---- Orders entered by hand (not through the shop) ----
const sale = (data: Record<string, unknown>) => admin("POST", { resource: "sales" }, { data });
const line = (name: string, variant: string, qty: number, i: number) => {
  const p = products.find((x) => x.name === name && x.variant === variant)!;
  return { id: `m${i}`, itemId: ids[key(p)], kind: p.kind, name: p.name, variant: p.variant, unit: p.unit, qty, unitPriceNzd: p.price };
};
const base = {
  customerContact: "",
  orderNumber: "",
  discountNzd: 0,
  shippingCostNzd: 0,
  paymentFeesNzd: 0,
  notes: "",
};
// Completed last month: paid and delivered.
const done = await sale({
  ...base,
  customerName: names[6],
  orderDate: daysAgo(35),
  lines: [line("BPC-157", "10mg", 2, 1), line("Bacteriostatic Water", "10ml", 2, 2)],
  shippingChargedNzd: 10,
  payment: { method: "Bank transfer", amountPaidNzd: 2 * 70 + 2 * 12 + 10, paidDate: daysAgo(34) },
  shipping: { status: "delivered", courier: country.couriers[0], tracking: "DEMO555", sentDate: daysAgo(33) },
});
await admin("POST", { resource: "sales", id: done.id, action: "complete" }, { completedDate: daysAgo(33) });
// Open, part paid, not sent yet.
await sale({
  ...base,
  customerName: names[6],
  orderDate: daysAgo(2),
  lines: [line("TB-500", "5mg", 2, 1)],
  shippingChargedNzd: 10,
  payment: { method: "Bank transfer", amountPaidNzd: 50, paidDate: daysAgo(1) },
  shipping: { status: "not-sent", courier: "", tracking: "", sentDate: null },
  notes: "Paying the rest on Friday.",
});
// Picked up in person and paid in cash, completed.
const collected = await sale({
  ...base,
  customerName: "Jessica (walk-in)",
  orderDate: daysAgo(6),
  lines: [line("Ipamorelin", "5mg", 1, 1), line("Insulin Syringes", "Pack of 10", 1, 2)],
  shippingChargedNzd: 0,
  payment: { method: "Cash", amountPaidNzd: 48, paidDate: daysAgo(6) },
  shipping: { status: "collected", courier: "Pickup", tracking: "", sentDate: daysAgo(6) },
});
await admin("POST", { resource: "sales", id: collected.id, action: "complete" }, { completedDate: daysAgo(6) });
console.log("  3 orders entered by hand: completed + delivered, part paid, collected");

// ---- A couple of expenses ----
for (const [d, category, name, cost] of [
  [daysAgo(20), "Packaging", "Padded mailers (50)", 24.5],
  [daysAgo(9), "Postage & courier", "Postage labels", 18],
] as const) {
  await admin("POST", { resource: "expenses" }, {
    expenseDate: d,
    category,
    detail: { items: [{ id: "x", name, qty: 1, unitCostNzd: cost }], shippingNzd: 0, taxNzd: 0, discountNzd: 0 },
  });
}
console.log("  2 expenses");
console.log(`Done - open ${business.name} on localhost to look around.`);
await sql.end();
process.exit(0);
