import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUserId } from "../_lib/auth.js";
import { businessCountryName, serveAsBusiness, type BusinessRequest, type Db } from "../_lib/business.js";
import { alertNewOrder, alertOrderCancelled, alertOrderChanged, alertOrderChanging, alertPaymentSent, pushKey, removeDevice, saveDevice, subscribeSchema } from "../_lib/orderAlerts.js";
import { customerForUser } from "../_lib/customers.js";
import { MessageError, conversation, markRead, sendMessage, sendMessageFile, unreadCount } from "../_lib/messages.js";
import { parseJsonBody, sendJson } from "../_lib/http.js";
import { appSettings, customers, invItems, notifications, pushSubscriptions, sales, shopOrders } from "../_lib/schema.js";
import { activeSale, loadCatalog, lockStock, orderDemand } from "../_lib/shopCatalog.js";
import { restoreSaleStock } from "../_lib/inventory.js";
import { isAddressComplete, toAddress } from "../../shared/customers.js";
import { saleTotals, type SaleInput } from "../../shared/sales.js";
import { priceOrder, toDeal } from "../../shared/specials.js";
import {
    MAX_MESSAGE_LENGTH,
    PAYMENT_DETAILS_KEY,
    hasPaymentDetails,
    toPaymentDetails,
    type CustomerNotification,
    type PaymentDetails,
    type ShopOrder,
    type ShopOrderLine,
} from "../../shared/shop.js";

// Endpoints for signed-in customers, run as the business they belong to (api/_lib/business.ts).
// Everything here only ever reads or changes the caller's own records.
//   GET  /api/shop/me         the caller's customer details (linked or created on first visit)
//   PUT  /api/shop/me         update their name, email and shipping address
//   GET  /api/shop/products   everything in the shop, with prices and a stock label
//   GET  /api/shop/sale       the storewide sale on today: { sale } (null = none)
//   GET  /api/shop/orders     the caller's orders
//   POST /api/shop/orders     send an order { lines: [{ key, qty }], notes } - prices and stock are checked here
//   POST /api/shop/orders?id=&action=cancel   withdraw an order that hasn't been confirmed yet
//   POST /api/shop/orders?id=&action=paid     tell the owner they've paid { reference }
//   GET  /api/shop/notifications              latest notifications + unread count
//   POST /api/shop/notifications?action=read  mark them all read
//   GET  /api/shop/push                       phone/computer notifications: the key + the caller's devices
//   POST /api/shop/push?action=subscribe { subscription, device }   ?action=unsubscribe { endpoint }
//   GET  /api/shop/messages                   their conversation with the shop (?summary=1: unread count)
//   POST /api/shop/messages { body, shopOrderId?, attachment? }   send a message   ?action=read: mark the shop's read
//   GET  /api/shop/messages?file=<id>        a photo/PDF from their conversation

type CustomerRow = typeof customers.$inferSelect;

const detailsSchema = z.object({
    name: z.string().trim().min(1, "Please enter your name"),
    email: z.string().trim().toLowerCase().email("Please enter a valid email address"),
    shippingAddress: z
        .object({
            line1: z.string().trim().default(""),
            line2: z.string().trim().default(""),
            suburb: z.string().trim().default(""),
            city: z.string().trim().default(""),
            region: z.string().trim().default(""),
            postcode: z.string().trim().default(""),
            country: z.string().trim().default(""),
        })
        // No country given: the shop's own.
        .transform((a) => ({ ...a, country: a.country || businessCountryName() })),
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

async function handleProducts(req: any, res: any, db: Db, userId: string) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return sendJson(res, 405, { error: "Method not allowed" });
    }
    // While a customer changes one of their waiting orders, what it holds is theirs to keep (see availableStock).
    let editing: string | undefined;
    if (typeof req.query?.editing === "string") {
        const customer = await customerForUser(db, userId);
        const [order] = await db
            .select({ id: shopOrders.id })
            .from(shopOrders)
            .where(and(eq(shopOrders.id, req.query.editing), eq(shopOrders.customerId, customer.id), eq(shopOrders.status, "submitted")));
        editing = order?.id;
    }
    const { products } = await loadCatalog(db, editing);
    return sendJson(res, 200, products);
}

async function handleSale(req: any, res: any, db: Db) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return sendJson(res, 405, { error: "Method not allowed" });
    }
    return sendJson(res, 200, { sale: await activeSale(db) });
}

