import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUserId } from "../_lib/auth.js";
import { serveAsBusiness, type Db } from "../_lib/business.js";
import { parseJsonBody, sendJson } from "../_lib/http.js";
import { protocols } from "../_lib/schema.js";

const updateProtocolSchema = z
    .object({
        name: z.string().min(1).optional(),
        data: z.unknown().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "At least one field must be provided");

function toDto(row: any) {
    return {
        id: row.id,
        name: row.name,
        data: row.data ?? {},
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export default async function handler(req: any, res: any) {
    const userId = await requireAuthUserId(req);
    if (!userId) {
        return sendJson(res, 401, { error: "Unauthenticated" });
    }

    return serveAsBusiness(req, res, userId, { ownersOnly: false }, ({ db, res }) => handleProtocols(req, res, db, userId));
}

// The caller's protocols in the business they're using the app as.
async function handleProtocols(req: any, res: any, db: Db, userId: string) {
    const id = req.query?.id;
    if (!id || typeof id !== "string") {
        return sendJson(res, 400, { error: "Invalid id" });
    }

    const whereClause = and(eq(protocols.id, id), eq(protocols.clerkUserId, userId));

    if (req.method === "PATCH") {
        let body: unknown;
        try {
            body = await parseJsonBody(req);
        } catch {
            return sendJson(res, 400, { error: "Invalid JSON body" });
        }

        const parsed = updateProtocolSchema.safeParse(body);
        if (!parsed.success) {
            return sendJson(res, 400, {
                error: "Validation failed",
                details: parsed.error.flatten(),
            });
        }

        const existing = await db.select().from(protocols).where(whereClause);
        if (existing.length === 0) {
            return sendJson(res, 404, { error: "Protocol not found" });
        }

        await db
            .update(protocols)
            .set({
                ...parsed.data,
                updatedAt: new Date(),
            })
            .where(whereClause);

        const updated = await db.select().from(protocols).where(whereClause);
        return sendJson(res, 200, toDto(updated[0]));
    }

    if (req.method === "DELETE") {
        const existing = await db.select().from(protocols).where(whereClause);
        if (existing.length === 0) {
            return sendJson(res, 404, { error: "Protocol not found" });
        }

        await db.delete(protocols).where(whereClause);
        return sendJson(res, 200, { success: true });
    }

    res.setHeader("Allow", "PATCH, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
}
