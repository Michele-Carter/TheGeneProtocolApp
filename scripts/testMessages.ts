// Checks messages between a shop and its customers: either side can start, unread counts and "seen" work,
// archiving and un-archiving work, the right person is notified, and nothing leaks - a customer only sees their
// own conversation and can only attach their own orders, and another business can't read it. Sets up two
// throwaway businesses, runs real API requests, records notifications instead of sending them, then deletes
// everything it made. Dev database only.
// Usage: npx tsx scripts/testMessages.ts
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

const SLUG = "messages-test";
const OTHER_SLUG = "messages-test-other";
const OWNER = "user_messages_test_owner";
const OTHER_OWNER = "user_messages_test_other_owner";
const ALICE = "user_messages_test_alice";
const BOB = "user_messages_test_bob";
const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1, onnotice: () => {} });

const pushed: { endpoint: string; title: string; body: string }[] = [];
(webpush as any).setVapidDetails = () => {};
(webpush as any).sendNotification = async (sub: { endpoint: string }, payload: string) => {
    const { title, body } = JSON.parse(payload);
    pushed.push({ endpoint: sub.endpoint, title, body });
    return { statusCode: 201 };
};
const take = () => pushed.splice(0);

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`);
    if (!ok) failures++;
}

async function call(handler: any, userId: string, slug: string, method: string, query: Record<string, string>, body?: unknown) {
    const out = { status: 200, body: undefined as any };
    const res = {
        status(code: number) { out.status = code; return res; },
        json(data: unknown) { out.body = data; return res; },
        setHeader() {},
    };
    await handler({ method, query, body, headers: { "x-business": slug } }, res, userId);
    return out;
}
const ok = (r: { status: number; body: any }) => {
    if (r.status >= 300) throw new Error(`${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
};
const owner = (method: string, query: Record<string, string>, body?: unknown) => call(handleAdminRequest, OWNER, SLUG, method, query, body);
const shop = (who: string, method: string, query: Record<string, string>, body?: unknown) => call(handleShopRequest, who, SLUG, method, query, body);

