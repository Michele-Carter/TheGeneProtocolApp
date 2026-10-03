import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUserId } from "../_lib/auth.js";
import { customerForUser } from "../_lib/customers.js";
import { getDb } from "../_lib/db.js";
import { parseJsonBody, sendJson } from "../_lib/http.js";
import { customers, notifications, sales, shopOrders } from "../_lib/schema.js";
import { loadCatalog, orderDemand } from "../_lib/shopCatalog.js";
import { isAddressComplete, toAddress } from "../../shared/customers.js";
import { saleTotals, type SaleInput } from "../../shared/sales.js";
import type { CustomerNotification, ShopOrder, ShopOrderLine } from "../../shared/shop.js";

// Endpoints for signed-in customers. Everything here only ever reads or changes the caller's own records.
//   GET  /api/shop/me         the caller's customer details (linked or created on first visit)
//   PUT  /api/shop/me         update their name, email and shipping address
//   GET  /api/shop/products   everything in the shop, with prices and a stock label
//   GET  /api/shop/orders     the caller's orders
//   POST /api/shop/orders     send an order { lines: [{ key, qty }], notes } - prices and stock are checked here
//   POST /api/shop/orders?id=&action=cancel   withdraw an order that hasn't been confirmed yet
//   GET  /api/shop/notifications              latest notifications + unread count
//   POST /api/shop/notifications?action=read  mark them all read

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

async function handleProducts(req: any, res: any, db: Db) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return sendJson(res, 405, { error: "Method not allowed" });
    }
    const { products } = await loadCatalog(db);
    return sendJson(res, 200, products);
}

const orderSchema = z.object({
    lines: z
        .array(z.object({ key: z.string().min(1), qty: z.number().int().min(1).max(99) }))
        .min(1, "Your cart is empty"),
    notes: z.string().max(2000).default(""),
});

class OrderError extends Error {}

// The customer-facing view of a confirmed order's progress. Only payment and shipping status are shared -
// never costs or profit.
function progressOf(sale: typeof sales.$inferSelect | undefined): ShopOrder["progress"] {
    if (!sale) return null;
    const data = sale.data as SaleInput;
    const totals = saleTotals(data);
    return {
        totalNzd: totals.total,
        paymentStatus: totals.paymentStatus,
        balanceNzd: Math.max(0, totals.balance),
        shippingStatus: data.shipping.status,
        courier: data.shipping.courier,
        tracking: data.shipping.tracking,
        sentDate: data.shipping.sentDate,
        completed: sale.status === "completed",
    };
}

function orderDto(row: typeof shopOrders.$inferSelect, sale?: typeof sales.$inferSelect): ShopOrder {
    return {
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status as ShopOrder["status"],
        lines: row.lines,
        subtotalNzd: row.subtotalNzd,
        shippingNzd: row.shippingNzd,
        notes: row.notes,
        adminMessage: row.adminMessage,
        createdAt: row.createdAt.toISOString(),
        decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
        progress: row.status === "confirmed" ? progressOf(sale) : null,
    };
}