const orderSchema = z.object({
    lines: z
        .array(z.object({ key: z.string().min(1), qty: z.number().int().min(1).max(99) }))
        .min(1, "Your cart is empty"),
    notes: z.string().max(2000).default(""),
});

class OrderError extends Error {}

// What's on a customer order, as the customer sees it: each item, with a bundle's items (added together under its
// name) shown as one entry. The same bundle twice in a row starts a new entry when an item comes round again.
function orderItems(lines: SaleInput["lines"]): NonNullable<ShopOrder["progress"]>["items"] {
    const items: NonNullable<ShopOrder["progress"]>["items"] = [];
    let bundle: { name: string; itemIds: Set<string> } | null = null;
    for (const line of lines) {
        const label = `${line.qty}× ${[line.name, line.variant].filter(Boolean).join(" ")}`;
        const total = line.qty * line.unitPriceNzd;
        const last = items[items.length - 1];
        if (line.bundleName && bundle?.name === line.bundleName && !bundle.itemIds.has(line.itemId)) {
            last.contents += `, ${label}`;
            last.totalNzd += total;
            bundle.itemIds.add(line.itemId);
        } else if (line.bundleName) {
            items.push({ name: line.bundleName, contents: label, totalNzd: total });
            bundle = { name: line.bundleName, itemIds: new Set([line.itemId]) };
        } else {
            items.push({ name: label, contents: "", totalNzd: total });
            bundle = null;
        }
    }
    return items;
}

// The customer-facing view of a confirmed order's progress. Only what they're charged, payment and shipping are
// shared - never costs or profit.
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
        items: orderItems(data.lines),
        discountNzd: data.discountNzd ?? 0,
        shippingNzd: data.shippingChargedNzd ?? 0,
    };
}

// Whether the customer can still change an order themselves: until it's confirmed, or once confirmed while nothing
// has been paid (or said to be paid), it hasn't been sent, and it still has the items they ordered - if the owner
// has changed those, the customer asks the owner instead.
function canChange(row: typeof shopOrders.$inferSelect, sale: typeof sales.$inferSelect | undefined): boolean {
    if (row.status === "submitted") return true;
    if (row.status !== "confirmed" || !sale || row.paymentReportedAt) return false;
    const data = sale.data as SaleInput;
    if (saleTotals(data).paymentStatus !== "unpaid" || data.shipping.status !== "not-sent") return false;
    const ordered = orderDemand(row.lines);
    const now = new Map<string, number>();
    for (const line of data.lines) now.set(line.itemId, (now.get(line.itemId) ?? 0) + line.qty);
    return now.size === ordered.size && Array.from(ordered).every(([itemId, qty]) => now.get(itemId) === qty);
}

// The lines of an order being sent (or changed), priced as the shop is now. Nothing can be ordered beyond what's
// in stock, so every order sent can be confirmed as it is. exceptOrderId: the order being changed - what it holds
// is the customer's to keep.
async function checkedLines(tx: Db, wanted: Map<string, number>, exceptOrderId?: string): Promise<ShopOrderLine[]> {
    const [{ orderable, available }, sale] = await Promise.all([loadCatalog(tx, exceptOrderId), activeSale(tx)]);

    const lines: ShopOrderLine[] = [];
    for (const [key, qty] of wanted) {
        const variant = orderable.get(key);
        if (!variant) {
            throw new OrderError("Something in your cart is no longer available. Please refresh the shop and check your cart.");
        }
        lines.push({
            key,
            kind: variant.kind,
            refId: variant.refId,
            name: variant.name,
            variant: variant.variant,
            qty,
            unitPriceNzd: variant.priceNzd,
            ...(variant.special ? { special: variant.special } : {}),
            ...(sale ? { storewide: toDeal(sale) } : {}),
            ...(variant.components ? { components: variant.components } : {}),
        });
    }

    // A bundle and the same item on its own, or two bundles sharing an item, all count together.
    for (const [itemId, qty] of orderDemand(lines)) {
        const left = Math.max(0, available.get(itemId) ?? 0);
        if (qty <= left) continue;
        const [item] = await tx.select().from(invItems).where(eq(invItems.id, itemId));
        const name = item ? [item.name, item.variant].filter(Boolean).join(" ") : "An item in your cart";
        throw new OrderError(
            left === 0
                ? `Sorry, ${name} is out of stock. Please remove it from your cart.`
                : `Sorry, there ${left === 1 ? "is" : "are"} only ${left} of ${name} left. Please reduce the quantity in your cart.`
        );
    }
    return lines;
}

