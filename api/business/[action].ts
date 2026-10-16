import { and, eq, isNull, sql } from "drizzle-orm";
import { del, put } from "@vercel/blob";
import { createClerkClient } from "@clerk/backend";
import { z } from "zod";
import { requireAuthUserId } from "../_lib/auth.js";
import { hasMoneyRecords, ownedBusiness, runAsBusiness } from "../_lib/business.js";
import { appUrl, billingInfo, billingPortalUrl, changeCountry, checkoutUrl, completeCheckout, resumeSubscription, syncFromStripe } from "../_lib/billing.js";
import { getDb } from "../_lib/db.js";
import { parseJsonBody, sendJson } from "../_lib/http.js";
import { businesses, businessMembers, signupInvites } from "../_lib/schema.js";
import { accessState, planFor, slugProblem } from "../../shared/billing.js";
import { MAX_IMAGE_BYTES } from "../../shared/shop.js";
import { businessCountrySettings, countryInfo, isKnownTimeZone } from "../../shared/countries.js";

// Setting up and running a business on PepBiz (the business's own data is in api/admin):
//   GET    /api/business/shop?slug=     a shop link's name and logo, for its sign-in page (no sign-in needed)
//   GET    /api/business/slug?slug=     is this shop link free? (no sign-in needed)  { available, problem }
//   GET    /api/business/invite?code=   does this invite link still work? (no sign-in needed)  { valid, trialDays }
//   POST   /api/business/create         { ownerName, name, slug, country, timeZone?, invite? }   register a business
//                                        (the caller owns it; an invite gives a longer free trial)  { slug, trialDays }
//   POST   /api/business/checkout       Stripe page to save a card and start the subscription         { url }
//   POST   /api/business/portal         { flow? } Stripe billing page: change card, invoices, cancel  { url }
//                                        (flow "cancel" opens straight on its cancel screen)
//   POST   /api/business/resume         undo a cancellation before the subscription ends             { billing }
//   POST   /api/business/sync           { sessionId? } after returning from Stripe: start the subscription with the
//                                        card just saved (if it's allowed), then re-read it   { billing, problem }
//   PATCH  /api/business/country        { country, timeZone? }  until the business records any money
//   PATCH  /api/business/details        { name?, timeZone?, contactEmail? }
//   POST   /api/business/logo           { dataUrl }      DELETE /api/business/logo
// Everything except shop, manifest, slug, invite and create is for the business's owner, and works even when the subscription has
// stopped (that's how they restart it).

// New businesses start with a copy of this business's peptide library (not its price list or anything else).
const TEMPLATE_BUSINESS_ID = "tgp";

const createSchema = z.object({
    ownerName: z.string().trim().min(2, "Enter your name").max(80),
    name: z.string().trim().min(2, "Enter your business name").max(80),
    slug: z.string().trim().toLowerCase(),
    country: z.string().trim().toUpperCase(),
    timeZone: z.string().trim().optional(),
    // An invite link's code: a longer free trial.
    invite: z.string().trim().toLowerCase().max(40).optional(),
});

const IMAGE_DATA_URL = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/;

class SlugTaken extends Error {}
class InviteUsed extends Error {}

// An invite code that hasn't been used yet, and the free trial it gives (trialDays).
async function unusedInvite(code: string): Promise<{ trialDays: number } | null> {
    const [row] = await getDb()
        .select({ trialDays: signupInvites.trialDays })
        .from(signupInvites)
        .where(and(eq(signupInvites.code, code.trim().toLowerCase()), isNull(signupInvites.usedAt)));
    return row ?? null;
}

// Does an invite link still work, and what does it give? Asked by the registration form, before sign-in.
async function inviteCheck(req: any, res: any) {
    const code = String(req.query?.code ?? "");
    const found = code.length > 0 && code.length <= 40 ? await unusedInvite(code) : null;
    return sendJson(res, 200, { valid: found != null, trialDays: found?.trialDays ?? null });
}

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
              .select({
                  name: businesses.name,
                  slug: businesses.slug,
                  logoUrl: businesses.logoUrl,
                  contactEmail: businesses.contactEmail,
                  ownerEmail: businesses.ownerEmail,
              })
              .from(businesses)
              .where(eq(businesses.slug, slug))
        : [];
    if (!row) return sendJson(res, 404, { error: "We couldn't find that shop. Please check the link.", code: "shop-not-found" });
    const shop = {
        name: row.name,
        slug: row.slug,
        logoUrl: row.logoUrl,
        // For the shop's privacy notice: how its customers reach it.
        contactEmail: row.contactEmail || row.ownerEmail,
    };
    // Public and rarely changes: Vercel's edge keeps a copy so the sign-in page shows the shop straight away
    // (a renamed shop or new logo shows within about 5 minutes).
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
    return sendJson(res, 200, shop);
}

