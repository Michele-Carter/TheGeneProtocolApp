import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { del, put } from "@vercel/blob";
import { z } from "zod";
import { getAdminStatus } from "../_lib/admin.js";
import { getDb } from "../_lib/db.js";
import { parseJsonBody, sendJson } from "../_lib/http.js";
import {
    addAdjustmentLot,
    consumeFifo,
    ensureItems,
    findAdjustment,
    InventoryError,
    restoreSaleStock,
    undoAdjustment,
} from "../_lib/inventory.js";
import { calculateOrder, isExpenseLine, type OrderInput } from "../../shared/landedCost.js";
import { EXPENSE_CATEGORIES, saleProfit, saleTotals, type SaleInput } from "../../shared/sales.js";
import { expenseSummary, expenseTotals } from "../../shared/expenses.js";
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_PRODUCT, normalizeCategories } from "../../shared/shop.js";
import { bundles, expenses, invItems, inventoryLots, purchaseOrders, sales, stockMovements } from "../_lib/schema.js";

// All owner-only endpoints live in this one function (keeps us under Vercel's function limit):
//   GET    /api/admin/me
//   GET    /api/admin/items                 POST /api/admin/items          PATCH /api/admin/items?id=
//   GET    /api/admin/orders[?id=]          POST /api/admin/orders
//   PATCH  /api/admin/orders?id=            DELETE /api/admin/orders?id=
//   POST   /api/admin/orders?id=&action=receive|unreceive
//   GET    /api/admin/inventory[?id=]
//   POST   /api/admin/adjust               PATCH /api/admin/adjust?id=    DELETE /api/admin/adjust?id=
//   GET    /api/admin/sales[?id=]           POST /api/admin/sales
//   PATCH  /api/admin/sales?id=             DELETE /api/admin/sales?id=
//   POST   /api/admin/sales?id=&action=complete|reopen
//   GET    /api/admin/expenses              POST /api/admin/expenses
//   PATCH  /api/admin/expenses?id=          DELETE /api/admin/expenses?id=
//   GET    /api/admin/bundles               POST /api/admin/bundles
//   PATCH  /api/admin/bundles?id=           DELETE /api/admin/bundles?id=
//   POST   /api/admin/images?target=item|bundle&id=   PATCH (reorder)   DELETE /api/admin/images?...&url=

const money = z.number().finite();
const costEntry = z.object({ id: z.string(), label: z.string(), amount: money });

const orderInputSchema = z.object({
    orderType: z.enum(["peptides", "supplies"]).optional(),
    supplier: z.string().trim().min(1, "Supplier is required"),
    orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Order date is required"),
    currency: z.enum(["USD", "NZD"]),
    lines: z.array(
        z.object({
            id: z.string().min(1),
            itemId: z.string().min(1),
            kind: z.enum(["peptide", "supply"]),
            name: z.string().trim().min(1, "Every item needs a name"),
            variant: z.string(),
            unit: z.string(),
            catalogCode: z.string().nullable().optional(),
            use: z.enum(["stock", "expense"]).optional(),
            expenseCategory: z.enum(EXPENSE_CATEGORIES).nullable().optional(),
            packPrice: money.min(0),
            packs: z.number().int().min(0),
            unitsPerPack: z.number().int().min(1),
        })
    ),
    orderDiscountPct: money.min(0).max(100),
    supplierCharges: z.array(costEntry),
    supplierDiscounts: z.array(costEntry).optional(),
    supplierBilledTotal: money.nullable(),
    totalPaidNzd: money.nullable(),
    paymentFeesNzd: z.array(costEntry),
    extraCostsNzd: z.array(costEntry),
    manualRateUsdPerNzd: money.positive().nullable(),
    orderNumber: z.string().optional(),
    tracking: z.string(),
    notes: z.string(),
});

const receiveSchema = z.object({
    receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    lots: z.record(z.string(), z.object({ lotNumber: z.string(), expiryDate: z.string().nullable() })).optional(),
});

const itemCreateSchema = z.object({
    kind: z.enum(["peptide", "supply"]),
    name: z.string().trim().min(1),
    variant: z.string().default(""),
    unit: z.string().default("unit"),
});