// An order sent from the cart: its lines, merged so the same product added twice becomes one line.
async function readOrder(req: any): Promise<{ wanted: Map<string, number>; notes: string } | { error: string }> {
    let body: unknown;
    try {
        body = await parseJsonBody(req);
    } catch {
        return { error: "Invalid JSON body" };
    }
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your order" };
    const wanted = new Map<string, number>();
    for (const line of parsed.data.lines) wanted.set(line.key, (wanted.get(line.key) ?? 0) + line.qty);
    return { wanted, notes: parsed.data.notes.trim() };
}

function orderDto(
    row: typeof shopOrders.$inferSelect,
    sale?: typeof sales.$inferSelect,
    paymentDetails?: PaymentDetails | null
): ShopOrder {
    const progress = row.status === "confirmed" ? progressOf(sale) : null;
    // Bank details are only shared once the owner has confirmed the order, and only until it's paid.
    const awaitingPayment = progress != null && progress.paymentStatus !== "paid";
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
        paymentReportedAt: row.paymentReportedAt ? row.paymentReportedAt.toISOString() : null,
        paymentReference: row.paymentReference,
        cancelledBy: (row.cancelledBy as ShopOrder["cancelledBy"]) ?? null,
        paymentDetails: awaitingPayment && paymentDetails && hasPaymentDetails(paymentDetails) ? paymentDetails : null,
        progress,
        canChange: canChange(row, sale),
    };
}

