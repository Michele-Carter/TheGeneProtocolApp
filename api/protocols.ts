import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUserId } from "./_lib/auth.js";
import { getDb } from "./_lib/db.js";
import { parseJsonBody, sendJson } from "./_lib/http.js";
import { protocols } from "./_lib/schema.js";

const createProtocolSchema = z.object({
    name: z.string().min(1),
    data: z.unknown().optional(),
});

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

    let db;
    try {
        db = getDb();
    } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message });
    }

    if (req.method === "GET") {
        const rows = await db
            .select()
            .from(protocols)
            .where(eq(protocols.clerkUserId, userId))
            .orderBy(asc(protocols.createdAt));

        return sendJson(res, 200, rows.map(toDto));
    }

    if (req.method === "POST") {
        let body: unknown;
        try {
            body = await parseJsonBody(req);
        } catch {
            return sendJson(res, 400, { error: "Invalid JSON body" });
        }

        const parsed = createProtocolSchema.safeParse(body);
        if (!parsed.success) {
            return sendJson(res, 400, {
                error: "Validation failed",
                details: parsed.error.flatten(),
            });
        }

        const payload = parsed.data;
        const rowId = crypto.randomUUID();
        const now = new Date();

        try {
            await db.insert(protocols).values({
                id: rowId,
                clerkUserId: userId,
                name: payload.name,
                data: payload.data ?? {},
                createdAt: now,
                updatedAt: now,
            });

            const created = await db
                .select()
                .from(protocols)
                .where(eq(protocols.id, rowId));

            return sendJson(res, 201, toDto(created[0]));
        } catch (error) {
            console.error("Failed to create protocol:", error);

            return sendJson(res, 500, { error: "Failed to create protocol" });
        }
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
}
