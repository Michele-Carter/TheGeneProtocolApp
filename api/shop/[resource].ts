import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUserId } from "../_lib/auth.js";
import { customerForUser } from "../_lib/customers.js";
import { getDb } from "../_lib/db.js";
import { parseJsonBody, sendJson } from "../_lib/http.js";
import { customers } from "../_lib/schema.js";
import { isAddressComplete, toAddress } from "../../shared/customers.js";

// Endpoints for signed-in customers. Everything here only ever reads or changes the caller's own records.
//   GET  /api/shop/me     the caller's customer details (linked or created on first visit)
//   PUT  /api/shop/me     update their name, email and shipping address

type Db = ReturnType<typeof getDb>;
type CustomerRow = typeof customers.$inferSelect;

const detailsSchema = z.object({
    name: z.string().trim().min(1, "Please enter your name"),
    email: z.string().trim().toLowerCase().email("Please enter a valid email address"),
    shippingAddress: z.object({
        line1: z.string().trim().default(""),
        line2: z.string().trim().default(""),
        suburb: z.string().trim().default(""),
        city: z.string().trim().default(""),
        postcode: z.string().trim().default(""),
        country: z.string().trim().default("New Zealand"),
    }),
});

function meDto(row: CustomerRow) {
    const shippingAddress = toAddress(row.shippingAddress);
    return {
        name: row.name,
        email: row.email,
        shippingAddress,
        addressComplete: isAddressComplete(shippingAddress),
    };
}

async function handleMe(req: any, res: any, db: Db, userId: string) {
    const customer = await customerForUser(db, userId);

    if (req.method === "GET") {
        return sendJson(res, 200, meDto(customer));
    }

    if (req.method === "PUT") {
        let body: unknown;
        try {
            body = await parseJsonBody(req);
        } catch {
            return sendJson(res, 400, { error: "Invalid JSON body" });
        }
        const parsed = detailsSchema.safeParse(body);
        if (!parsed.success) {
            return sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Please check your details" });
        }
        const [updated] = await db
            .update(customers)
            .set({ ...parsed.data, updatedAt: new Date() })
            .where(eq(customers.id, customer.id))
            .returning();
        return sendJson(res, 200, meDto(updated));
    }

    res.setHeader("Allow", "GET, PUT");
    return sendJson(res, 405, { error: "Method not allowed" });
}

export default async function handler(req: any, res: any) {
    const userId = await requireAuthUserId(req);
    if (!userId) {
        return sendJson(res, 401, { error: "Unauthenticated" });
    }

    let db: Db;
    try {
        db = getDb();
    } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message });
    }

    const resource = req.query?.resource;
    try {
        switch (resource) {
            case "me":
                return await handleMe(req, res, db, userId);
            default:
                return sendJson(res, 404, { error: "Not found" });
        }
    } catch (error) {
        console.error(`Shop ${resource} request failed:`, error);
        return sendJson(res, 500, { error: "Something went wrong - please try again." });
    }
}
