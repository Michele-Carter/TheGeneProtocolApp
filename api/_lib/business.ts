import "./env.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { asc, eq, sql } from "drizzle-orm";
import { customerForUser } from "./customers.js";
import { getDb } from "./db.js";
import { sendJson } from "./http.js";
import { businesses, businessMembers, customers, expenses, inventoryLots, purchaseOrders, sales, shopOrders } from "./schema.js";
import { accessState } from "../../shared/billing.js";
import { countryInfo } from "../../shared/countries.js";

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

// The business the app asked for (its shop link slug), if any.
function requestedSlug(req: any): string | null {
    const value = req.headers?.["x-business"];
    return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

// The business a login runs, if any.
export async function ownedBusiness(userId: string): Promise<Business | null> {
    const [own] = await getDb()
        .select({ business: businesses })
        .from(businessMembers)
        .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
        .where(eq(businessMembers.clerkUserId, userId))
        .orderBy(asc(businessMembers.createdAt))
        .limit(1);
    return own?.business ?? null;
}

// Which business a signed-in user's request is for. Runs before any business is selected, so it reads
// across businesses - it only ever returns the one business the caller runs, or is (or asks to become) a
// customer of. An owner always uses their own business. Anyone else joins a business through its shop link
// (the app sends its slug); after that the app finds it from their customer record.
export async function resolveBusiness(req: any, userId: string): Promise<BusinessAccess | null> {
    const db = getDb();
    const slug = requestedSlug(req);

    const own = await ownedBusiness(userId);
    if (own) return { business: own, role: "owner" };

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
    return joined ? { business: joined.business, role: "customer" } : null;
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

// The request being served, so code deep inside it (e.g. notify()) can queue work for after it's saved.
const current = new AsyncLocalStorage<{ business: Business; tasks: Array<() => Promise<void>> }>();

// Runs task once the current request's changes are saved (dropped if they're rolled back). Outside a request
// (scripts) it does nothing.
export function afterSave(task: () => Promise<void>) {
    current.getStore()?.tasks.push(task);
}

// The business the current request is for, if any.
export const currentBusiness = () => current.getStore()?.business ?? null;

// Whether a business has recorded any money yet - stock, supplier orders, sales, expenses or shop orders. From
// then on its currency (and so its country) is fixed, so its history stays in one currency. db: as the business.
export async function hasMoneyRecords(db: Db): Promise<boolean> {
    for (const table of [inventoryLots, purchaseOrders, sales, expenses, shopOrders]) {
        const [row] = await db.select({ id: table.id }).from(table).limit(1);
        if (row) return true;
    }
    return false;
}

// The current business's country name: the country on its customers' addresses unless they say otherwise.
export const businessCountryName = () => countryInfo(currentBusiness()?.country).name;

export interface BusinessRequest {
    db: Db;
    userId: string;
    access: BusinessAccess;
    res: HeldResponse;
    // Work to do once the request's changes are saved (e.g. telling the owner about a new order). Runs before
    // the response goes out, because Vercel may stop the function once it has answered.
    afterSave: (task: () => Promise<void>) => void;
}

// Serves a signed-in user's request as their business. ownersOnly turns away customers. A business whose
// subscription isn't running only gets requests marked evenWithoutAccess (so the app can show what to do).
// A customer becomes a customer of the business on their first request. Anything that fails with a 5xx is
// rolled back.
export async function serveAsBusiness(
    req: any,
    res: any,
    userId: string,
    options: { ownersOnly: boolean; evenWithoutAccess?: boolean },
    fn: (request: BusinessRequest) => Promise<unknown>
) {
    const access = await resolveBusiness(req, userId);
    if (!access) {
        return requestedSlug(req)
            ? sendJson(res, 404, { error: "We couldn't find that shop. Please check the link.", code: "shop-not-found" })
            : sendJson(res, 404, { error: "Open your shop's link to get started.", code: "no-business" });
    }
    if (options.ownersOnly && access.role !== "owner") return sendJson(res, 403, { error: "Forbidden" });
    const state = accessState(access.business);
    if (state !== "ok" && !options.evenWithoutAccess) {
        return access.role === "owner"
            ? sendJson(res, 402, { error: "Your PepBiz subscription isn't active.", code: "subscription-required" })
            : sendJson(res, 402, { error: `${access.business.name} is unavailable right now.`, code: "shop-unavailable" });
    }

    const held = new HeldResponse();
    const tasks: Array<() => Promise<void>> = [];
    try {
        await runAsBusiness(access.business.id, async (db) => {
            if (access.role === "customer") await customerForUser(db, userId);
            await current.run({ business: access.business, tasks }, () =>
                fn({ db, userId, access, res: held, afterSave: (task) => tasks.push(task) })
            );
            if (held.statusCode >= 500) throw new RollBack();
        });
    } catch (error) {
        if (!(error instanceof RollBack)) {
            console.error(`Request for business ${access.business.id} failed:`, error);
            return sendJson(res, 500, { error: "Something went wrong - please try again." });
        }
        tasks.length = 0; // rolled back: nothing was saved
    }
    await Promise.allSettled(tasks.map((task) => task()));
    held.sendTo(res);
}
