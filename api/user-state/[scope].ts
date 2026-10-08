import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUserId } from "../_lib/auth.js";
import { getDb } from "../_lib/db.js";
import { parseJsonBody, sendJson } from "../_lib/http.js";
import { userStateDocuments } from "../_lib/schema.js";

const scopeSchema = z.enum(["protocol", "tracking", "reconstitution"]);
const upsertUserStateSchema = z.object({
    data: z.unknown(),
});

function toDto(row: any) {
    return {
        scope: row.scope,
        data: row.data,
        updatedAt: row.updatedAt,
    };
}

export default async function handler(req: any, res: any) {
    const userId = await requireAuthUserId(req);
    if (!userId) {
        return sendJson(res, 401, { error: "Unauthenticated" });
    }

    const parsedScope = scopeSchema.safeParse(req.query?.scope);
    if (!parsedScope.success) {
        return sendJson(res, 400, { error: "Invalid scope" });
    }

    let db;
    try {
        db = getDb();
    } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message });
    }

    const scope = parsedScope.data;
    const documentId = `${userId}:${scope}`;
    const whereClause = and(eq(userStateDocuments.id, documentId), eq(userStateDocuments.clerkUserId, userId));

    if (req.method === "GET") {
        const rows = await db.select().from(userStateDocuments).where(whereClause);
        if (rows.length === 0) {
            return sendJson(res, 200, { scope, data: null });
        }

        return sendJson(res, 200, toDto(rows[0]));
    }

    if (req.method === "PUT") {
        let body: unknown;
        try {
            body = await parseJsonBody(req);
        } catch {
            return sendJson(res, 400, { error: "Invalid JSON body" });
        }

        const parsed = upsertUserStateSchema.safeParse(body);
        if (!parsed.success) {
            return sendJson(res, 400, {
                error: "Validation failed",
                details: parsed.error.flatten(),
            });
        }

        const now = new Date();

        await db
            .insert(userStateDocuments)
            .values({
                id: documentId,
                clerkUserId: userId,
                scope,
                data: parsed.data.data,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: userStateDocuments.id,
                set: {
                    data: parsed.data.data,
                    updatedAt: now,
                },
            });

        const rows = await db.select().from(userStateDocuments).where(whereClause);
        return sendJson(res, 200, toDto(rows[0]));
    }

    if (req.method === "DELETE") {
        await db.delete(userStateDocuments).where(whereClause);
        return sendJson(res, 200, { success: true });
    }

    res.setHeader("Allow", "GET, PUT, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
}