import "./env.js";
import { asc, eq, sql } from "drizzle-orm";
import { customerForUser } from "./customers.js";
import { getDb } from "./db.js";
import { sendJson } from "./http.js";
import { businesses, businessMembers, customers } from "./schema.js";

// Every business's data is kept apart by the database (scripts/multi-business-2.sql). Each API request:
//   1. works out which business it's for and whether the caller owns it or is a customer (resolveBusiness),
//   2. runs in one transaction as that business (runAsBusiness), where the database only shows, changes and
//      adds rows belonging to it - so a query that forgets to filter still can't reach another business.

type RootDb = ReturnType<typeof getDb>;
// A database handle that only sees one business's rows.
export type Db = Parameters<Parameters<RootDb["transaction"]>[0]>[0];

export type Business = typeof businesses.$inferSelect;
export interface BusinessAccess {
    business: Business;
    role: "owner" | "customer";
}

// Where someone who isn't an owner and hasn't joined any business yet goes.
// TEMPORARY: stage 4 replaces this with joining through a business's own shop link.
const FALLBACK_BUSINESS_ID = "tgp";

// The business the app asked for (its shop link slug), if any.
function requestedSlug(req: any): string | null {
    const value = req.headers?.["x-business"];
    return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

// Which business a signed-in user's request is for. Runs before any business is selected, so it reads
// across businesses - it only ever returns the one business the caller belongs to (or asked to join).
export async function resolveBusiness(req: any, userId: string): Promise<BusinessAccess | null> {
    const db = getDb();
    const slug = requestedSlug(req);

    const owned = await db
        .select({ business: businesses })
        .from(businessMembers)
        .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
        .where(eq(businessMembers.clerkUserId, userId))
        .orderBy(asc(businessMembers.createdAt));
    const own = slug ? owned.find((r) => r.business.slug === slug) : owned[0];
    if (own) return { business: own.business, role: "owner" };

    if (slug) {
        const [business] = await db.select().from(businesses).where(eq(businesses.slug, slug));
        return business ? { business, role: "customer" } : null;
    }

    const [joined] = await db
        .select({ business: businesses })
        .from(customers)
        .innerJoin(businesses, eq(businesses.id, customers.businessId))
        .where(eq(customers.clerkUserId, userId))
        .orderBy(asc(customers.createdAt))
        .limit(1);
    if (joined) return { business: joined.business, role: "customer" };

    const [fallback] = await db.select().from(businesses).where(eq(businesses.id, FALLBACK_BUSINESS_ID));
    return fallback ? { business: fallback, role: "customer" } : null;
}

// Runs fn in one transaction that can only see and change this business's rows.
export async function runAsBusiness<T>(businessId: string, fn: (db: Db) => Promise<T>): Promise<T> {
    return getDb().transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.business_id', ${businessId}, true)`);
        await tx.execute(sql`set local role peppal_app`);
        return fn(tx);
    });
}

// Collects what a handler sends, so the response only goes out once its transaction has been saved.
class HeldResponse {
    statusCode = 200;
    body: unknown = undefined;
    headers: Record<string, string> = {};
    status(code: number) {
        this.statusCode = code;
        return this;
    }
    json(body: unknown) {
        this.body = body;
        return this;
    }
    setHeader(name: string, value: string) {
        this.headers[name] = value;
    }
    sendTo(res: any) {
        for (const [name, value] of Object.entries(this.headers)) res.setHeader(name, value);
        sendJson(res, this.statusCode, this.body ?? null);
    }
}

class RollBack extends Error {}

export interface BusinessRequest {
    db: Db;
    userId: string;
    access: BusinessAccess;
    res: HeldResponse;
}

// Serves a signed-in user's request as their business. ownersOnly turns away customers. A customer becomes
// a customer of the business on their first request. Anything that fails with a 5xx is rolled back.
export async function serveAsBusiness(
    req: any,
    res: any,
    userId: string,
    options: { ownersOnly: boolean },
    fn: (request: BusinessRequest) => Promise<unknown>
) {
    const access = await resolveBusiness(req, userId);
    if (!access) return sendJson(res, 404, { error: "Shop not found" });
    if (options.ownersOnly && access.role !== "owner") return sendJson(res, 403, { error: "Forbidden" });

    const held = new HeldResponse();
    try {
        await runAsBusiness(access.business.id, async (db) => {
            if (access.role === "customer") await customerForUser(db, userId);
            await fn({ db, userId, access, res: held });
            if (held.statusCode >= 500) throw new RollBack();
        });
    } catch (error) {
        if (!(error instanceof RollBack)) {
            console.error(`Request for business ${access.business.id} failed:`, error);
            return sendJson(res, 500, { error: "Something went wrong - please try again." });
        }
    }
    held.sendTo(res);
}