async function handleOrders(req: any, res: any, db: Db, userId: string, { access, afterSave }: BusinessRequest) {
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
        const paymentDetails = await loadPaymentDetails(db);
        return sendJson(
            res,
            200,
            rows.map((row) => orderDto(row, row.saleId ? salesById.get(row.saleId) : undefined, paymentDetails))
        );
    }

    // The customer tells the owner they've paid a confirmed order (the owner checks the bank and marks it paid).
    if (req.method === "POST" && id && req.query?.action === "paid") {
        let body: unknown;
        try {
            body = await parseJsonBody(req);
        } catch {
            return sendJson(res, 400, { error: "Invalid JSON body" });
        }
        const parsed = z.object({ reference: z.string().trim().max(200).default("") }).safeParse(body);
        if (!parsed.success) return sendJson(res, 400, { error: "Please check the payment reference" });
        const [row] = await db
            .update(shopOrders)
            .set({ paymentReportedAt: new Date(), paymentReference: parsed.data.reference, updatedAt: new Date() })
            .where(and(eq(shopOrders.id, id), eq(shopOrders.customerId, customer.id), eq(shopOrders.status, "confirmed")))
            .returning();
        if (!row) return sendJson(res, 409, { error: "Only confirmed orders can be marked as paid." });
        const [sale] = row.saleId ? await db.select().from(sales).where(eq(sales.id, row.saleId)) : [];
        // Tell the owner (phone/computer notification) so they can check the bank.
        afterSave(() =>
            alertPaymentSent(access.business, {
                orderNumber: row.orderNumber,
                totalNzd: sale ? saleTotals(sale.data as SaleInput).total : Number(row.subtotalNzd),
                customerName: customer.name,
                reference: row.paymentReference,
            })
        );
        return sendJson(res, 200, orderDto(row, sale, await loadPaymentDetails(db)));
    }

    // A customer can withdraw an order until it's been confirmed.
    if (req.method === "POST" && id && req.query?.action === "cancel") {
        const [row] = await db
            .update(shopOrders)
            .set({ status: "cancelled", cancelledBy: "customer", decidedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(shopOrders.id, id), eq(shopOrders.customerId, customer.id), eq(shopOrders.status, "submitted")))
            .returning();
        if (!row) return sendJson(res, 409, { error: "This order can't be cancelled - it may already have been confirmed." });
        afterSave(() => alertOrderCancelled(access.business, { orderNumber: row.orderNumber, customerName: customer.name }));
        return sendJson(res, 200, orderDto(row));
    }

    // The customer wants to change an order: one that's confirmed but not paid goes back to waiting for confirmation
    // (its items go back into stock, held for them), then they change it from their cart and send it again.
    // A waiting order needs nothing doing here.
    if (req.method === "POST" && id && req.query?.action === "change") {
        try {
            const result = await db.transaction(async (tx) => {
                await lockStock(tx);
                const [order] = await tx
                    .select()
                    .from(shopOrders)
                    .where(and(eq(shopOrders.id, id), eq(shopOrders.customerId, customer.id)))
                    .for("update");
                if (!order) throw new OrderError("Order not found.");
                if (order.status === "submitted") return { row: order, reopened: false };
                const [sale] = order.saleId ? await tx.select().from(sales).where(eq(sales.id, order.saleId)).for("update") : [];
                if (!canChange(order, sale)) throw new OrderError("This order can't be changed any more - please message us about it.");
                await restoreSaleStock(tx, sale!.id);
                await tx.delete(sales).where(eq(sales.id, sale!.id));
                const [row] = await tx
                    .update(shopOrders)
                    .set({ status: "submitted", saleId: null, shippingNzd: null, adminMessage: "", decidedAt: null, updatedAt: new Date() })
                    .where(eq(shopOrders.id, id))
                    .returning();
                return { row, reopened: true };
            });
            if (result.reopened) {
                afterSave(() => alertOrderChanging(access.business, { orderNumber: result.row.orderNumber, customerName: customer.name }));
            }
            return sendJson(res, 200, orderDto(result.row));
        } catch (error) {
            if (error instanceof OrderError) return sendJson(res, 409, { error: error.message });
            throw error;
        }
    }

    // The customer sends their changed order: it replaces what was on it, and waits for confirmation again.
    if (req.method === "PATCH" && id) {
        const read = await readOrder(req);
        if ("error" in read) return sendJson(res, 400, { error: read.error });
        try {
            const row = await db.transaction(async (tx) => {
                await lockStock(tx);
                const [order] = await tx
                    .select()
                    .from(shopOrders)
                    .where(and(eq(shopOrders.id, id), eq(shopOrders.customerId, customer.id)))
                    .for("update");
                if (!order || order.status !== "submitted") {
                    throw new OrderError("This order can't be changed any more - it may have just been confirmed. Please check My Orders.");
                }
                const lines = await checkedLines(tx, read.wanted, order.id);
                const address = toAddress(customer.shippingAddress);
                const [updated] = await tx
                    .update(shopOrders)
                    .set({
                        lines,
                        subtotalNzd: priceOrder(lines).subtotalNzd,
                        notes: read.notes,
                        ...(isAddressComplete(address) ? { shippingAddress: address } : {}),
                        updatedAt: new Date(),
                    })
                    .where(eq(shopOrders.id, id))
                    .returning();
                return updated;
            });
            afterSave(() =>
                alertOrderChanged(access.business, {
                    orderNumber: row.orderNumber,
                    subtotalNzd: Number(row.subtotalNzd),
                    itemCount: row.lines.reduce((n, l) => n + l.qty, 0),
                    customerName: customer.name,
                })
            );
            return sendJson(res, 200, orderDto(row));
        } catch (error) {
            if (error instanceof OrderError) return sendJson(res, 409, { error: error.message });
            throw error;
        }
    }

    if (req.method === "POST") {
        const read = await readOrder(req);
        if ("error" in read) return sendJson(res, 400, { error: read.error });

        const shippingAddress = toAddress(customer.shippingAddress);
        if (!isAddressComplete(shippingAddress)) {
            return sendJson(res, 400, { error: "Please add your shipping address before sending your order." });
        }

        try {
            const row = await db.transaction(async (tx) => {
                // One order at a time, so two customers can't both be promised the last vial.
                await lockStock(tx);
                const lines = await checkedLines(tx, read.wanted);
                const subtotal = priceOrder(lines).subtotalNzd;
                const [created] = await tx
                    .insert(shopOrders)
                    .values({
                        id: crypto.randomUUID(),
                        // Each business numbers its own orders from #1001 (safe under lockStock).
                        orderNumber: sql`(select coalesce(max(${shopOrders.orderNumber}), 1000) + 1 from ${shopOrders})`,
                        customerId: customer.id,
                        status: "submitted",
                        lines,
                        subtotalNzd: subtotal,
                        notes: read.notes,
                        shippingAddress,
                    })
                    .returning();
                return created;
            });
            // Tell the owner (phone/computer notification) once the order is saved.
            afterSave(() =>
                alertNewOrder(
                    access.business,
                    {
                        orderNumber: row.orderNumber,
                        subtotalNzd: Number(row.subtotalNzd),
                        itemCount: row.lines.reduce((n, l) => n + l.qty, 0),
                        customerName: customer.name,
                    }
                )
            );
            return sendJson(res, 201, orderDto(row));
        } catch (error) {
            if (error instanceof OrderError) return sendJson(res, 409, { error: error.message });
            throw error;
        }
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return sendJson(res, 405, { error: "Method not allowed" });
}