async function handleOrders(req: any, res: any, db: Db, userId: string) {
    const customer = await customerForUser(db, userId);
    const id = typeof req.query?.id === "string" ? req.query.id : null;

    if (req.method === "GET") {
        const rows = await db
            .select()
            .from(shopOrders)
            .where(eq(shopOrders.customerId, customer.id))
            .orderBy(desc(shopOrders.createdAt));
        const saleIds = rows.map((r) => r.saleId).filter((s): s is string => Boolean(s));
        const saleRows = saleIds.length ? await db.select().from(sales).where(inArray(sales.id, saleIds)) : [];
        const salesById = new Map(saleRows.map((s) => [s.id, s]));
        return sendJson(res, 200, rows.map((row) => orderDto(row, row.saleId ? salesById.get(row.saleId) : undefined)));
    }

    // A customer can withdraw an order until it's been confirmed.
    if (req.method === "POST" && id && req.query?.action === "cancel") {
        const [row] = await db
            .update(shopOrders)
            .set({ status: "cancelled", decidedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(shopOrders.id, id), eq(shopOrders.customerId, customer.id), eq(shopOrders.status, "submitted")))
            .returning();
        if (!row) return sendJson(res, 409, { error: "This order can't be cancelled - it may already have been confirmed." });
        return sendJson(res, 200, orderDto(row));
    }

    if (req.method === "POST") {
        let body: unknown;
        try {
            body = await parseJsonBody(req);
        } catch {
            return sendJson(res, 400, { error: "Invalid JSON body" });
        }
        const parsed = orderSchema.safeParse(body);
        if (!parsed.success) {
            return sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Please check your order" });
        }

        const shippingAddress = toAddress(customer.shippingAddress);
        if (!isAddressComplete(shippingAddress)) {
            return sendJson(res, 400, { error: "Please add your shipping address before sending your order." });
        }

        // The same product added twice becomes one line.
        const wanted = new Map<string, number>();
        for (const line of parsed.data.lines) wanted.set(line.key, (wanted.get(line.key) ?? 0) + line.qty);

        try {
            const row = await db.transaction(async (tx) => {
                // One order at a time, so two customers can't both be promised the last vial.
                await tx.execute(sql`select pg_advisory_xact_lock(724101)`);
                const { orderable, available } = await loadCatalog(tx);

                const lines: ShopOrderLine[] = [];
                for (const [key, qty] of wanted) {
                    const variant = orderable.get(key);
                    if (!variant) {
                        throw new OrderError(
                            "Something in your cart is no longer available. Please refresh the shop and check your cart."
                        );
                    }
                    lines.push({
                        key,
                        kind: variant.kind,
                        refId: variant.refId,
                        name: variant.name,
                        variant: variant.variant,
                        qty,
                        unitPriceNzd: variant.priceNzd,
                        ...(variant.components ? { components: variant.components } : {}),
                    });
                }

                for (const [itemId, qty] of orderDemand(lines)) {
                    const left = Math.max(0, available.get(itemId) ?? 0);
                    if (qty <= left) continue;
                    const line =
                        lines.find((l) => l.kind === "item" && l.refId === itemId) ??
                        lines.find((l) => l.components?.some((c) => c.itemId === itemId))!;
                    const name = [line.name, line.variant].filter(Boolean).join(" ");
                    throw new OrderError(
                        line.kind === "item"
                            ? left === 0
                                ? `Sorry, ${name} has just sold out. Please remove it from your cart.`
                                : `Sorry, there ${left === 1 ? "is" : "are"} only ${left} of ${name} available right now. Please reduce the quantity in your cart.`
                            : `Sorry, there isn't enough stock for ${name} right now. Please reduce the quantity or remove it from your cart.`
                    );
                }

                const subtotal = Math.round(lines.reduce((t, l) => t + l.qty * l.unitPriceNzd, 0) * 100) / 100;
                const [created] = await tx
                    .insert(shopOrders)
                    .values({
                        id: crypto.randomUUID(),
                        orderNumber: sql`nextval('shop_order_number_seq')`,
                        customerId: customer.id,
                        status: "submitted",
                        lines,
                        subtotalNzd: subtotal,
                        notes: parsed.data.notes.trim(),
                        shippingAddress,
                    })
                    .returning();
                return created;
            });
            return sendJson(res, 201, orderDto(row));
        } catch (error) {
            if (error instanceof OrderError) return sendJson(res, 409, { error: error.message });
            throw error;
        }
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
}

async function handleNotifications(req: any, res: any, db: Db, userId: string) {
    const customer = await customerForUser(db, userId);

    if (req.method === "GET") {
        const rows = await db
            .select()
            .from(notifications)
            .where(eq(notifications.customerId, customer.id))
            .orderBy(desc(notifications.createdAt))
            .limit(30);
        const [unread] = await db
            .select({ n: sql<number>`count(*)::int` })
            .from(notifications)
            .where(and(eq(notifications.customerId, customer.id), isNull(notifications.readAt)));
        const items: CustomerNotification[] = rows.map((r) => ({
            id: r.id,
            kind: r.kind as CustomerNotification["kind"],
            title: r.title,
            body: r.body,
            shopOrderId: r.shopOrderId,
            read: r.readAt != null,
            createdAt: r.createdAt.toISOString(),
        }));
        return sendJson(res, 200, { unread: unread?.n ?? 0, items });
    }

    if (req.method === "POST" && req.query?.action === "read") {
        await db
            .update(notifications)
            .set({ readAt: new Date() })
            .where(and(eq(notifications.customerId, customer.id), isNull(notifications.readAt)));
        return sendJson(res, 200, { success: true });
    }

    res.setHeader("Allow", "GET, POST");
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
            case "products":
                return await handleProducts(req, res, db);
            case "orders":
                return await handleOrders(req, res, db, userId);
            case "notifications":
                return await handleNotifications(req, res, db, userId);
            default:
                return sendJson(res, 404, { error: "Not found" });
        }
    } catch (error) {
        console.error(`Shop ${resource} request failed:`, error);
        return sendJson(res, 500, { error: "Something went wrong - please try again." });
    }
}