// The "app" details a phone uses when someone adds the app to their home screen (needed on iPhone for
// notifications): the shop's name, logo and link - or PepBiz's for business owners.
async function webAppManifest(req: any, res: any) {
    const slug = String(req.query?.slug ?? "").trim().toLowerCase();
    const [shop] = slug
        ? await getDb()
              .select({ name: businesses.name, slug: businesses.slug, logoUrl: businesses.logoUrl })
              .from(businesses)
              .where(eq(businesses.slug, slug))
        : [];
    const name = shop?.name ?? "PepBiz";
    const icons = shop
        ? shop.logoUrl
            ? [{ src: shop.logoUrl, sizes: "512x512", purpose: "any" }]
            : []
        : [{ src: "/favicon.png", sizes: "256x256", type: "image/png", purpose: "any" }];
    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
    return res.status(200).send(
        JSON.stringify({
            name,
            short_name: name, // the phone shortens it under the icon if it has to
            start_url: shop ? `/shop/${shop.slug}` : "/",
            scope: "/",
            display: "standalone",
            background_color: "#09090B",
            theme_color: "#09090B",
            icons,
        })
    );
}

// Is a shop link free? Asked while someone fills in the registration form, before they have a login.
async function slugCheck(req: any, res: any) {
    const slug = String(req.query?.slug ?? "").trim().toLowerCase();
    const problem = slugProblem(slug) ?? ((await slugTaken(slug)) ? "That link is already taken - please choose another." : null);
    return sendJson(res, 200, { available: problem == null, problem });
}

