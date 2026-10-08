import { asc, sql } from "drizzle-orm";
import { requireAuthUserId } from "./_lib/auth.js";
import { serveAsBusiness } from "./_lib/business.js";
import { sendJson } from "./_lib/http.js";
import { peptideLibrary } from "./_lib/schema.js";

// GET /api/library - the peptide library of the business the caller uses the app as (shared/library.ts):
// every record as { kind, key, data }, in display order. Answers 304 when the app's copy is still current.
export default async function handler(req: any, res: any) {
    const userId = await requireAuthUserId(req);
    if (!userId) {
        return sendJson(res, 401, { error: "Unauthenticated" });
    }
    return handleLibraryRequest(req, res, userId);
}

export async function handleLibraryRequest(req: any, res: any, userId: string) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return sendJson(res, 405, { error: "Method not allowed" });
    }

    return serveAsBusiness(req, res, userId, { ownersOnly: false }, async ({ db, access, res }) => {
        // Changes whenever a record is added, edited or removed.
        const [stamp] = await db
            .select({ n: sql<number>`count(*)::int`, latest: sql<string>`coalesce(extract(epoch from max(${peptideLibrary.updatedAt})), 0)::text` })
            .from(peptideLibrary);
        const etag = `"${access.business.id}-${stamp.n}-${stamp.latest}"`;
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", "private, no-cache");
        res.setHeader("Vary", "Authorization, X-Business");
        if (req.headers?.["if-none-match"] === etag) return sendJson(res, 304, null);

        const rows = await db
            .select({ kind: peptideLibrary.kind, key: peptideLibrary.key, data: peptideLibrary.data })
            .from(peptideLibrary)
            .orderBy(asc(peptideLibrary.kind), asc(peptideLibrary.sort), asc(peptideLibrary.key));
        return sendJson(res, 200, rows);
    });
}
