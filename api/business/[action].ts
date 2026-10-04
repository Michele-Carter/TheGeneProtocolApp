import { eq, sql } from "drizzle-orm";
import { del, put } from "@vercel/blob";
import { createClerkClient } from "@clerk/backend";
import { z } from "zod";
import { requireAuthUserId } from "../_lib/auth.js";
import { ownedBusiness } from "../_lib/business.js";
import { appUrl, billingInfo, billingPortalUrl, changeRegion, checkoutUrl, completeCheckout, syncFromStripe } from "../_lib/billing.js";
import { getDb } from "../_lib/db.js";
import { parseJsonBody, sendJson } from "../_lib/http.js";
import { businesses, businessMembers } from "../_lib/schema.js";
import { accessState, slugProblem } from "../../shared/billing.js";
import { MAX_IMAGE_BYTES } from "../../shared/shop.js";

// Setting up and running a business on PepPal (the business's own data is in api/admin):
//   GET    /api/business/shop?slug=     a shop link's name and logo, for its sign-in page (no sign-in needed)
//   GET    /api/business/slug?slug=     is this shop link free?  { available, problem }
//   POST   /api/business/create         { name, slug, region }   sign up a new business (the caller becomes its owner)
//   POST   /api/business/checkout       Stripe page to save a card and start the subscription         { url }
//   POST   /api/business/portal         Stripe billing page: change card, invoices, cancel           { url }
//   POST   /api/business/sync           { sessionId? } after returning from Stripe: start the subscription with the
//                                        card just saved (if it's allowed), then re-read it   { billing, problem }
//   PATCH  /api/business/region         { region }  NZ or overseas price, while no subscription is running
//   PATCH  /api/business/details        { name }
//   POST   /api/business/logo           { dataUrl }      DELETE /api/business/logo
// Everything except shop, slug and create is for the business's owner, and works even when the subscription has
// stopped (that's how they restart it).

// New businesses start with a copy of this business's peptide library (not its price list or anything else).
const TEMPLATE_BUSINESS_ID = "tgp";

const createSchema = z.object({
    name: z.string().trim().min(2, "Enter your business name").max(80),
    slug: z.string().trim().toLowerCase(),
    region: z.enum(["NZ", "INTL"]),
});

const IMAGE_DATA_URL = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/;

class SlugTaken extends Error {}

async function slugTaken(slug: string) {
    const [row] = await getDb().select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug));
    return Boolean(row);
}

// The owner's email, kept as the business's billing contact (Stripe asks for it again at checkout anyway,
// so sign-up doesn't fail if it can't be looked up).
async function loginEmail(userId: string): Promise<string> {
    try {
        const user = await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }).users.getUser(userId);
        const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
        return (primary?.emailAddress ?? "").toLowerCase();
    } catch (error) {
        console.error("Looking up the owner's email failed:", error);
        return "";
    }
}

// The name and logo behind a shop link, for its sign-in page. Needs the exact link, so it can't be used to
// list or find other businesses.
async function publicShop(req: any, res: any) {
    const slug = String(req.query?.slug ?? "").trim().toLowerCase();
    const [row] = slug
        ? await getDb()
              .select({ name: businesses.name, slug: businesses.slug, logoUrl: businesses.logoUrl })
              .from(businesses)
              .where(eq(businesses.slug, slug))
        : [];
    if (!row) return sendJson(res, 404, { error: "We couldn't find that shop. Please check the link.", code: "shop-not-found" });
    return sendJson(res, 200, row);
}

export default async function handler(req: any, res: any) {
    if (req.query?.action === "shop" && req.method === "GET") return publicShop(req, res);
    const userId = await requireAuthUserId(req);
    if (!userId) return sendJson(res, 401, { error: "Unauthenticated" });
    try {
        return await handleBusinessRequest(req, res, userId);
    } catch (error) {
        console.error(`Business ${req.query?.action} request failed:`, error);
        return sendJson(res, 500, { error: "Something went wrong - please try again." });
    }
}