// The customer's own phones/computers that get their order updates (api/_lib/orderAlerts.ts).
async function handlePush(req: any, res: any, db: Db, userId: string) {
    const customer = await customerForUser(db, userId);
    const info = async () => {
        const devices = await db
            .select({ endpoint: pushSubscriptions.endpoint })
            .from(pushSubscriptions)
            .where(eq(pushSubscriptions.customerId, customer.id));
        return { pushKey: pushKey(), endpoints: devices.map((d) => d.endpoint) };
    };
    if (req.method === "GET") return sendJson(res, 200, await info());

    let body: any;
    try {
        body = (await parseJsonBody(req)) ?? {};
    } catch {
        return sendJson(res, 400, { error: "Invalid JSON body" });
    }
    if (req.method === "POST" && req.query?.action === "subscribe") {
        const parsed = subscribeSchema.safeParse(body);
        if (!parsed.success) return sendJson(res, 400, { error: "That device couldn't be set up for notifications." });
        await saveDevice(db, { clerkUserId: userId, customerId: customer.id }, parsed.data);
        return sendJson(res, 200, await info());
    }
    if (req.method === "POST" && req.query?.action === "unsubscribe") {
        const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
        if (!endpoint) return sendJson(res, 400, { error: "Which device?" });
        await removeDevice(db, { customerId: customer.id }, { endpoint });
        return sendJson(res, 200, await info());
    }
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
}

// The customer's conversation with the shop.
//   GET  /api/shop/messages               { messages, unread }   (?summary=1: just { unread })
//   POST /api/shop/messages               { body, shopOrderId? } sends one
//   POST /api/shop/messages?action=read   marks the shop's messages read
//   GET  /api/shop/messages?file=<id>     the photo/PDF sent with one of their messages
async function handleMessages(req: any, res: any, db: Db, userId: string) {
    const customer = await customerForUser(db, userId);

    if (req.method === "GET" && typeof req.query?.file === "string") {
        return sendMessageFile(res, db, req.query.file, customer.id);
    }

    if (req.method === "GET") {
        const unread = await unreadCount(db, "customer", customer.id);
        if (req.query?.summary === "1") return sendJson(res, 200, { unread });
        return sendJson(res, 200, { unread, messages: await conversation(db, customer.id) });
    }

    if (req.method === "POST" && req.query?.action === "read") {
        await markRead(db, "customer", customer.id);
        return sendJson(res, 200, { success: true });
    }

    if (req.method === "POST") {
        let body: unknown;
        try {
            body = await parseJsonBody(req);
        } catch {
            return sendJson(res, 400, { error: "Invalid JSON body" });
        }
        const parsed = z
            .object({
                body: z.string().max(MAX_MESSAGE_LENGTH * 2),
                shopOrderId: z.string().nullish(),
                attachment: z.object({ dataUrl: z.string(), name: z.string().max(300) }).nullish(),
            })
            .safeParse(body);
        if (!parsed.success) return sendJson(res, 400, { error: "Please check your message" });
        try {
            const message = await sendMessage(db, { customerId: customer.id, sender: "customer", ...parsed.data });
            return sendJson(res, 201, { message });
        } catch (error) {
            if (error instanceof MessageError) return sendJson(res, 400, { error: error.message });
            throw error;
        }
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
}

async function loadPaymentDetails(db: Db): Promise<PaymentDetails> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, PAYMENT_DETAILS_KEY));
    return toPaymentDetails(row?.value);
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
    return handleShopRequest(req, res, userId);
}

export async function handleShopRequest(req: any, res: any, userId: string) {
    const resource = req.query?.resource;
    return serveAsBusiness(req, res, userId, { ownersOnly: false }, async (request) => {
        const { db, res } = request;
        try {
            switch (resource) {
                case "me":
                    return await handleMe(req, res, db, userId);
                case "products":
                    return await handleProducts(req, res, db, userId);
                case "sale":
                    return await handleSale(req, res, db);
                case "orders":
                    return await handleOrders(req, res, db, userId, request);
                case "notifications":
                    return await handleNotifications(req, res, db, userId);
                case "push":
                    return await handlePush(req, res, db, userId);
                case "messages":
                    return await handleMessages(req, res, db, userId);
                default:
                    return sendJson(res, 404, { error: "Not found" });
            }
        } catch (error) {
            console.error(`Shop ${resource} request failed:`, error);
            return sendJson(res, 500, { error: "Something went wrong - please try again." });
        }
    });
}
