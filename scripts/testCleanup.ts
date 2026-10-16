// Checks the deletion of ended businesses (api/_lib/cleanup.ts) on the dev database: sets up throwaway
// businesses - one ended 31 days ago, one ended 29 days ago, an abandoned sign-up and an exempt one - each with a
// row in every table, uploaded files and real test logins, runs the cleanup, checks only the due ones went
// (and only logins nobody else uses), then removes whatever is left. Dev database and dev Clerk only.
// Usage: npx tsx scripts/testCleanup.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import postgres from "postgres";
import { createClerkClient } from "@clerk/backend";
import { list, put } from "@vercel/blob";

if (!process.env.DATABASE_URL?.includes("ep-ancient-flower")) throw new Error("Only for the dev database - stopping");
if (!process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Only for the dev Clerk instance - stopping");

const { runCleanup } = await import("../api/_lib/cleanup");

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1, onnotice: () => {} });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const token = process.env.BLOB_READ_WRITE_TOKEN!;
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

const BUSINESSES = {
    due: { id: "cleanup-test-due", ended: ago(31), status: "canceled", exempt: false, created: ago(90) },
    recent: { id: "cleanup-test-recent", ended: ago(29), status: "canceled", exempt: false, created: ago(90) },
    abandoned: { id: "cleanup-test-abandoned", ended: null, status: null, exempt: false, created: ago(31) },
    exempt: { id: "cleanup-test-exempt", ended: ago(60), status: "canceled", exempt: true, created: ago(90) },
};
const IDS = Object.values(BUSINESSES).map((b) => b.id);
const INVITE = "cleanup-test-invite";

let failures = 0;
function check(label: string, ok: boolean) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
}

async function makeLogin(name: string): Promise<string> {
    const user = await clerk.users.createUser({
        emailAddress: [`${name}+clerk_test@example.com`],
        firstName: "Cleanup",
        lastName: name,
        skipPasswordRequirement: true,
    });
    return user.id;
}
async function loginExists(id: string) {
    try {
        await clerk.users.getUser(id);
        return true;
    } catch {
        return false;
    }
}

// Every table that has a business_id (so a new table is checked automatically).
const tables = (
    await sql<{ table_name: string }[]>`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'business_id'`
).map((r) => r.table_name);

async function rowsFor(id: string): Promise<number> {
    let n = 0;
    for (const t of tables) n += Number((await sql`select count(*)::int as n from ${sql(t)} where business_id = ${id}`)[0].n);
    return n;
}
async function filesFor(id: string): Promise<number> {
    let n = 0;
    for (const prefix of [`logos/${id}/`, `shop/${id}/`]) n += (await list({ prefix, token })).blobs.length;
    return n;
}

async function removeEverything(logins: string[]) {
    await sql`update signup_invites set business_id = null where business_id in ${sql(IDS)}`;
    await sql`delete from signup_invites where code = ${INVITE}`;
    for (const t of tables) if (t !== "signup_invites") await sql`delete from ${sql(t)} where business_id in ${sql(IDS)}`;
    await sql`delete from businesses where id in ${sql(IDS)}`;
    for (const login of logins) await clerk.users.deleteUser(login).catch(() => undefined);
}