export async function handleBusinessRequest(req: any, res: any, userId: string) {
    const action = req.query?.action;
    const db = getDb();

    if (action === "shop" && req.method === "GET") return publicShop(req, res);

    if (action === "slug" && req.method === "GET") {
        const slug = String(req.query?.slug ?? "").trim().toLowerCase();
        const problem = slugProblem(slug) ?? ((await slugTaken(slug)) ? "That link is already taken - please choose another." : null);
        return sendJson(res, 200, { available: problem == null, problem });
    }

    if (action === "create" && req.method === "POST") {
        if (await ownedBusiness(userId)) return sendJson(res, 409, { error: "You already have a business on PepPal." });
        const parsed = createSchema.safeParse(await parseJsonBody(req));
        if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Please check your details" });
        const { name, slug, region } = parsed.data;
        const problem = slugProblem(slug);
        if (problem) return sendJson(res, 400, { error: problem });

        const id = crypto.randomUUID();
        const ownerEmail = await loginEmail(userId);
        try {
            await db.transaction(async (tx) => {
                const [created] = await tx
                    .insert(businesses)
                    .values({ id, slug, name, country: region, ownerEmail })
                    .onConflictDoNothing()
                    .returning();
                if (!created) throw new SlugTaken();
                await tx.insert(businessMembers).values({ businessId: id, clerkUserId: userId, role: "owner" });
                await tx.execute(sql`
                    insert into peptide_library (business_id, kind, key, sort, data)
                    select ${id}, kind, key, sort, data from peptide_library where business_id = ${TEMPLATE_BUSINESS_ID}`);
            });
        } catch (error) {
            if (error instanceof SlugTaken) return sendJson(res, 409, { error: "That link is already taken - please choose another." });
            throw error;
        }
        return sendJson(res, 201, { slug });
    }

    // ---- The caller's own business ----
    const business = await ownedBusiness(userId);
    if (!business) return sendJson(res, 403, { error: "Forbidden" });

    if (action === "checkout" && req.method === "POST") {
        if (accessState(business) === "ok" && business.subscriptionStatus) {
            return sendJson(res, 409, { error: "Your subscription is already running." });
        }
        return sendJson(res, 200, { url: await checkoutUrl(business, appUrl(req)) });
    }

    if (action === "portal" && req.method === "POST") {
        if (!business.stripeCustomerId) return sendJson(res, 409, { error: "You haven't started a subscription yet." });
        return sendJson(res, 200, { url: await billingPortalUrl(business, appUrl(req)) });
    }

    if (action === "sync" && req.method === "POST") {
        const body = (await parseJsonBody(req)) as { sessionId?: unknown };
        const sessionId = typeof body?.sessionId === "string" && body.sessionId.startsWith("cs_") ? body.sessionId : null;
        const { problem } = sessionId ? await completeCheckout(sessionId, business.id) : { problem: null };
        const synced = business.stripeCustomerId ? await syncFromStripe(business.stripeCustomerId) : null;
        return sendJson(res, 200, { billing: billingInfo(synced ?? business), problem });
    }

    if (action === "region" && req.method === "PATCH") {
        const parsed = z.object({ region: z.enum(["NZ", "INTL"]) }).safeParse(await parseJsonBody(req));
        if (!parsed.success) return sendJson(res, 400, { error: "Choose New Zealand or outside New Zealand" });
        if (accessState(business) === "ok" && business.subscriptionStatus) {
            return sendJson(res, 409, { error: "Your subscription is running - cancel it first to change where you pay from." });
        }
        await changeRegion(business, parsed.data.region);
        return sendJson(res, 200, { region: parsed.data.region });
    }

    if (action === "details" && req.method === "PATCH") {
        const parsed = z.object({ name: z.string().trim().min(2, "Enter your business name").max(80) }).safeParse(await parseJsonBody(req));
        if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Please check your details" });
        await db.update(businesses).set({ name: parsed.data.name, updatedAt: new Date() }).where(eq(businesses.id, business.id));
        return sendJson(res, 200, { name: parsed.data.name });
    }

    if (action === "logo" && (req.method === "POST" || req.method === "DELETE")) {
        const token = process.env.BLOB_READ_WRITE_TOKEN;
        let logoUrl: string | null = null;
        if (req.method === "POST") {
            if (!token) return sendJson(res, 503, { error: "Image storage isn't set up yet." });
            const parsed = z.object({ dataUrl: z.string() }).safeParse(await parseJsonBody(req));
            const match = parsed.success ? IMAGE_DATA_URL.exec(parsed.data.dataUrl) : null;
            if (!match) return sendJson(res, 400, { error: "Logos must be WebP, JPEG or PNG." });
            const bytes = Buffer.from(match[2], "base64");
            if (bytes.length > MAX_IMAGE_BYTES) return sendJson(res, 413, { error: "That image is too large." });
            const ext = match[1] === "jpeg" ? "jpg" : match[1];
            const blob = await put(`logos/${business.id}/${crypto.randomUUID()}.${ext}`, bytes, {
                access: "public",
                contentType: `image/${match[1]}`,
                token,
            });
            logoUrl = blob.url;
        }
        await db.update(businesses).set({ logoUrl, updatedAt: new Date() }).where(eq(businesses.id, business.id));
        if (business.logoUrl && token) {
            await del(business.logoUrl, { token }).catch((e) => console.error("Deleting old logo failed:", e));
        }
        return sendJson(res, 200, { logoUrl });
    }

    return sendJson(res, 404, { error: "Not found" });
}
