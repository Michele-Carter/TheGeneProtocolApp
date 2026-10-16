import "./env.js";
import { createClerkClient } from "@clerk/backend";
import { del, list } from "@vercel/blob";
import { eq, sql } from "drizzle-orm";
import { syncFromStripe } from "./billing.js";
import { getDb } from "./db.js";
import { businesses } from "./schema.js";
import { accessState, deletionDate } from "../../shared/billing.js";

// Deletes businesses 30 days after their subscription ended (and sign-ups that never started one), as the
// Privacy Policy and Terms promise: every row the business owns, its uploaded images and files, and the logins
// of its owner and customers that no other business uses. Stripe's customer and invoices are kept - the policy
// says payment records may be kept for as long as the law requires. Run daily by api/cleanup.ts, or by hand
// with scripts/cleanup.ts. Runs as the database login, which sees every business.

type Business = typeof businesses.$inferSelect;

// At most this many businesses are deleted in one run, so a mistake can't wipe out many at once.
const MAX_PER_RUN = 5;

export interface CleanupResult {
    checked: number;
    due: Array<{ slug: string; name: string; deleteOn: string }>;
    deleted: string[];
    // Businesses that couldn't be checked or deleted (they're tried again on the next run).
    failed: Array<{ slug: string; error: string }>;
    // Logins that should have been deleted but Clerk refused - delete them in Clerk by hand.
    loginsLeft: string[];
}

export async function runCleanup({ dryRun, now = new Date() }: { dryRun: boolean; now?: Date }): Promise<CleanupResult> {
    const result: CleanupResult = { checked: 0, due: [], deleted: [], failed: [], loginsLeft: [] };
    const due: Business[] = [];
    for (let business of await getDb().select().from(businesses)) {
        if (business.billingExempt || business.status !== "active") continue;
        result.checked++;
        try {
            // Stripe has the final say, in case a webhook was missed (e.g. they restarted their subscription).
            if (accessState(business) !== "ok" && business.stripeCustomerId) {
                business = (await syncFromStripe(business.stripeCustomerId)) ?? business;
            }
        } catch (error) {
            result.failed.push({ slug: business.slug, error: `Checking with Stripe failed: ${(error as Error).message}` });
            continue;
        }
        const when = deletionDate(business);
        if (when && when <= now) {
            result.due.push({ slug: business.slug, name: business.name, deleteOn: when.toISOString() });
            due.push(business);
        }
    }
    if (dryRun) return result;

    for (const business of due.slice(0, MAX_PER_RUN)) {
        try {
            result.loginsLeft.push(...(await deleteBusiness(business.id, now)));
            result.deleted.push(business.slug);
            console.log(`Deleted business ${business.slug} (${business.id}), ended 30+ days ago`);
        } catch (error) {
            console.error(`Deleting business ${business.slug} failed:`, error);
            result.failed.push({ slug: business.slug, error: (error as Error).message });
        }
    }
    return result;
}

// Tables with a business_id column, and which of them also have a clerk_user_id (a login).
async function businessTables(): Promise<{ all: string[]; withLogins: string[] }> {
    const rows = await getDb().execute<{ table_name: string; column_name: string }>(sql`
        select table_name, column_name from information_schema.columns
        where table_schema = 'public' and column_name in ('business_id', 'clerk_user_id')`);
    const has = (column: string) => new Set(rows.filter((r) => r.column_name === column).map((r) => r.table_name));
    const all = [...has("business_id")];
    const logins = has("clerk_user_id");
    return { all, withLogins: all.filter((t) => logins.has(t)) };
}

function checkDue(business: Business | undefined, now: Date) {
    if (!business) throw new Error("Business not found");
    const when = deletionDate(business);
    if (!when || when > now) throw new Error("Business isn't due for deletion - not deleted");
}

// Deletes one business that's due (checked again here, and inside the transaction). Returns the logins Clerk
// wouldn't delete. Files go first: if that fails nothing else has changed, and the next run tries again.
export async function deleteBusiness(businessId: string, now = new Date()): Promise<string[]> {
    const db = getDb();
    checkDue((await db.select().from(businesses).where(eq(businesses.id, businessId)))[0], now);
    const { all, withLogins } = await businessTables();

    const logins = new Set<string>();
    for (const table of withLogins) {
        const rows = await db.execute<{ clerk_user_id: string }>(
            sql`select distinct clerk_user_id from ${sql.identifier(table)} where business_id = ${businessId} and clerk_user_id is not null`
        );
        for (const row of rows) logins.add(row.clerk_user_id);
    }

    await deleteFiles(businessId);

    await db.transaction(async (tx) => {
        checkDue((await tx.select().from(businesses).where(eq(businesses.id, businessId)).for("update"))[0], now);
        for (const table of all) {
            if (table === "signup_invites") {
                // The invite stays used; it just no longer points at the business.
                await tx.execute(sql`update signup_invites set business_id = null where business_id = ${businessId}`);
            } else {
                await tx.execute(sql`delete from ${sql.identifier(table)} where business_id = ${businessId}`);
            }
        }
        await tx.delete(businesses).where(eq(businesses.id, businessId));
    });

    return deleteUnusedLogins([...logins], withLogins);
}

// Its logo (logos/<id>/), shop images and certificates of analysis (shop/<id>/).
async function deleteFiles(businessId: string) {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is missing");
    for (const prefix of [`logos/${businessId}/`, `shop/${businessId}/`]) {
        let cursor: string | undefined;
        do {
            const page = await list({ prefix, cursor, token });
            if (page.blobs.length) await del(page.blobs.map((b) => b.url), { token });
            cursor = page.hasMore ? page.cursor : undefined;
        } while (cursor);
    }
}

// Deletes the Clerk logins that were only used with the deleted business. A login that runs, or is a customer
// of, another business is kept. Returns the ones Clerk wouldn't delete.
async function deleteUnusedLogins(userIds: string[], loginTables: string[]): Promise<string[]> {
    const db = getDb();
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const left: string[] = [];
    for (const userId of userIds) {
        let stillUsed = false;
        for (const table of loginTables) {
            const rows = await db.execute(sql`select 1 from ${sql.identifier(table)} where clerk_user_id = ${userId} limit 1`);
            if (rows.length) {
                stillUsed = true;
                break;
            }
        }
        if (stillUsed) continue;
        try {
            await clerk.users.deleteUser(userId);
        } catch (error) {
            if ((error as { status?: number }).status === 404) continue; // already gone
            console.error(`Deleting login ${userId} failed:`, error);
            left.push(userId);
        }
    }
    return left;
}