export default async function handler(req: any, res: any) {
    if (req.query?.action === "shop" && req.method === "GET") return publicShop(req, res);
    if (req.query?.action === "slug" && req.method === "GET") return slugCheck(req, res);
    if (req.query?.action === "invite" && req.method === "GET") return inviteCheck(req, res);
    if (req.query?.action === "manifest" && req.method === "GET") return webAppManifest(req, res);
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

    if (action === "slug" && req.method === "GET") return slugCheck(req, res);
    if (action === "invite" && req.method === "GET") return inviteCheck(req, res);

    if (action === "create" && req.method === "POST") {
        if (await ownedBusiness(userId)) return sendJson(res, 409, { error: "You already have a business on PepBiz." });
        const parsed = createSchema.safeParse(await parseJsonBody(req));
        if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Please check your details" });
        const { name, slug, ownerName } = parsed.data;
        const problem = slugProblem(slug);
        if (problem) return sendJson(res, 400, { error: problem });
        const where = businessCountrySettings(parsed.data.country, parsed.data.timeZone);
        if (!where) return sendJson(res, 400, { error: "Choose the country your business is in" });
        const invite = parsed.data.invite || null;
        if (invite && !(await unusedInvite(invite))) {
            return sendJson(res, 409, { error: "That invite link has already been used or isn't valid - please check it with PepBiz." });
        }
        let inviteTrialDays: number | null = null;

        const id = crypto.randomUUID();
        const ownerEmail = await loginEmail(userId);
        try {
            await db.transaction(async (tx) => {
                const [created] = await tx
                    .insert(businesses)
                    .values({ id, slug, name, ...where, ownerName, ownerEmail })
                    .onConflictDoNothing()
                    .returning();
                if (!created) throw new SlugTaken();
                // Invited: the code is used up and the business never pays.
                if (invite) {
                    const [claimed] = await tx
                        .update(signupInvites)
                        .set({ businessId: id, usedAt: new Date() })
                        .where(and(eq(signupInvites.code, invite), isNull(signupInvites.usedAt)))
                        .returning();
                    if (!claimed) throw new InviteUsed();
                    // A longer free trial than the usual 14 days.
                    await tx.update(businesses).set({ trialDays: claimed.trialDays }).where(eq(businesses.id, id));
                    inviteTrialDays = claimed.trialDays;
                }
                await tx.insert(businessMembers).values({ businessId: id, clerkUserId: userId, role: "owner" });
                await tx.execute(sql`
                    insert into peptide_library (business_id, kind, key, sort, data)
                    select ${id}, kind, key, sort, data from peptide_library where business_id = ${TEMPLATE_BUSINESS_ID}`);
            });
        } catch (error) {
            if (error instanceof SlugTaken) return sendJson(res, 409, { error: "That link is already taken - please choose another." });
            if (error instanceof InviteUsed) {
                return sendJson(res, 409, { error: "That invite link has already been used or isn't valid - please check it with PepBiz." });
            }
            throw error;
        }
        return sendJson(res, 201, { slug, trialDays: inviteTrialDays });
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
        const body = (await parseJsonBody(req)) as { flow?: unknown };
        const flow = body?.flow === "cancel" ? "cancel" : undefined;
        return sendJson(res, 200, { url: await billingPortalUrl(business, appUrl(req), flow) });
    }

    if (action === "resume" && req.method === "POST") {
        if (!business.cancelAtPeriodEnd) return sendJson(res, 409, { error: "Your subscription isn't cancelled." });
        return sendJson(res, 200, { billing: billingInfo(await resumeSubscription(business)) });
    }

    if (action === "sync" && req.method === "POST") {
        const body = (await parseJsonBody(req)) as { sessionId?: unknown };
        const sessionId = typeof body?.sessionId === "string" && body.sessionId.startsWith("cs_") ? body.sessionId : null;
        const { problem } = sessionId ? await completeCheckout(sessionId, business.id) : { problem: null };
        const synced = business.stripeCustomerId ? await syncFromStripe(business.stripeCustomerId) : null;
        return sendJson(res, 200, { billing: billingInfo(synced ?? business), problem });
    }

    // The country (and so the currency) can only change before the subscription starts, so a business's sales
    // and costs are always in one currency.
    if (action === "country" && req.method === "PATCH") {
        const parsed = z
            .object({ country: z.string().trim().toUpperCase(), timeZone: z.string().trim().optional() })
            .safeParse(await parseJsonBody(req));
        const where = parsed.success ? businessCountrySettings(parsed.data.country, parsed.data.timeZone) : null;
        if (!where) return sendJson(res, 400, { error: "Choose the country your business is in" });
        if (await runAsBusiness(business.id, hasMoneyRecords)) {
            return sendJson(res, 409, {
                error: "Your country and currency can't be changed once you've recorded stock, orders, sales or expenses.",
            });
        }
        // A running subscription can't switch between the NZ price (NZ$) and the overseas one (US$).
        if (business.stripeSubscriptionId && planFor(where.country) !== planFor(business.country)) {
            return sendJson(res, 409, {
                error: "Your subscription is already running in another currency, so this change needs PepBiz support - please get in touch.",
            });
        }
        await changeCountry(business, where);
        return sendJson(res, 200, where);
    }

    if (action === "details" && req.method === "PATCH") {
        const parsed = z
            .object({
                name: z.string().trim().min(2, "Enter your business name").max(80).optional(),
                timeZone: z.string().trim().optional(),
                contactEmail: z
                    .union([z.string().trim().toLowerCase().email("That email address doesn't look right").max(200), z.literal("")])
                    .optional(),
            })
            .safeParse(await parseJsonBody(req));
        if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Please check your details" });
        const { name, timeZone, contactEmail } = parsed.data;
        if (timeZone !== undefined && !isKnownTimeZone(countryInfo(business.country), timeZone)) {
            return sendJson(res, 400, { error: "Choose one of your country's time zones" });
        }
        const [updated] = await db
            .update(businesses)
            .set({
                ...(name !== undefined ? { name } : {}),
                ...(timeZone !== undefined ? { timeZone } : {}),
                ...(contactEmail !== undefined ? { contactEmail } : {}),
                updatedAt: new Date(),
            })
            .where(eq(businesses.id, business.id))
            .returning();
        return sendJson(res, 200, { name: updated.name, timeZone: updated.timeZone, contactEmail: updated.contactEmail });
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