const itemPatchSchema = z.object({
    name: z.string().trim().min(1).optional(),
    variant: z.string().optional(),
    unit: z.string().optional(),
    reorderLevel: z.number().int().min(0).nullable().optional(),
    sellPriceNzd: money.min(0).nullable().optional(),
    shopVisible: z.boolean().optional(),
    shopCategories: z.array(z.string()).transform(normalizeCategories).optional(),
    shopDescription: z.string().optional(),
    // Also give every other size of this product (same name and kind) these categories and description.
    applyToSizes: z.boolean().optional(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const saleInputSchema = z.object({
    customerName: z.string().trim().min(1, "Customer name is required"),
    customerContact: z.string(),
    orderDate: isoDate,
    orderNumber: z.string(),
    lines: z.array(
        z.object({
            id: z.string().min(1),
            itemId: z.string().min(1, "Choose an item on every line"),
            kind: z.enum(["peptide", "supply"]),
            name: z.string().min(1),
            variant: z.string(),
            unit: z.string(),
            qty: z.number().int().min(1, "Quantity must be at least 1"),
            unitPriceNzd: money.min(0),
            bundleName: z.string().optional(),
        })
    ),
    discountNzd: money.min(0),
    shippingChargedNzd: money.min(0),
    shippingCostNzd: money.min(0),
    paymentFeesNzd: money.min(0),
    payment: z.object({
        method: z.string(),
        amountPaidNzd: money.min(0),
        paidDate: isoDate.nullable(),
    }),
    shipping: z.object({
        status: z.enum(["not-sent", "sent", "delivered", "collected"]),
        courier: z.string(),
        tracking: z.string(),
        sentDate: isoDate.nullable(),
    }),
    notes: z.string(),
});

const expenseSchema = z.object({
    expenseDate: isoDate,
    supplier: z.string().default(""),
    category: z.enum(EXPENSE_CATEGORIES),
    orderNumber: z.string().default(""),
    notes: z.string().default(""),
    detail: z.object({
        items: z
            .array(
                z.object({
                    id: z.string().min(1),
                    name: z.string().trim().min(1, "Every item needs a name"),
                    qty: z.number().int().min(1, "Quantity must be at least 1"),
                    unitCostNzd: money.min(0),
                })
            )
            .min(1, "Add at least one item"),
        shippingNzd: money.min(0),
        taxNzd: money.min(0),
        discountNzd: money.min(0),
    }),
});

// description and amount are derived from the items so lists and totals never disagree with them.
function expenseValues(input: z.infer<typeof expenseSchema>) {
    return {
        ...input,
        description: expenseSummary(input.detail),
        amountNzd: expenseTotals(input.detail).total,
    };
}

const adjustSchema = z.object({
    itemId: z.string().min(1),
    qty: z.number().int().refine((n) => n !== 0, "Quantity cannot be zero"),
    reason: z.string().trim().min(1),
    note: z.string().default(""),
    unitCostNzd: money.min(0).nullable().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// An adjustment always stays on the item it was made for.
const adjustEditSchema = adjustSchema.omit({ itemId: true });

const bundleSchema = z.object({
    name: z.string().trim().min(1, "Name is required"),
    description: z.string().default(""),
    components: z.array(
        z.object({
            itemId: z.string().min(1),
            qty: z.number().int().min(1),
        })
    ).min(1, "Add at least one item"),
    priceNzd: money.min(0).nullable(),
    shopVisible: z.boolean().default(false),
    shopCategories: z.array(z.string()).default([]).transform(normalizeCategories),
});

class NotFoundError extends Error {}

// Midnight UTC is midday in NZ, so the date reads correctly in NZ time.
function nzDate(date?: string): Date {
    return date ? new Date(`${date}T00:00:00Z`) : new Date();
}

function orderDto(row: typeof purchaseOrders.$inferSelect) {
    const data = row.data as OrderInput;
    const calc = calculateOrder(data);
    return {
        id: row.id,
        supplier: row.supplier,
        orderDate: row.orderDate,
        status: row.status,
        data,
        receivedAt: row.receivedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        summary: {
            totalLandedNzd: calc.totalLandedNzd,
            totalUnits: calc.totalUnits,
            averagePerUnitNzd: calc.averagePerUnitNzd,
            checkStatus: calc.status,
        },
    };
}

// Stock items referenced by an order ("expense" lines never become inventory items).
function lineSnapshots(data: OrderInput) {
    return data.lines.filter((line) => !isExpenseLine(line)).map((line) => ({
        itemId: line.itemId,
        kind: line.kind,
        name: line.name,
        variant: line.variant,
        unit: line.unit,
        catalogCode: line.catalogCode ?? null,
    }));
}

async function readBody(req: any, res: any): Promise<{ ok: true; body: unknown } | { ok: false }> {
    try {
        return { ok: true, body: await parseJsonBody(req) };
    } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return { ok: false };
    }
}

function validationError(res: any, error: z.ZodError) {
    const first = error.issues[0];
    return sendJson(res, 400, {
        error: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Validation failed",
        details: error.flatten(),
    });
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function handleItems(req: any, res: any, db: Db) {
    const id = typeof req.query?.id === "string" ? req.query.id : null;

    if (req.method === "GET") {
        const rows = await db.select().from(invItems).orderBy(asc(invItems.name), asc(invItems.variant));
        return sendJson(res, 200, rows);
    }

    const read = await readBody(req, res);
    if (!read.ok) return;

    if (req.method === "POST") {
        const parsed = itemCreateSchema.safeParse(read.body);
        if (!parsed.success) return validationError(res, parsed.error);
        const [row] = await db
            .insert(invItems)
            .values({ id: crypto.randomUUID(), ...parsed.data })
            .returning();
        return sendJson(res, 201, row);
    }

    if (req.method === "PATCH" && id) {
        const parsed = itemPatchSchema.safeParse(read.body);
        if (!parsed.success) return validationError(res, parsed.error);
        const { applyToSizes, ...patch } = parsed.data;

        const row = await db.transaction(async (tx) => {
            const [updated] = await tx
                .update(invItems)
                .set({ ...patch, updatedAt: new Date() })
                .where(eq(invItems.id, id))
                .returning();
            if (!updated) return null;
            if (applyToSizes && (patch.shopCategories !== undefined || patch.shopDescription !== undefined)) {
                await tx
                    .update(invItems)
                    .set({
                        ...(patch.shopCategories !== undefined ? { shopCategories: patch.shopCategories } : {}),
                        ...(patch.shopDescription !== undefined ? { shopDescription: patch.shopDescription } : {}),
                        updatedAt: new Date(),
                    })
                    .where(and(eq(invItems.name, updated.name), eq(invItems.kind, updated.kind), ne(invItems.id, id)));
            }
            return updated;
        });
        if (!row) return sendJson(res, 404, { error: "Item not found" });
        return sendJson(res, 200, row);
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return sendJson(res, 405, { error: "Method not allowed" });
}

async function handleOrders(req: any, res: any, db: Db) {
    const id = typeof req.query?.id === "string" ? req.query.id : null;
    const action = typeof req.query?.action === "string" ? req.query.action : null;

    if (req.method === "GET") {
        if (id) {
            const [row] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
            if (!row) return sendJson(res, 404, { error: "Order not found" });
            return sendJson(res, 200, orderDto(row));
        }
        const rows = await db
            .select()
            .from(purchaseOrders)
            .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.createdAt));
        return sendJson(res, 200, rows.map(orderDto));
    }

    if (req.method === "DELETE" && id) {
        const [row] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
        if (!row) return sendJson(res, 404, { error: "Order not found" });
        if (row.status === "received") {
            return sendJson(res, 409, { error: "Undo 'received' before deleting this order." });
        }
        await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
        return sendJson(res, 200, { success: true });
    }

    const read = await readBody(req, res);
    if (!read.ok) return;

    if (req.method === "POST" && id && action === "receive") {
        const parsed = receiveSchema.safeParse(read.body);
        if (!parsed.success) return validationError(res, parsed.error);
        const receivedAt = nzDate(parsed.data.receivedDate);

        try {
            const row = await db.transaction(async (tx) => {
                const [order] = await tx
                    .select()
                    .from(purchaseOrders)
                    .where(eq(purchaseOrders.id, id))
                    .for("update");
                if (!order) throw new InventoryError("Order not found");
                if (order.status === "received") throw new InventoryError("This order has already been received.");

                const data = order.data as OrderInput;
                const calc = calculateOrder(data);
                if (data.lines.length === 0 || calc.lines.some((l) => l.landedPerUnitNzd == null || l.units <= 0)) {
                    throw new InventoryError(
                        calc.problems[0] ?? "Landed costs can't be calculated yet - check the order inputs."
                    );
                }

                await ensureItems(tx, lineSnapshots(data));

                // Expense lines become one expense per category, costed at their landed share of the order.
                const expenseLines = data.lines.filter(isExpenseLine);
                const categories = Array.from(new Set(expenseLines.map((l) => l.expenseCategory || "Other")));
                for (const category of categories) {
                    const lines = expenseLines.filter((l) => (l.expenseCategory || "Other") === category);
                    const detail = {
                        items: lines.map((line) => {
                            const result = calc.lines.find((l) => l.lineId === line.id)!;
                            return {
                                id: line.id,
                                name: [line.name, line.variant].filter(Boolean).join(" — "),
                                qty: result.units,
                                unitCostNzd: Math.round(result.landedPerUnitNzd! * 10000) / 10000,
                            };
                        }),
                        shippingNzd: 0,
                        taxNzd: 0,
                        discountNzd: 0,
                    };
                    await tx.insert(expenses).values({
                        id: crypto.randomUUID(),
                        expenseDate: order.orderDate,
                        supplier: order.supplier,
                        category,
                        orderNumber: data.orderNumber ?? "",
                        notes: "Includes its share of the order's shipping, tax and fees.",
                        detail,
                        description: expenseSummary(detail),
                        amountNzd: expenseTotals(detail).total,
                        sourceOrderId: order.id,
                    });
                }

                for (const line of data.lines) {
                    if (isExpenseLine(line)) continue;
                    const result = calc.lines.find((l) => l.lineId === line.id)!;
                    const lotInfo = parsed.data.lots?.[line.id];
                    const lotId = crypto.randomUUID();
                    const unitCostNzd = Math.round(result.landedPerUnitNzd! * 10000) / 10000;
                    await tx.insert(inventoryLots).values({
                        id: lotId,
                        itemId: line.itemId,
                        orderId: order.id,
                        orderLineId: line.id,
                        receivedAt,
                        qtyReceived: result.units,
                        qtyRemaining: result.units,
                        unitCostNzd,
                        lotNumber: lotInfo?.lotNumber ?? "",
                        expiryDate: lotInfo?.expiryDate || null,
                    });
                    await tx.insert(stockMovements).values({
                        id: crypto.randomUUID(),
                        itemId: line.itemId,
                        lotId,
                        type: "receive",
                        qty: result.units,
                        unitCostNzd,
                        refId: order.id,
                        reason: `Order from ${order.supplier}`,
                        occurredAt: receivedAt,
                    });
                }

                const [updated] = await tx
                    .update(purchaseOrders)
                    .set({ status: "received", receivedAt, updatedAt: new Date() })
                    .where(eq(purchaseOrders.id, id))
                    .returning();
                return updated;
            });
            return sendJson(res, 200, orderDto(row));
        } catch (error) {
            if (error instanceof InventoryError) return sendJson(res, 409, { error: error.message });
            throw error;
        }
    }

    if (req.method === "POST" && id && action === "unreceive") {
        try {
            const row = await db.transaction(async (tx) => {
                const [order] = await tx
                    .select()
                    .from(purchaseOrders)
                    .where(eq(purchaseOrders.id, id))
                    .for("update");
                if (!order) throw new InventoryError("Order not found");
                if (order.status !== "received") throw new InventoryError("This order hasn't been received.");

                const lots = await tx
                    .select()
                    .from(inventoryLots)
                    .where(eq(inventoryLots.orderId, id))
                    .for("update");
                if (lots.some((lot) => lot.qtyRemaining !== lot.qtyReceived)) {
                    throw new InventoryError(
                        "Some stock from this order has already been sold or adjusted, so it can't be changed or un-received."
                    );
                }
                // Returned so "Edit order" can receive it again with the same date and lot details.
                const previousLots = Object.fromEntries(
                    lots
                        .filter((lot) => lot.orderLineId)
                        .map((lot) => [lot.orderLineId!, { lotNumber: lot.lotNumber, expiryDate: lot.expiryDate }])
                );
                const previousReceivedDate = order.receivedAt ? order.receivedAt.toISOString().slice(0, 10) : null;
                const lotIds = lots.map((lot) => lot.id);
                if (lotIds.length > 0) {
                    await tx.delete(stockMovements).where(inArray(stockMovements.lotId, lotIds));
                    await tx.delete(inventoryLots).where(inArray(inventoryLots.id, lotIds));
                }
                await tx.delete(expenses).where(eq(expenses.sourceOrderId, id));
                const [updated] = await tx
                    .update(purchaseOrders)
                    .set({ status: "ordered", receivedAt: null, updatedAt: new Date() })
                    .where(eq(purchaseOrders.id, id))
                    .returning();
                return { updated, previousLots, previousReceivedDate };
            });
            return sendJson(res, 200, {
                ...orderDto(row.updated),
                previousLots: row.previousLots,
                previousReceivedDate: row.previousReceivedDate,
            });
        } catch (error) {
            if (error instanceof InventoryError) return sendJson(res, 409, { error: error.message });
            throw error;
        }
    }

    if (req.method === "POST" && !id) {
        const parsed = orderInputSchema.safeParse((read.body as any)?.data);
        if (!parsed.success) return validationError(res, parsed.error);
        const data = parsed.data as OrderInput;
        await ensureItems(db, lineSnapshots(data));
        const [row] = await db
            .insert(purchaseOrders)
            .values({
                id: crypto.randomUUID(),
                supplier: data.supplier,
                orderDate: data.orderDate,
                status: "ordered",
                data,
            })
            .returning();
        return sendJson(res, 201, orderDto(row));
    }

    if (req.method === "PATCH" && id) {
        const parsed = orderInputSchema.safeParse((read.body as any)?.data);
        if (!parsed.success) return validationError(res, parsed.error);
        const data = parsed.data as OrderInput;

        const [existing] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
        if (!existing) return sendJson(res, 404, { error: "Order not found" });

        let toSave = data;
        if (existing.status === "received") {
            // Stock (and its cost) is already booked from this order - only allow the paperwork to change.
            const current = existing.data as OrderInput;
            toSave = { ...current, orderNumber: data.orderNumber, tracking: data.tracking, notes: data.notes };
        } else {
            await ensureItems(db, lineSnapshots(data));
        }

        const [row] = await db
            .update(purchaseOrders)
            .set({ supplier: toSave.supplier, orderDate: toSave.orderDate, data: toSave, updatedAt: new Date() })
            .where(eq(purchaseOrders.id, id))
            .returning();
        return sendJson(res, 200, orderDto(row));
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
}

async function handleInventory(req: any, res: any, db: Db) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return sendJson(res, 405, { error: "Method not allowed" });
    }

    const id = typeof req.query?.id === "string" ? req.query.id : null;

    if (id) {
        const [item] = await db.select().from(invItems).where(eq(invItems.id, id));
        if (!item) return sendJson(res, 404, { error: "Item not found" });
        const lots = await db
            .select()
            .from(inventoryLots)
            .where(eq(inventoryLots.itemId, id))
            .orderBy(asc(inventoryLots.receivedAt), asc(inventoryLots.createdAt));
        const movements = await db
            .select()
            .from(stockMovements)
            .where(eq(stockMovements.itemId, id))
            .orderBy(desc(stockMovements.occurredAt));
        return sendJson(res, 200, { item, lots, movements });
    }

    const items = await db.select().from(invItems).orderBy(asc(invItems.name), asc(invItems.variant));
    const openLots = await db
        .select()
        .from(inventoryLots)
        .where(gt(inventoryLots.qtyRemaining, 0))
        .orderBy(asc(inventoryLots.receivedAt), asc(inventoryLots.createdAt));

    const summary = items.map((item) => {
        const lots = openLots.filter((lot) => lot.itemId === item.id);
        const onHand = lots.reduce((total, lot) => total + lot.qtyRemaining, 0);
        const valueNzd = lots.reduce((total, lot) => total + lot.qtyRemaining * lot.unitCostNzd, 0);
        return {
            item,
            onHand,
            valueNzd,
            averageCostNzd: onHand > 0 ? valueNzd / onHand : null,
            nextCostNzd: lots[0]?.unitCostNzd ?? null, // cost of the next unit out (oldest batch)
            openLots: lots.length,
            // Open batches oldest-first, so the UI can estimate a sale's cost exactly as completing it will.
            fifo: lots.map((lot) => ({ qty: lot.qtyRemaining, unitCostNzd: lot.unitCostNzd })),
            nextExpiry:
                lots
                    .map((lot) => lot.expiryDate)
                    .filter((d): d is string => Boolean(d))
                    .sort()[0] ?? null,
        };
    });
    return sendJson(res, 200, summary);
}

// The yyyy-mm-dd a timestamp falls on in NZ.
function nzDateString(date: Date): string {
    return date.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
}

async function applyAdjustment(
    tx: Tx,
    adjustmentId: string,
    itemId: string,
    qty: number,
    unitCostNzd: number | null,
    meta: { reason: string; note: string; occurredAt: Date }
) {
    if (qty < 0) {
        await consumeFifo(tx, itemId, -qty, { type: "adjust", refId: adjustmentId, ...meta });
    } else {
        await addAdjustmentLot(tx, itemId, qty, unitCostNzd, { refId: adjustmentId, ...meta });
    }
}

async function handleAdjust(req: any, res: any, db: Db) {
    const id = typeof req.query?.id === "string" ? req.query.id : null;

    if (req.method === "POST" && !id) {
        const read = await readBody(req, res);
        if (!read.ok) return;
        const parsed = adjustSchema.safeParse(read.body);
        if (!parsed.success) return validationError(res, parsed.error);
        const { itemId, qty, reason, note, unitCostNzd, date } = parsed.data;

        const [item] = await db.select().from(invItems).where(eq(invItems.id, itemId));
        if (!item) return sendJson(res, 404, { error: "Item not found" });

        try {
            await db.transaction(async (tx) => {
                await applyAdjustment(tx, crypto.randomUUID(), itemId, qty, unitCostNzd ?? null, {
                    reason,
                    note,
                    occurredAt: nzDate(date),
                });
            });
        } catch (error) {
            if (error instanceof InventoryError) return sendJson(res, 409, { error: error.message });
            throw error;
        }
        return sendJson(res, 200, { success: true });
    }

    if (req.method === "DELETE" && id) {
        try {
            await db.transaction(async (tx) => {
                const movements = await findAdjustment(tx, id);
                if (movements.length === 0) throw new NotFoundError("Adjustment not found");
                await undoAdjustment(tx, movements);
            });
        } catch (error) {
            if (error instanceof NotFoundError) return sendJson(res, 404, { error: error.message });
            if (error instanceof InventoryError) return sendJson(res, 409, { error: error.message });
            throw error;
        }
        return sendJson(res, 200, { success: true });
    }

    if (req.method === "PATCH" && id) {
        const read = await readBody(req, res);
        if (!read.ok) return;
        const parsed = adjustEditSchema.safeParse(read.body);
        if (!parsed.success) return validationError(res, parsed.error);
        const { qty, reason, note, unitCostNzd, date } = parsed.data;

        try {
            await db.transaction(async (tx) => {
                const movements = await findAdjustment(tx, id);
                if (movements.length === 0) throw new NotFoundError("Adjustment not found");

                const first = movements[0];
                const oldQty = movements.reduce((total, m) => total + m.qty, 0);
                const oldDate = nzDateString(first.occurredAt);
                const dateChanged = date != null && date !== oldDate;
                // Blank cost on an added batch keeps the cost it already has.
                const cost = unitCostNzd ?? (oldQty > 0 ? first.unitCostNzd : null);
                const costChanged = qty > 0 && cost != null && Math.abs(cost - first.unitCostNzd) > 1e-9;

                // A removal's date doesn't affect which batches it came from, and reason/note never touch stock,
                // so those can be changed in place - even when the stock has moved on since.
                const stockChanged = qty !== oldQty || (qty > 0 && (costChanged || dateChanged));
                if (!stockChanged) {
                    await tx
                        .update(stockMovements)
                        .set({ reason, note, ...(dateChanged ? { occurredAt: nzDate(date) } : {}) })
                        .where(inArray(stockMovements.id, movements.map((m) => m.id)));
                    return;
                }

                await undoAdjustment(tx, movements);
                await applyAdjustment(tx, id, first.itemId, qty, cost, {
                    reason,
                    note,
                    occurredAt: dateChanged ? nzDate(date) : first.occurredAt,
                });
            });
        } catch (error) {
            if (error instanceof NotFoundError) return sendJson(res, 404, { error: error.message });
            if (error instanceof InventoryError) return sendJson(res, 409, { error: error.message });
            throw error;
        }
        return sendJson(res, 200, { success: true });
    }

    res.setHeader("Allow", "POST, PATCH, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
}

function saleDto(row: typeof sales.$inferSelect) {
    const data = row.data as SaleInput;
    return {
        id: row.id,
        customerName: row.customerName,
        orderDate: row.orderDate,
        status: row.status,
        data,
        cogsNzd: row.cogsNzd,
        costDetail: (row.costDetail as Record<string, number> | null) ?? null,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        totals: saleTotals(data),
        ...saleProfit(data, row.cogsNzd),
    };
}

async function handleSales(req: any, res: any, db: Db) {
    const id = typeof req.query?.id === "string" ? req.query.id : null;
    const action = typeof req.query?.action === "string" ? req.query.action : null;

    if (req.method === "GET") {
        if (id) {
            const [row] = await db.select().from(sales).where(eq(sales.id, id));
            if (!row) return sendJson(res, 404, { error: "Customer order not found" });
            return sendJson(res, 200, saleDto(row));
        }
        const rows = await db.select().from(sales).orderBy(desc(sales.orderDate), desc(sales.createdAt));
        return sendJson(res, 200, rows.map(saleDto));
    }

    if (req.method === "DELETE" && id) {
        const [row] = await db.select().from(sales).where(eq(sales.id, id));
        if (!row) return sendJson(res, 404, { error: "Customer order not found" });
        if (row.status === "completed") {
            return sendJson(res, 409, { error: "Reopen this order (to put its stock back) before deleting it." });
        }
        await db.delete(sales).where(eq(sales.id, id));
        return sendJson(res, 200, { success: true });
    }

    const read = await readBody(req, res);
    if (!read.ok) return;

    if (req.method === "POST" && id && (action === "complete" || action === "reopen")) {
        const completedDate = (read.body as any)?.completedDate;
        try {
            const row = await db.transaction(async (tx) => {
                const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).for("update");
                if (!sale) throw new InventoryError("Customer order not found");
                const data = sale.data as SaleInput;

                if (action === "reopen") {
                    if (sale.status !== "completed") throw new InventoryError("This order isn't completed.");
                    await restoreSaleStock(tx, sale.id);
                    const [updated] = await tx
                        .update(sales)
                        .set({ status: "open", cogsNzd: null, costDetail: null, completedAt: null, updatedAt: new Date() })
                        .where(eq(sales.id, id))
                        .returning();
                    return updated;
                }

                if (sale.status === "completed") throw new InventoryError("This order is already completed.");
                if (data.lines.length === 0) throw new InventoryError("Add at least one item before completing.");

                const occurredAt = nzDate(
                    typeof completedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(completedDate) ? completedDate : undefined
                );
                const costDetail: Record<string, number> = {};
                let cogs = 0;
                for (const line of data.lines) {
                    try {
                        const taken = await consumeFifo(tx, line.itemId, line.qty, {
                            type: "sale",
                            refId: sale.id,
                            reason: `Customer order — ${sale.customerName}`,
                            occurredAt,
                        });
                        costDetail[line.id] = taken.totalCostNzd;
                        cogs += taken.totalCostNzd;
                    } catch (error) {
                        if (error instanceof InventoryError) {
                            throw new InventoryError(`${[line.name, line.variant].filter(Boolean).join(" ")}: ${error.message}`);
                        }
                        throw error;
                    }
                }
                const [updated] = await tx
                    .update(sales)
                    .set({
                        status: "completed",
                        cogsNzd: Math.round(cogs * 10000) / 10000,
                        costDetail,
                        completedAt: occurredAt,
                        updatedAt: new Date(),
                    })
                    .where(eq(sales.id, id))
                    .returning();
                return updated;
            });
            return sendJson(res, 200, saleDto(row));
        } catch (error) {
            if (error instanceof InventoryError) return sendJson(res, 409, { error: error.message });
            throw error;
        }
    }

    if ((req.method === "POST" && !id) || (req.method === "PATCH" && id)) {
        const parsed = saleInputSchema.safeParse((read.body as any)?.data);
        if (!parsed.success) return validationError(res, parsed.error);
        let data = parsed.data as SaleInput;

        if (req.method === "POST") {
            const [row] = await db
                .insert(sales)
                .values({ id: crypto.randomUUID(), customerName: data.customerName, orderDate: data.orderDate, status: "open", data })
                .returning();
            return sendJson(res, 201, saleDto(row));
        }

        const [existing] = await db.select().from(sales).where(eq(sales.id, id!));
        if (!existing) return sendJson(res, 404, { error: "Customer order not found" });
        if (existing.status === "completed") {
            // Stock has been taken out for these lines - they stay as they were. Everything else can change.
            data = { ...data, lines: (existing.data as SaleInput).lines };
        }
        const [row] = await db
            .update(sales)
            .set({ customerName: data.customerName, orderDate: data.orderDate, data, updatedAt: new Date() })
            .where(eq(sales.id, id!))
            .returning();
        return sendJson(res, 200, saleDto(row));
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
}

async function handleExpenses(req: any, res: any, db: Db) {
    const id = typeof req.query?.id === "string" ? req.query.id : null;

    if (req.method === "GET") {
        const rows = await db.select().from(expenses).orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
        return sendJson(res, 200, rows);
    }

    if ((req.method === "DELETE" || req.method === "PATCH") && id) {
        const [existing] = await db.select().from(expenses).where(eq(expenses.id, id));
        if (!existing) return sendJson(res, 404, { error: "Expense not found" });
        if (existing.sourceOrderId) {
            return sendJson(res, 409, {
                error: "This expense comes from a supply order. Change it on the order (undo received, edit, receive again).",
            });
        }
    }

    if (req.method === "DELETE" && id) {
        await db.delete(expenses).where(eq(expenses.id, id));
        return sendJson(res, 200, { success: true });
    }

    const read = await readBody(req, res);
    if (!read.ok) return;
    const parsed = expenseSchema.safeParse(read.body);
    if (!parsed.success) return validationError(res, parsed.error);

    if (req.method === "POST" && !id) {
        const [row] = await db
            .insert(expenses)
            .values({ id: crypto.randomUUID(), ...expenseValues(parsed.data) })
            .returning();
        return sendJson(res, 201, row);
    }

    if (req.method === "PATCH" && id) {
        const [row] = await db
            .update(expenses)
            .set({ ...expenseValues(parsed.data), updatedAt: new Date() })
            .where(eq(expenses.id, id))
            .returning();
        if (!row) return sendJson(res, 404, { error: "Expense not found" });
        return sendJson(res, 200, row);
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
}

async function handleBundles(req: any, res: any, db: Db) {
    const id = typeof req.query?.id === "string" ? req.query.id : null;

    if (req.method === "GET") {
        const rows = await db.select().from(bundles).orderBy(asc(bundles.name));
        return sendJson(res, 200, rows);
    }

    if (req.method === "DELETE" && id) {
        const [row] = await db.delete(bundles).where(eq(bundles.id, id)).returning();
        if (row) await deleteBlobs(row.images);
        return sendJson(res, 200, { success: true });
    }

    const read = await readBody(req, res);
    if (!read.ok) return;
    const parsed = bundleSchema.safeParse(read.body);
    if (!parsed.success) return validationError(res, parsed.error);

    if (req.method === "POST" && !id) {
        const [row] = await db
            .insert(bundles)
            .values({ id: crypto.randomUUID(), ...parsed.data })
            .returning();
        return sendJson(res, 201, row);
    }

    if (req.method === "PATCH" && id) {
        const [row] = await db
            .update(bundles)
            .set({ ...parsed.data, updatedAt: new Date() })
            .where(eq(bundles.id, id))
            .returning();
        if (!row) return sendJson(res, 404, { error: "Bundle not found" });
        return sendJson(res, 200, row);
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
}

// Same images, possibly in a different order.
function sameImages(next: string[], current: string[]) {
    return next.length === current.length && [...next].sort().join("\n") === [...current].sort().join("\n");
}

// Blob calls pass the read-write token explicitly. Otherwise @vercel/blob prefers Vercel's OIDC login
// whenever BLOB_STORE_ID is set, and that isn't enabled for local development.
async function deleteBlobs(urls: string[]) {
    if (urls.length === 0 || !process.env.BLOB_READ_WRITE_TOKEN) return;
    try {
        await del(urls, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch (error) {
        // The product no longer points at them, so a leftover file is harmless.
        console.error("Deleting product images failed:", error);
    }
}

const imageUploadSchema = z.object({ dataUrl: z.string() });
const imageOrderSchema = z.object({ images: z.array(z.string()) });
const IMAGE_DATA_URL = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/;

type ImageTarget = "item" | "bundle";

async function currentImages(db: Db, target: ImageTarget, id: string): Promise<string[] | null> {
    const rows =
        target === "item"
            ? await db.select({ images: invItems.images }).from(invItems).where(eq(invItems.id, id))
            : await db.select({ images: bundles.images }).from(bundles).where(eq(bundles.id, id));
    return rows[0]?.images ?? null;
}

async function saveImages(db: Db, target: ImageTarget, id: string, change: { append: string } | { set: string[] }) {
    const table = target === "item" ? invItems : bundles;
    // Appending in SQL keeps two uploads that land at once from overwriting each other.
    const images = "append" in change ? sql`${table.images} || ${JSON.stringify([change.append])}::jsonb` : change.set;
    const rows =
        target === "item"
            ? await db.update(invItems).set({ images, updatedAt: new Date() }).where(eq(invItems.id, id)).returning({ images: invItems.images })
            : await db.update(bundles).set({ images, updatedAt: new Date() }).where(eq(bundles.id, id)).returning({ images: bundles.images });
    return rows[0]?.images ?? [];
}

// Product images for the shop, stored in Vercel Blob. Each call returns the product's updated image list.
//   POST   /api/admin/images?target=item|bundle&id=          { dataUrl }  adds an image
//   PATCH  /api/admin/images?target=item|bundle&id=          { images }   reorders (first = main image)
//   DELETE /api/admin/images?target=item|bundle&id=&url=                  removes one
async function handleImages(req: any, res: any, db: Db) {
    const target = req.query?.target;
    const id = typeof req.query?.id === "string" ? req.query.id : null;
    if ((target !== "item" && target !== "bundle") || !id) {
        return sendJson(res, 400, { error: "Say which item or bundle the image belongs to." });
    }

    const images = await currentImages(db, target, id);
    if (images == null) return sendJson(res, 404, { error: target === "item" ? "Item not found" : "Bundle not found" });

    if (req.method === "DELETE") {
        const url = typeof req.query?.url === "string" ? req.query.url : "";
        if (!images.includes(url)) return sendJson(res, 404, { error: "Image not found" });
        const updated = await saveImages(db, target, id, { set: images.filter((u) => u !== url) });
        await deleteBlobs([url]);
        return sendJson(res, 200, { images: updated });
    }

    if (req.method === "PATCH") {
        const read = await readBody(req, res);
        if (!read.ok) return;
        const parsed = imageOrderSchema.safeParse(read.body);
        if (!parsed.success) return validationError(res, parsed.error);
        if (!sameImages(parsed.data.images, images)) {
            return sendJson(res, 409, { error: "The images changed while you were editing - reload and try again." });
        }
        const updated = await saveImages(db, target, id, { set: parsed.data.images });
        return sendJson(res, 200, { images: updated });
    }

    if (req.method === "POST") {
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
            return sendJson(res, 503, {
                error: "Image storage isn't set up yet. Connect a Blob store to this project in Vercel (Storage tab), then try again.",
            });
        }
        if (images.length >= MAX_IMAGES_PER_PRODUCT) {
            return sendJson(res, 409, { error: `A product can have up to ${MAX_IMAGES_PER_PRODUCT} images.` });
        }

        const read = await readBody(req, res);
        if (!read.ok) return;
        const parsed = imageUploadSchema.safeParse(read.body);
        if (!parsed.success) return validationError(res, parsed.error);
        const match = IMAGE_DATA_URL.exec(parsed.data.dataUrl);
        if (!match) return sendJson(res, 400, { error: "Images must be WebP, JPEG or PNG." });
        const bytes = Buffer.from(match[2], "base64");
        if (bytes.length > MAX_IMAGE_BYTES) return sendJson(res, 413, { error: "That image is too large." });

        const ext = match[1] === "jpeg" ? "jpg" : match[1];
        const folder = id.replace(/[^\w-]/g, "_");
        let blob;
        try {
            blob = await put(`shop/${target}/${folder}/${crypto.randomUUID()}.${ext}`, bytes, {
                access: "public",
                contentType: `image/${match[1]}`,
                token: process.env.BLOB_READ_WRITE_TOKEN,
            });
        } catch (error) {
            console.error("Image upload failed:", error);
            return sendJson(res, 502, { error: `Image storage refused the upload: ${(error as Error).message}` });
        }
        const updated = await saveImages(db, target, id, { append: blob.url });
        return sendJson(res, 200, { images: updated });
    }

    res.setHeader("Allow", "POST, PATCH, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
}

export default async function handler(req: any, res: any) {
    const { userId, isAdmin } = await getAdminStatus(req);
    if (!userId) {
        return sendJson(res, 401, { error: "Unauthenticated" });
    }

    const resource = req.query?.resource;

    // The only admin endpoint regular users may call: tells the app whether to show the Admin tab.
    if (resource === "me") {
        return sendJson(res, 200, { isAdmin });
    }

    if (!isAdmin) {
        return sendJson(res, 403, { error: "Forbidden" });
    }

    let db: Db;
    try {
        db = getDb();
    } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message });
    }

    try {
        switch (resource) {
            case "items":
                return await handleItems(req, res, db);
            case "orders":
                return await handleOrders(req, res, db);
            case "inventory":
                return await handleInventory(req, res, db);
            case "adjust":
                return await handleAdjust(req, res, db);
            case "sales":
                return await handleSales(req, res, db);
            case "expenses":
                return await handleExpenses(req, res, db);
            case "bundles":
                return await handleBundles(req, res, db);
            case "images":
                return await handleImages(req, res, db);
            default:
                return sendJson(res, 404, { error: "Not found" });
        }
    } catch (error) {
        console.error(`Admin ${resource} request failed:`, error);
        return sendJson(res, 500, { error: "Request failed" });
    }
}