const logins: string[] = [];
try {
    await removeEverything([]); // a previous run that stopped half-way

    const dueOwner = await makeLogin("due-owner");
    const dueCustomer = await makeLogin("due-customer");
    const sharedCustomer = await makeLogin("shared-customer"); // a customer of both "due" and "recent"
    const recentOwner = await makeLogin("recent-owner");
    const abandonedOwner = await makeLogin("abandoned-owner");
    logins.push(dueOwner, dueCustomer, sharedCustomer, recentOwner, abandonedOwner);

    for (const [key, b] of Object.entries(BUSINESSES)) {
        await sql`insert into businesses (id, slug, name, billing_exempt, subscription_status, subscription_ended_at, created_at)
                  values (${b.id}, ${b.id}, ${"Cleanup test " + key}, ${b.exempt}, ${b.status}, ${b.ended}, ${b.created})`;
    }

    // A row in every business table for "due" and "recent", so a missed table shows up.
    const fill = async (id: string, owner: string, customerLogins: string[]) => {
        await sql`insert into business_members (business_id, clerk_user_id) values (${id}, ${owner})`;
        for (const [i, login] of customerLogins.entries()) {
            await sql`insert into customers (id, business_id, clerk_user_id, name) values (${`${id}-c${i}`}, ${id}, ${login}, 'Test customer')`;
        }
        await sql`insert into customers (id, business_id, name) values (${`${id}-offline`}, ${id}, 'No login')`;
        await sql`insert into user_state_documents (id, business_id, clerk_user_id, scope, data) values (${`${id}-u`}, ${id}, ${owner}, 'protocol', '{}')`;
        await sql`insert into protocols (id, business_id, clerk_user_id, name, data) values (${`${id}-p`}, ${id}, ${owner}, 'P', '{}')`;
        await sql`insert into inv_items (id, business_id, kind, name) values ('cat:TEST', ${id}, 'peptide', 'Test')`;
        await sql`insert into purchase_orders (id, business_id, supplier, order_date, data) values (${`${id}-po`}, ${id}, 'S', '2026-01-01', '{}')`;
        await sql`insert into inventory_lots (id, business_id, item_id, received_at, qty_received, qty_remaining, unit_cost_nzd)
                  values (${`${id}-lot`}, ${id}, 'cat:TEST', now(), 1, 1, 1)`;
        await sql`insert into stock_movements (id, business_id, item_id, type, qty, unit_cost_nzd) values (${`${id}-sm`}, ${id}, 'cat:TEST', 'receive', 1, 1)`;
        await sql`insert into sales (id, business_id, customer_name, order_date, data) values (${`${id}-s`}, ${id}, 'C', '2026-01-01', '{}')`;
        await sql`insert into shop_orders (id, business_id, order_number, customer_id, lines, subtotal_nzd, shipping_address)
                  values (${`${id}-so`}, ${id}, 1001, ${`${id}-c0`}, '[]', 0, '{}')`;
        await sql`insert into app_settings (key, business_id, value) values ('test', ${id}, '{}')`;
        await sql`insert into notifications (id, business_id, customer_id, kind, title) values (${`${id}-n`}, ${id}, ${`${id}-c0`}, 'test', 'T')`;
        await sql`insert into push_subscriptions (id, business_id, clerk_user_id, endpoint, p256dh, auth)
                  values (${`${id}-push`}, ${id}, ${owner}, 'https://example.com', 'k', 'a')`;
        await sql`insert into bundles (id, business_id, name, components) values (${`${id}-b`}, ${id}, 'B', '[]')`;
        await sql`insert into expenses (id, business_id, expense_date, description, category, amount_nzd)
                  values (${`${id}-e`}, ${id}, '2026-01-01', 'E', 'other', 1)`;
        await sql`insert into peptide_library (business_id, kind, key, data) values (${id}, 'test', 'k', '{}')`;
        await sql`insert into supplier_catalog (business_id, id, name) values (${id}, 'sup', 'Sup')`;
        await put(`shop/${id}/test/${crypto.randomUUID()}.txt`, "test", { access: "public", token });
        await put(`logos/${id}/${crypto.randomUUID()}.txt`, "test", { access: "public", token });
    };
    await fill(BUSINESSES.due.id, dueOwner, [dueCustomer, sharedCustomer]);
    await fill(BUSINESSES.recent.id, recentOwner, [sharedCustomer]);
    await sql`insert into business_members (business_id, clerk_user_id) values (${BUSINESSES.abandoned.id}, ${abandonedOwner})`;
    await sql`insert into signup_invites (code, business_id, used_at) values (${INVITE}, ${BUSINESSES.due.id}, now())`;

    const dueRowsBefore = await rowsFor(BUSINESSES.due.id);
    check(`"due" business has a row in every table (${dueRowsBefore} of ${tables.length})`, dueRowsBefore >= tables.length);

    // Dry run: lists exactly the two due, deletes nothing.
    const dry = await runCleanup({ dryRun: true });
    const dueSlugs = dry.due.map((d) => d.slug).sort();
    check(`dry run lists only the due ones (${dueSlugs.join(", ")})`, dueSlugs.join() === [BUSINESSES.abandoned.id, BUSINESSES.due.id].sort().join());
    check("dry run deleted nothing", (await rowsFor(BUSINESSES.due.id)) === dueRowsBefore && (await filesFor(BUSINESSES.due.id)) === 2);
    if (dueSlugs.some((s) => !IDS.includes(s))) throw new Error("A real dev business is due - stopping before deleting anything");

    const result = await runCleanup({ dryRun: false });
    console.log(JSON.stringify(result));
    check("reported deleted: due + abandoned", [...result.deleted].sort().join() === [BUSINESSES.abandoned.id, BUSINESSES.due.id].sort().join());
    check("nothing failed", result.failed.length === 0 && result.loginsLeft.length === 0);

    for (const key of ["due", "abandoned"] as const) {
        const id = BUSINESSES[key].id;
        check(`${key}: business gone`, (await sql`select 1 from businesses where id = ${id}`).length === 0);
        check(`${key}: no rows left in any table`, (await rowsFor(id)) === 0);
    }
    check("due: files deleted", (await filesFor(BUSINESSES.due.id)) === 0);
    check("invite kept, no longer points at the business", (await sql`select business_id from signup_invites where code = ${INVITE}`)[0]?.business_id === null);

    check("recent (29 days): kept with all its rows", (await rowsFor(BUSINESSES.recent.id)) === dueRowsBefore - 2); // one customer fewer, no invite
    check("recent: files kept", (await filesFor(BUSINESSES.recent.id)) === 2);
    check("exempt: kept", (await sql`select 1 from businesses where id = ${BUSINESSES.exempt.id}`).length === 1);
    check("The Gene Protocol: kept", (await sql`select 1 from businesses where id = 'tgp'`).length === 1);

    check("due owner's login deleted", !(await loginExists(dueOwner)));
    check("due-only customer's login deleted", !(await loginExists(dueCustomer)));
    check("abandoned owner's login deleted", !(await loginExists(abandonedOwner)));
    check("customer of another business: login kept", await loginExists(sharedCustomer));
    check("recent owner's login kept", await loginExists(recentOwner));
} finally {
    await removeEverything(logins);
    for (const id of IDS) {
        for (const prefix of [`logos/${id}/`, `shop/${id}/`]) {
            const { blobs } = await list({ prefix, token });
            if (blobs.length) await (await import("@vercel/blob")).del(blobs.map((b) => b.url), { token });
        }
    }
    await sql.end();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