async function removeEverything() {
    const tables = (await sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'business_id'`).map((r) => r.table_name);
    for (const slug of [SLUG, OTHER_SLUG]) {
        const [b] = await sql`select id from businesses where slug = ${slug}`;
        if (!b) continue;
        for (const t of tables) await sql`delete from ${sql(t)} where business_id = ${b.id}`;
        await sql`delete from businesses where id = ${b.id}`;
    }
}

try {
    await removeEverything();
    for (const [who, slug, name] of [[OWNER, SLUG, "Messages Test"], [OTHER_OWNER, OTHER_SLUG, "Other Shop"]]) {
        ok(await call(handleBusinessRequest, who, slug, "POST", { action: "create" }, { ownerName: "Test Owner", name, slug, country: "NZ" }));
    }
    await sql`update businesses set billing_exempt = true where slug in ${sql([SLUG, OTHER_SLUG])}`;
    const [business] = await sql`select id from businesses where slug = ${SLUG}`;
    for (const [login, name] of [[ALICE, "Alice Customer"], [BOB, "Bob Customer"]]) {
        await sql`insert into customers (id, business_id, clerk_user_id, name, email, shipping_address)
                  values (gen_random_uuid()::text, ${business.id}, ${login}, ${name}, ${login + "@example.com"}, ${sql.json({})})`;
    }
    const [alice] = await sql`select id from customers where clerk_user_id = ${ALICE}`;
    const [bob] = await sql`select id from customers where clerk_user_id = ${BOB}`;
    // An order of Alice's and one of Bob's to attach messages to.
    const order = async (customerId: string, n: number) =>
        (await sql`insert into shop_orders (id, business_id, order_number, customer_id, lines, subtotal_nzd, shipping_address)
                   values (gen_random_uuid()::text, ${business.id}, ${n}, ${customerId}, '[]', 0, '{}') returning id`)[0].id as string;
    const aliceOrder = await order(alice.id, 1001);
    const bobOrder = await order(bob.id, 1002);
    // Both the owner and Alice have notifications on (different devices).
    ok(await owner("POST", { resource: "alerts", action: "subscribe" }, { subscription: { endpoint: "https://push.example.com/owner", keys: { p256dh: "k", auth: "a" } } }));
    ok(await shop(ALICE, "POST", { resource: "push", action: "subscribe" }, { subscription: { endpoint: "https://push.example.com/alice", keys: { p256dh: "k", auth: "a" } } }));
    take();

    // Alice messages the shop - not about any order.
    ok(await shop(ALICE, "POST", { resource: "messages" }, { body: "Hi! Do you ship to Wellington?" }));
    let alerts = take();
    check("customer's message notifies the owner", alerts.length === 1 && alerts[0].endpoint.endsWith("/owner") && alerts[0].title === "Message from Alice Customer", alerts);
    let inbox = ok(await owner("GET", { resource: "messages" }));
    check("owner sees 1 unread in 1 conversation", inbox.unread === 1 && inbox.conversations.length === 1 && inbox.conversations[0].unread === 1, inbox);

    // About her own order - fine; about Bob's - refused.
    const about = ok(await shop(ALICE, "POST", { resource: "messages" }, { body: "And where's this one?", shopOrderId: aliceOrder }));
    check("a message can be about the customer's own order", about.message.orderNumber === 1001, about);
    const stolen = await shop(ALICE, "POST", { resource: "messages" }, { body: "Sneaky", shopOrderId: bobOrder });
    check("...but not about someone else's order", stolen.status === 400, stolen);
    take();

    // Bob sees none of Alice's conversation.
    const bobView = ok(await shop(BOB, "GET", { resource: "messages" }));
    check("another customer can't see the conversation", bobView.messages.length === 0 && bobView.unread === 0, bobView);

    // The owner replies -> Alice is notified; Bob isn't.
    ok(await owner("POST", { resource: "messages" }, { customerId: alice.id, body: "Yes we do - usually 1-2 days." }));
    alerts = take();
    check("owner's reply notifies the customer", alerts.length === 1 && alerts[0].endpoint.endsWith("/alice") && alerts[0].title === "New message from Messages Test", alerts);
    check("customer has 1 unread", ok(await shop(ALICE, "GET", { resource: "messages", summary: "1" })).unread === 1);
    check("...and the other customer has none", ok(await shop(BOB, "GET", { resource: "messages", summary: "1" })).unread === 0);

    // Reading: Alice reads the reply (the owner sees "Seen"); the owner reads Alice's messages.
    ok(await shop(ALICE, "POST", { resource: "messages", action: "read" }, {}));
    const thread = ok(await owner("GET", { resource: "messages", customerId: alice.id }));
    check("owner sees the customer read the reply", thread.messages.at(-1).from === "owner" && thread.messages.at(-1).read === true, thread.messages.at(-1));
    ok(await owner("POST", { resource: "messages", action: "read" }, { customerId: alice.id }));
    check("owner's unread goes to 0 after reading", ok(await owner("GET", { resource: "messages", summary: "1" })).unread === 0);

    // The owner starts a conversation with Bob.
    ok(await owner("POST", { resource: "messages" }, { customerId: bob.id, body: "Your order is back in stock!" }));
    check("owner can start a conversation", ok(await shop(BOB, "GET", { resource: "messages" })).messages.length === 1);
    take();

    // Archive, then a new message brings it back.
    ok(await owner("POST", { resource: "messages", action: "archive" }, { customerId: alice.id, archived: true }));
    inbox = ok(await owner("GET", { resource: "messages" }));
    check("archived conversation is marked archived", inbox.conversations.find((c: any) => c.customerId === alice.id)?.archived === true, inbox);
    ok(await shop(ALICE, "POST", { resource: "messages" }, { body: "One more question..." }));
    inbox = ok(await owner("GET", { resource: "messages" }));
    check("a new message brings it back to the inbox", inbox.conversations.find((c: any) => c.customerId === alice.id)?.archived === false, inbox);

    // Bad messages.
    check("empty message refused", (await shop(ALICE, "POST", { resource: "messages" }, { body: "   " })).status === 400);
    check("too-long message refused", (await shop(ALICE, "POST", { resource: "messages" }, { body: "x".repeat(2001) })).status === 400);

    // Another business can't read it.
    const other = await call(handleAdminRequest, OTHER_OWNER, OTHER_SLUG, "GET", { resource: "messages", customerId: alice.id });
    check("another business can't open the conversation", other.status === 404, other);
    const otherInbox = ok(await call(handleAdminRequest, OTHER_OWNER, OTHER_SLUG, "GET", { resource: "messages" }));
    check("...or see it in its inbox", otherInbox.conversations.length === 0 && otherInbox.unread === 0, otherInbox);
    const otherSend = await call(handleAdminRequest, OTHER_OWNER, OTHER_SLUG, "POST", { resource: "messages" }, { customerId: alice.id, body: "Hi from another shop" });
    check("...or message its customers", otherSend.status === 400, otherSend);

    // One message to several customers: each gets their own private copy.
    await sql`insert into customers (id, business_id, name, email, shipping_address)
              values (gen_random_uuid()::text, ${business.id}, 'Carl No-Login', 'carl@example.com', ${sql.json({})})`;
    const [carl] = await sql`select id from customers where name = 'Carl No-Login' and business_id = ${business.id}`;
    ok(await owner("POST", { resource: "messages", action: "archive" }, { customerId: bob.id, archived: true }));
    take();
    const group = ok(await owner("POST", { resource: "messages", action: "group" }, { customerIds: [alice.id, bob.id, bob.id], body: "  Sale starts Friday!  " }));
    check("group message goes to each customer once", group.sent === 2, group);
    const aliceThread = ok(await shop(ALICE, "GET", { resource: "messages" })).messages;
    const bobThread = ok(await shop(BOB, "GET", { resource: "messages" })).messages;
    check("...into each one's own conversation", aliceThread.at(-1)?.body === "Sale starts Friday!" && bobThread.at(-1)?.body === "Sale starts Friday!" && bobThread.length === 2, { aliceThread, bobThread });
    alerts = take();
    check("...notifying customers with notifications on", alerts.length === 1 && alerts[0].endpoint.endsWith("/alice") && alerts[0].title === "New message from Messages Test", alerts);
    inbox = ok(await owner("GET", { resource: "messages" }));
    check("...and brings archived conversations back", inbox.conversations.find((c: any) => c.customerId === bob.id)?.archived === false, inbox);
    const noLogin = await owner("POST", { resource: "messages", action: "group" }, { customerIds: [alice.id, carl.id], body: "Hi" });
    check("group refused if someone can't log in to read it", noLogin.status === 400, noLogin);
    check("group refused with nobody chosen", (await owner("POST", { resource: "messages", action: "group" }, { customerIds: [], body: "Hi" })).status === 400);
    check("group refused when empty", (await owner("POST", { resource: "messages", action: "group" }, { customerIds: [alice.id], body: "  " })).status === 400);
    check("group refused over 200 customers",
        (await owner("POST", { resource: "messages", action: "group" }, { customerIds: Array.from({ length: 201 }, (_, i) => `c${i}`), body: "Hi" })).status === 400);
    const otherGroup = await call(handleAdminRequest, OTHER_OWNER, OTHER_SLUG, "POST", { resource: "messages", action: "group" }, { customerIds: [alice.id], body: "Hi" });
    check("another business can't group-message these customers", otherGroup.status === 400, otherGroup);
    check("nothing was sent by the refused group messages", ok(await shop(ALICE, "GET", { resource: "messages" })).messages.length === aliceThread.length);

    // Message all: everyone who's signed up (Alice and Bob, not Carl), and only this shop's customers.
    take();
    const everyone = ok(await owner("POST", { resource: "messages", action: "group" }, { all: true, body: "Closed Monday for the holiday." }));
    check("message all goes to every customer with a login", everyone.sent === 2, everyone);
    check("  ...each in their own conversation",
        ok(await shop(ALICE, "GET", { resource: "messages" })).messages.at(-1)?.body === "Closed Monday for the holiday." &&
        ok(await shop(BOB, "GET", { resource: "messages" })).messages.at(-1)?.body === "Closed Monday for the holiday.");
    const carlMessages = await sql`select count(*)::int as n from messages where customer_id = ${carl.id}`;
    check("  ...but not to customers without a login", carlMessages[0].n === 0, carlMessages);
    alerts = take();
    check("  ...notifying customers with notifications on", alerts.length === 1 && alerts[0].endpoint.endsWith("/alice"), alerts);
    const otherAll = await call(handleAdminRequest, OTHER_OWNER, OTHER_SLUG, "POST", { resource: "messages", action: "group" }, { all: true, body: "Hi" });
    check("another business's message all never reaches these customers", otherAll.status === 400 && ok(await shop(ALICE, "GET", { resource: "messages" })).messages.at(-1)?.body === "Closed Monday for the holiday.", otherAll);
} finally {
    await removeEverything();
    await sql.end();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
