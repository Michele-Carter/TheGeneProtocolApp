import { and, asc, desc, eq, gt, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { del, put } from "@vercel/blob";
import { z } from "zod";
import { requireAuthUserId } from "../_lib/auth.js";
import { serveAsBusiness, type BusinessAccess, type Db } from "../_lib/business.js";
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
import { EXPENSE_CATEGORIES, emptySale, saleProfit, saleTotals, type SaleInput } from "../../shared/sales.js";
import { expenseSummary, expenseTotals } from "../../shared/expenses.js";
import {
    MAX_IMAGE_BYTES,
    MAX_IMAGES_PER_PRODUCT,
    PAYMENT_DETAILS_KEY,
    formatNzAccountNumber,
    normalizeCategories,
    toPaymentDetails,
    type ShopOrderLine,
} from "../../shared/shop.js";
import { toAddress } from "../../shared/customers.js";
import { linkCustomerByEmail } from "../_lib/customers.js";
import { availableStock, lockStock, orderDemand } from "../_lib/shopCatalog.js";
import {
    cancelShopOrderForDeletedSale,
    confirmedMessage,
    declinedMessage,
    notify,
    notifyIfPaid,
    notifyIfShipped,
} from "../_lib/notifications.js";
import {
    appSettings,
    bundles,
    customers,
    expenses,
    invItems,
    inventoryLots,
    purchaseOrders,
    sales,
    shopOrders,
    stockMovements,
    peptideLibrary,
    supplierCatalog,
} from "../_lib/schema.js";
import { LIBRARY_KINDS, libraryKey, type LibraryKind } from "../../shared/library.js";

// All owner-only endpoints live in this one function (keeps us under Vercel's function limit). Each request
// runs as the caller's own business (api/_lib/business.ts), so it only ever sees that business's records.
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
//   GET    /api/admin/customers[?id=]       POST /api/admin/customers
//   PATCH  /api/admin/customers?id=         DELETE /api/admin/customers?id=
//   POST   /api/admin/customers?id=&action=merge   { intoId }
//   GET    /api/admin/shop-orders[?id=|?count=1]
//   POST   /api/admin/shop-orders?id=&action=confirm   { lines: [{ key, qty }], shippingNzd, message }
//   POST   /api/admin/shop-orders?id=&action=decline   { message }
//   POST   /api/admin/shop-orders?id=&action=mark-paid
//   GET    /api/admin/settings              PUT /api/admin/settings   { paymentDetails }
//   PUT    /api/admin/library?kind=[&key=]  { data }  (no key = new record)   DELETE /api/admin/library?kind=&key=
//   GET    /api/admin/supplier-catalog      POST /api/admin/supplier-catalog
//   PATCH  /api/admin/supplier-catalog?id=  DELETE /api/admin/supplier-catalog?id=

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
    shopSection: z.enum(["peptides", "supplies"]).nullable().optional(),
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
    components: z
        .array(
            z.object({
                itemId: z.string().min(1),
                qty: z.number().int().min(1),
                customerChooses: z.boolean().optional(),
            })
        )
        .min(1, "Add at least one item")
        .refine((cs) => cs.filter((c) => c.customerChooses).length <= 1, "Only one item per bundle can be the customer's choice"),
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

type Tx = Db;

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
            if (
                applyToSizes &&
                (patch.shopCategories !== undefined || patch.shopDescription !== undefined || patch.shopSection !== undefined)
            ) {
                await tx
                    .update(invItems)
                    .set({
                        ...(patch.shopCategories !== undefined ? { shopCategories: patch.shopCategories } : {}),
                        ...(patch.shopDescription !== undefined ? { shopDescription: patch.shopDescription } : {}),
                        ...(patch.shopSection !== undefined ? { shopSection: patch.shopSection } : {}),
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
        customerId: row.customerId,
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
        await db.transaction(async (tx) => {
            await tx.delete(sales).where(eq(sales.id, id));
            // If it came from the shop, the customer's order is cancelled too and they're told.
            await cancelShopOrderForDeletedSale(tx, id);
        });
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
            const customer = await resolveSaleCustomer(db, data.customerName, null);
            data = { ...data, customerName: customer.name };
            const [row] = await db
                .insert(sales)
                .values({
                    id: crypto.randomUUID(),
                    customerId: customer.id,
                    customerName: customer.name,
                    orderDate: data.orderDate,
                    status: "open",
                    data,
                })
                .returning();
            return sendJson(res, 201, saleDto(row));
        }

        const [existing] = await db.select().from(sales).where(eq(sales.id, id!));
        if (!existing) return sendJson(res, 404, { error: "Customer order not found" });
        if (existing.status === "completed") {
            // Stock has been taken out for these lines - they stay as they were. Everything else can change.
            data = { ...data, lines: (existing.data as SaleInput).lines };
        }
        const customer = await resolveSaleCustomer(db, data.customerName, existing.customerId);
        data = { ...data, customerName: customer.name };
        const [row] = await db
            .update(sales)
            .set({ customerId: customer.id, customerName: customer.name, orderDate: data.orderDate, data, updatedAt: new Date() })
            .where(eq(sales.id, id!))
            .returning();
        await notifyIfShipped(db, row.id, existing.data as SaleInput, data);
        await notifyIfPaid(db, row.id, existing.data as SaleInput, data);
        return sendJson(res, 200, saleDto(row));
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
}

// The customer a sale belongs to, going by the name typed on it: the sale's current customer if the
// name still matches, otherwise the customer with that name, otherwise a new customer.
async function resolveSaleCustomer(db: Db, name: string, currentId: string | null) {
    const trimmed = name.trim();
    if (currentId) {
        const [current] = await db.select().from(customers).where(eq(customers.id, currentId));
        if (current && current.name.toLowerCase() === trimmed.toLowerCase()) return current;
    }
    const [match] = await db
        .select()
        .from(customers)
        .where(sql`lower(${customers.name}) = ${trimmed.toLowerCase()}`)
        .orderBy(asc(customers.createdAt))
        .limit(1);
    if (match) return match;
    const [created] = await db.insert(customers).values({ id: crypto.randomUUID(), name: trimmed }).returning();
    return created;
}

const addressSchema = z.object({
    line1: z.string().trim().default(""),
    line2: z.string().trim().default(""),
    suburb: z.string().trim().default(""),
    city: z.string().trim().default(""),
    postcode: z.string().trim().default(""),
    country: z.string().trim().default("New Zealand"),
});

const customerSchema = z.object({
    name: z.string().trim().min(1, "Name is required"),
    email: z.union([z.string().trim().toLowerCase().email("That email address doesn't look right"), z.literal("")]).default(""),
    shippingAddress: addressSchema,
    notes: z.string().default(""),
});

const mergeSchema = z.object({ intoId: z.string().min(1) });

function customerDto(row: typeof customers.$inferSelect) {
    return {
        id: row.id,
        hasLogin: row.clerkUserId != null,
        name: row.name,
        email: row.email,
        shippingAddress: toAddress(row.shippingAddress),
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function customerStats(rows: (typeof sales.$inferSelect)[]) {
    let spentNzd = 0;
    let profitNzd = 0;
    let owedNzd = 0;
    let lastOrderDate: string | null = null;
    for (const row of rows) {
        const data = row.data as SaleInput;
        const totals = saleTotals(data);
        owedNzd += Math.max(0, totals.balance);
        if (row.status === "completed") {
            spentNzd += totals.total;
            profitNzd += saleProfit(data, row.cogsNzd).profit ?? 0;
        }
        if (!lastOrderDate || row.orderDate > lastOrderDate) lastOrderDate = row.orderDate;
    }
    return {
        orders: rows.length,
        openOrders: rows.filter((r) => r.status === "open").length,
        spentNzd,
        profitNzd,
        owedNzd,
        lastOrderDate,
    };
}

// Another customer already using this name or email, so duplicates aren't created by accident.
async function customerClash(db: Db, input: { name: string; email: string }, exceptId: string | null) {
    const others = await db
        .select()
        .from(customers)
        .where(
            and(
                exceptId ? ne(customers.id, exceptId) : undefined,
                or(
                    sql`lower(${customers.name}) = ${input.name.toLowerCase()}`,
                    input.email ? sql`lower(${customers.email}) = ${input.email.toLowerCase()}` : sql`false`
                )
            )
        );
    const byName = others.find((c) => c.name.toLowerCase() === input.name.toLowerCase());
    if (byName) return `There's already a customer called ${byName.name}.`;
    for (const other of others) {
        // A record the app made automatically for a login, with no orders, is folded into this one on save.
        if (other.clerkUserId) {
            const [order] = await db.select({ id: sales.id }).from(sales).where(eq(sales.customerId, other.id)).limit(1);
            if (!order) continue;
        }
        return `${other.name} already uses that email address - use Merge to combine them.`;
    }
    return null;
}

// Links the app login registered with the customer's email, if there is one. The customer is already
// saved, so a problem reaching the login service doesn't fail the save - it links on a later save or sign-in.
async function linkLogin(db: Db, row: typeof customers.$inferSelect) {
    try {
        return await linkCustomerByEmail(db, row);
    } catch (error) {
        console.error("Linking customer to app login failed:", error);
        return row;
    }
}

// Keeps the name shown on a customer's orders in step with the customer record.
async function renameCustomerSales(tx: Tx | Db, customerId: string, name: string) {
    await tx
        .update(sales)
        .set({ customerName: name, data: sql`jsonb_set(${sales.data}, '{customerName}', to_jsonb(${name}::text))` })
        .where(eq(sales.customerId, customerId));
}

async function handleCustomers(req: any, res: any, db: Db) {
    const id = typeof req.query?.id === "string" ? req.query.id : null;
    const action = typeof req.query?.action === "string" ? req.query.action : null;

    if (req.method === "GET") {
        if (id) {
            const [row] = await db.select().from(customers).where(eq(customers.id, id));
            if (!row) return sendJson(res, 404, { error: "Customer not found" });
            const orders = await db
                .select()
                .from(sales)
                .where(eq(sales.customerId, id))
                .orderBy(desc(sales.orderDate), desc(sales.createdAt));
            return sendJson(res, 200, { ...customerDto(row), stats: customerStats(orders), orders: orders.map(saleDto) });
        }
        const [rows, allSales] = await Promise.all([
            db.select().from(customers).orderBy(asc(customers.name)),
            db.select().from(sales),
        ]);
        return sendJson(
            res,
            200,
            rows.map((row) => ({ ...customerDto(row), stats: customerStats(allSales.filter((s) => s.customerId === row.id)) }))
        );
    }

    if (req.method === "DELETE" && id) {
        const [order] = await db.select({ id: sales.id }).from(sales).where(eq(sales.customerId, id)).limit(1);
        if (order) {
            return sendJson(res, 409, { error: "This customer has orders. Merge them into another customer instead of deleting." });
        }
        await db.delete(customers).where(eq(customers.id, id));
        return sendJson(res, 200, { success: true });
    }

    const read = await readBody(req, res);
    if (!read.ok) return;

    if (req.method === "POST" && id && action === "merge") {
        const parsed = mergeSchema.safeParse(read.body);
        if (!parsed.success) return validationError(res, parsed.error);
        const intoId = parsed.data.intoId;
        if (intoId === id) return sendJson(res, 400, { error: "Choose a different customer to merge into." });

        try {
            const merged = await db.transaction(async (tx) => {
                const [from] = await tx.select().from(customers).where(eq(customers.id, id)).for("update");
                const [into] = await tx.select().from(customers).where(eq(customers.id, intoId)).for("update");
                if (!from || !into) throw new NotFoundError("Customer not found");
                if (from.clerkUserId && into.clerkUserId) {
                    throw new InventoryError("Both customers have their own app login, so they can't be merged.");
                }

                await tx.update(sales).set({ customerId: into.id }).where(eq(sales.customerId, from.id));
                await renameCustomerSales(tx, into.id, into.name);
                // Delete first so the login can move across without clashing with itself.
                await tx.delete(customers).where(eq(customers.id, from.id));

                const intoAddress = toAddress(into.shippingAddress);
                const [updated] = await tx
                    .update(customers)
                    .set({
                        clerkUserId: into.clerkUserId ?? from.clerkUserId,
                        email: into.email || from.email,
                        shippingAddress: intoAddress.line1.trim() ? intoAddress : toAddress(from.shippingAddress),
                        notes: [into.notes, from.notes].map((n) => n.trim()).filter(Boolean).join("\n\n"),
                        updatedAt: new Date(),
                    })
                    .where(eq(customers.id, into.id))
                    .returning();
                return updated;
            });
            return sendJson(res, 200, customerDto(merged));
        } catch (error) {
            if (error instanceof NotFoundError) return sendJson(res, 404, { error: error.message });
            if (error instanceof InventoryError) return sendJson(res, 409, { error: error.message });
            throw error;
        }
    }

    const parsed = customerSchema.safeParse(read.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const input = parsed.data;

    if ((req.method === "POST" && !id) || (req.method === "PATCH" && id)) {
        const clash = await customerClash(db, input, id);
        if (clash) return sendJson(res, 409, { error: clash });
    }

    if (req.method === "POST" && !id) {
        const [row] = await db.insert(customers).values({ id: crypto.randomUUID(), ...input }).returning();
        return sendJson(res, 201, customerDto(await linkLogin(db, row)));
    }

    if (req.method === "PATCH" && id) {
        const row = await db.transaction(async (tx) => {
            const [updated] = await tx
                .update(customers)
                .set({ ...input, updatedAt: new Date() })
                .where(eq(customers.id, id))
                .returning();
            if (updated) await renameCustomerSales(tx, id, updated.name);
            return updated;
        });
        if (!row) return sendJson(res, 404, { error: "Customer not found" });
        return sendJson(res, 200, customerDto(await linkLogin(db, row)));
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
}

// ---- Orders sent from the shop ----

const confirmSchema = z.object({
    lines: z.array(z.object({ key: z.string().min(1), qty: z.number().int().min(0).max(999) })).min(1),
    shippingNzd: money.min(0),
    message: z.string().max(2000).default(""),
});
const declineSchema = z.object({ message: z.string().max(2000).default("") });

const nzToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });

// Stock free for this order: what's available to new orders, plus what this order is itself holding back.
async function stockFreeFor(db: Db | Tx, order: typeof shopOrders.$inferSelect) {
    const available = await availableStock(db);
    const own = order.status === "submitted" ? orderDemand(order.lines) : new Map<string, number>();
    return (itemId: string) => Math.max(0, (available.get(itemId) ?? 0) + (own.get(itemId) ?? 0));
}

function lineAvailability(line: ShopOrderLine, free: (itemId: string) => number) {
    if (line.kind === "item") return free(line.refId);
    const components = line.components ?? [];
    return components.length ? Math.min(...components.map((c) => Math.floor(free(c.itemId) / Math.max(1, c.qty)))) : 0;
}

// Paid status of the customer order a confirmed shop order became (null until confirmed).
function salePaymentStatus(sale: typeof sales.$inferSelect | undefined) {
    return sale ? saleTotals(sale.data as SaleInput).paymentStatus : null;
}

function shopOrderSummary(
    row: typeof shopOrders.$inferSelect,
    customer: typeof customers.$inferSelect | undefined,
    sale: typeof sales.$inferSelect | undefined
) {
    const paymentStatus = salePaymentStatus(sale);
    return {
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        customerId: row.customerId,
        customerName: customer?.name ?? "Unknown customer",
        customerEmail: customer?.email ?? "",
        units: row.lines.reduce((t, l) => t + l.qty, 0),
        subtotalNzd: row.subtotalNzd,
        shippingNzd: row.shippingNzd,
        saleId: row.saleId,
        createdAt: row.createdAt,
        decidedAt: row.decidedAt,
        paymentStatus,
        cancelledBy: row.cancelledBy,
        paymentReportedAt: row.paymentReportedAt,
        paymentReference: row.paymentReference,
        // The customer says they've paid and it isn't recorded as paid yet - the owner should check the bank.
        paymentToCheck: row.status === "confirmed" && row.paymentReportedAt != null && paymentStatus !== "paid",
    };
}

async function salesFor(db: Db, rows: (typeof shopOrders.$inferSelect)[]) {
    const ids = rows.map((r) => r.saleId).filter((s): s is string => Boolean(s));
    const saleRows = ids.length ? await db.select().from(sales).where(inArray(sales.id, ids)) : [];
    return new Map(saleRows.map((s) => [s.id, s]));
}

// The customer-order lines a confirmed shop order becomes. A bundle is split into its components, with the
// bundle price shared across them by stock cost (as the sale editor does), so the lines add up to the price.
async function saleLinesFor(tx: Tx, lines: ShopOrderLine[]): Promise<SaleInput["lines"]> {
    const itemIds = Array.from(orderDemand(lines).keys());
    const [items, lots] = await Promise.all([
        itemIds.length ? tx.select().from(invItems).where(inArray(invItems.id, itemIds)) : Promise.resolve([]),
        itemIds.length
            ? tx
                  .select()
                  .from(inventoryLots)
                  .where(and(inArray(inventoryLots.itemId, itemIds), gt(inventoryLots.qtyRemaining, 0)))
                  .orderBy(asc(inventoryLots.receivedAt), asc(inventoryLots.createdAt))
            : Promise.resolve([]),
    ]);
    const itemsById = new Map(items.map((i) => [i.id, i]));
    const nextCost = new Map<string, number>();
    for (const lot of lots) if (!nextCost.has(lot.itemId)) nextCost.set(lot.itemId, lot.unitCostNzd);

    const describe = (itemId: string) => {
        const item = itemsById.get(itemId);
        return {
            itemId,
            kind: (item?.kind ?? "peptide") as "peptide" | "supply",
            name: item?.name ?? "Unknown item",
            variant: item?.variant ?? "",
            unit: item?.unit ?? "unit",
        };
    };

    const result: SaleInput["lines"] = [];
    for (const line of lines) {
        if (line.kind === "item") {
            result.push({ id: crypto.randomUUID(), ...describe(line.refId), qty: line.qty, unitPriceNzd: line.unitPriceNzd });
            continue;
        }
        const parts = (line.components ?? []).map((c) => {
            const qty = c.qty * line.qty;
            return { itemId: c.itemId, qty, weight: qty * (nextCost.get(c.itemId) ?? 0) };
        });
        const totalWeight = parts.reduce((t, p) => t + p.weight, 0);
        const lineTotal = line.unitPriceNzd * line.qty;
        for (const part of parts) {
            const share = totalWeight > 0 ? part.weight / totalWeight : 1 / parts.length;
            result.push({
                id: crypto.randomUUID(),
                ...describe(part.itemId),
                qty: part.qty,
                unitPriceNzd: part.qty > 0 ? (lineTotal * share) / part.qty : 0,
                bundleName: line.name,
            });
        }
    }
    return result;
}

async function handleShopOrders(req: any, res: any, db: Db) {
    const id = typeof req.query?.id === "string" ? req.query.id : null;
    const action = typeof req.query?.action === "string" ? req.query.action : null;

    if (req.method === "GET") {
        if (req.query?.count) {
            const [row] = await db
                .select({ n: sql<number>`count(*)::int` })
                .from(shopOrders)
                .where(eq(shopOrders.status, "submitted"));
            const reported = await db
                .select()
                .from(shopOrders)
                .where(and(eq(shopOrders.status, "confirmed"), isNotNull(shopOrders.paymentReportedAt)));
            const reportedSales = await salesFor(db, reported);
            const paymentsToCheck = reported.filter(
                (r) => salePaymentStatus(r.saleId ? reportedSales.get(r.saleId) : undefined) !== "paid"
            ).length;
            return sendJson(res, 200, { waiting: row?.n ?? 0, paymentsToCheck });
        }
        if (id) {
            const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, id));
            if (!order) return sendJson(res, 404, { error: "Order not found" });
            const [customer] = await db.select().from(customers).where(eq(customers.id, order.customerId));
            const free = await stockFreeFor(db, order);
            const orderSales = await salesFor(db, [order]);
            return sendJson(res, 200, {
                ...shopOrderSummary(order, customer, order.saleId ? orderSales.get(order.saleId) : undefined),
                lines: order.lines.map((line) => ({ ...line, available: lineAvailability(line, free) })),
                notes: order.notes,
                adminMessage: order.adminMessage,
                shippingAddress: toAddress(order.shippingAddress),
            });
        }
        const [rows, customerRows] = await Promise.all([
            db.select().from(shopOrders).orderBy(desc(shopOrders.createdAt)),
            db.select().from(customers),
        ]);
        const byId = new Map(customerRows.map((c) => [c.id, c]));
        const salesById = await salesFor(db, rows);
        return sendJson(
            res,
            200,
            rows.map((row) =>
                shopOrderSummary(row, byId.get(row.customerId), row.saleId ? salesById.get(row.saleId) : undefined)
            )
        );
    }

    if (req.method !== "POST" || !id || (action !== "confirm" && action !== "decline" && action !== "mark-paid")) {
        res.setHeader("Allow", "GET, POST");
        return sendJson(res, 405, { error: "Method not allowed" });
    }

    const read = await readBody(req, res);
    if (!read.ok) return;

    // Records the customer order as fully paid today (after the owner has checked the bank), keeping any payment
    // method already entered. The customer is notified the same way as when payment is entered on the sale.
    if (action === "mark-paid") {
        const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, id));
        if (!order?.saleId) return sendJson(res, 409, { error: "Only confirmed orders can be marked as paid." });
        const [sale] = await db.select().from(sales).where(eq(sales.id, order.saleId));
        if (!sale) return sendJson(res, 404, { error: "The customer order for this has been deleted." });
        const before = sale.data as SaleInput;
        const after: SaleInput = {
            ...before,
            payment: {
                method: before.payment.method || "Bank transfer",
                amountPaidNzd: Math.round(saleTotals(before).total * 100) / 100,
                paidDate: before.payment.paidDate ?? nzToday(),
            },
        };
        await db.update(sales).set({ data: after, updatedAt: new Date() }).where(eq(sales.id, sale.id));
        await notifyIfPaid(db, sale.id, before, after);
        return sendJson(res, 200, { success: true });
    }

    if (action === "decline") {
        const parsed = declineSchema.safeParse(read.body);
        if (!parsed.success) return validationError(res, parsed.error);
        const declined = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(shopOrders)
                .set({ status: "declined", adminMessage: parsed.data.message.trim(), decidedAt: new Date(), updatedAt: new Date() })
                .where(and(eq(shopOrders.id, id), eq(shopOrders.status, "submitted")))
                .returning();
            if (row) {
                await notify(tx, {
                    customerId: row.customerId,
                    shopOrderId: row.id,
                    ...declinedMessage(row.orderNumber, row.adminMessage),
                });
            }
            return row;
        });
        if (!declined) return sendJson(res, 409, { error: "This order has already been dealt with." });
        return sendJson(res, 200, { success: true });
    }

    const parsed = confirmSchema.safeParse(read.body);
    if (!parsed.success) return validationError(res, parsed.error);

    try {
        const result = await db.transaction(async (tx) => {
            // Same lock as customers sending orders, so stock can't be promised twice.
            await lockStock(tx);
            const [order] = await tx.select().from(shopOrders).where(eq(shopOrders.id, id)).for("update");
            if (!order) throw new NotFoundError("Order not found");
            if (order.status !== "submitted") throw new InventoryError("This order has already been dealt with.");

            const qtyByKey = new Map(parsed.data.lines.map((l) => [l.key, l.qty]));
            const lines = order.lines
                .map((line) => ({ ...line, qty: qtyByKey.get(line.key) ?? line.qty }))
                .filter((line) => line.qty > 0);
            if (lines.length === 0) throw new InventoryError("Every item has been removed - decline the order instead.");

            const free = await stockFreeFor(tx, order);
            for (const [itemId, qty] of orderDemand(lines)) {
                const left = free(itemId);
                if (qty <= left) continue;
                const line =
                    lines.find((l) => l.kind === "item" && l.refId === itemId) ??
                    lines.find((l) => l.components?.some((c) => c.itemId === itemId))!;
                throw new InventoryError(
                    `Not enough stock for ${[line.name, line.variant].filter(Boolean).join(" ")}: ${left} available. Reduce the quantity or remove it.`
                );
            }

            const [customer] = await tx.select().from(customers).where(eq(customers.id, order.customerId));
            if (!customer) throw new NotFoundError("This order's customer no longer exists.");

            const data: SaleInput = {
                ...emptySale(nzToday()),
                customerName: customer.name,
                customerContact: customer.email,
                orderNumber: `Shop #${order.orderNumber}`,
                lines: await saleLinesFor(tx, lines),
                shippingChargedNzd: parsed.data.shippingNzd,
                notes: order.notes ? `Customer note: ${order.notes}` : "",
            };
            const saleId = crypto.randomUUID();
            await tx.insert(sales).values({
                id: saleId,
                customerId: customer.id,
                customerName: customer.name,
                orderDate: data.orderDate,
                status: "open",
                data,
            });

            const subtotal = Math.round(lines.reduce((t, l) => t + l.qty * l.unitPriceNzd, 0) * 100) / 100;
            await tx
                .update(shopOrders)
                .set({
                    status: "confirmed",
                    lines,
                    subtotalNzd: subtotal,
                    shippingNzd: parsed.data.shippingNzd,
                    adminMessage: parsed.data.message.trim(),
                    saleId,
                    decidedAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(shopOrders.id, id));
            await notify(tx, {
                customerId: customer.id,
                shopOrderId: order.id,
                ...confirmedMessage(order.orderNumber, saleTotals(data).total, parsed.data.message.trim()),
            });
            return { saleId };
        });
        return sendJson(res, 200, result);
    } catch (error) {
        if (error instanceof NotFoundError) return sendJson(res, 404, { error: error.message });
        if (error instanceof InventoryError) return sendJson(res, 409, { error: error.message });
        throw error;
    }
}

const paymentDetailsSchema = z.object({
    bankName: z.string().trim().max(100).default(""),
    accountName: z.string().trim().min(1, "Enter the account name").max(100),
    accountNumber: z
        .string()
        .transform((v, ctx) => {
            const formatted = formatNzAccountNumber(v);
            if (!formatted) {
                ctx.addIssue({ code: "custom", message: "NZ account numbers look like 12-3456-7890123-00" });
                return z.NEVER;
            }
            return formatted;
        }),
    instructions: z.string().trim().max(2000).default(""),
});

// GET / PUT /api/admin/settings - the owner's payment details (bank account customers pay into).
async function handleSettings(req: any, res: any, db: Db) {
    if (req.method === "GET") {
        const [row] = await db.select().from(appSettings).where(eq(appSettings.key, PAYMENT_DETAILS_KEY));
        return sendJson(res, 200, { paymentDetails: toPaymentDetails(row?.value) });
    }
    if (req.method === "PUT") {
        const read = await readBody(req, res);
        if (!read.ok) return;
        const parsed = paymentDetailsSchema.safeParse((read.body as any)?.paymentDetails);
        if (!parsed.success) return validationError(res, parsed.error);
        const value = parsed.data;
        await db
            .insert(appSettings)
            .values({ key: PAYMENT_DETAILS_KEY, value })
            .onConflictDoUpdate({ target: [appSettings.businessId, appSettings.key], set: { value, updatedAt: new Date() } });
        return sendJson(res, 200, { paymentDetails: value });
    }
    res.setHeader("Allow", "GET, PUT");
    return sendJson(res, 405, { error: "Method not allowed" });
}

// ---- Peptide library (the business's own copy; the app reads it from /api/library) ----

const text = z.string().trim();
const slugText = (what: string) =>
    text.min(1, `Every ${what} needs an id`).regex(/^[a-z0-9-]+$/, "Use lower-case letters, numbers and dashes in the id");

// Each kind must have the fields the app relies on; anything else in the record is kept as it is.
const libraryDataSchemas: Record<LibraryKind, z.ZodType> = {
    entry: z.looseObject({
        slug: slugText("page"),
        name: text.min(1, "Every page needs a name"),
        categories: z.array(z.string()),
    }),
    peptide: z.looseObject({
        id: slugText("peptide"),
        name: text.min(1, "Every peptide needs a name"),
        goals: z.array(z.string()),
        dosingSchedule: z.looseObject({ amount: z.string(), unit: z.enum(["mg", "mcg", "IU", "mL"]), days: z.array(z.string()) }),
    }),
    interaction: z.object({
        peptideA: text.min(1, "Choose the first peptide"),
        peptideB: text.min(1, "Choose the second peptide"),
        type: z.enum(["Synergy", "Compatible", "Caution"]),
        description: z.string(),
    }),
    "peptidedb-meta": z.object({
        molecularType: z.string(),
        typicalDose: z.string(),
        frequency: z.string(),
        cycleDuration: z.string(),
        storage: z.string(),
    }),
    "peptidedosages-meta": z.object({ reconstitution: z.string(), cycle: z.string() }),
};

async function handleLibrary(req: any, res: any, db: Db) {
    const kind = LIBRARY_KINDS.find((k) => k === req.query?.kind);
    const key = typeof req.query?.key === "string" && req.query.key ? req.query.key : null;
    if (!kind) return sendJson(res, 400, { error: "Unknown kind of library record" });

    if (req.method === "DELETE" && key) {
        const [row] = await db
            .delete(peptideLibrary)
            .where(and(eq(peptideLibrary.kind, kind), eq(peptideLibrary.key, key)))
            .returning();
        if (!row) return sendJson(res, 404, { error: "Not found" });
        // A removed peptide takes its dosing notes with it.
        if (kind === "peptide") {
            await db
                .delete(peptideLibrary)
                .where(and(inArray(peptideLibrary.kind, ["peptidedb-meta", "peptidedosages-meta"]), eq(peptideLibrary.key, key)));
        }
        return sendJson(res, 200, { success: true });
    }

    if (req.method !== "PUT") {
        res.setHeader("Allow", "PUT, DELETE");
        return sendJson(res, 405, { error: "Method not allowed" });
    }
    const read = await readBody(req, res);
    if (!read.ok) return;
    const parsed = libraryDataSchemas[kind].safeParse((read.body as any)?.data);
    if (!parsed.success) return validationError(res, parsed.error);
    const data = parsed.data as Record<string, unknown>;

    // Dosing notes are saved under their peptide's id; everything else under the key in its own data.
    const isMeta = kind === "peptidedb-meta" || kind === "peptidedosages-meta";
    const dataKey = isMeta ? key : libraryKey(kind, data);
    if (!dataKey) return sendJson(res, 400, { error: "Say which peptide these notes are for" });
    if (key && !isMeta && dataKey !== key) {
        // Saved protocols and links point at it by its id, so the id stays fixed once created.
        return sendJson(res, 400, { error: "The id can't be changed. Delete this one and add a new one instead." });
    }

    // Notes belong to one of this business's peptides; an edit must be of a record this business has.
    const mustExist = isMeta ? { kind: "peptide" as const, key: dataKey } : key ? { kind, key } : null;
    if (mustExist) {
        const [found] = await db
            .select({ key: peptideLibrary.key })
            .from(peptideLibrary)
            .where(and(eq(peptideLibrary.kind, mustExist.kind), eq(peptideLibrary.key, mustExist.key)));
        if (!found) return sendJson(res, 404, { error: "Not found" });
    }

    if (!key) {
        const [existing] = await db
            .select({ key: peptideLibrary.key })
            .from(peptideLibrary)
            .where(and(eq(peptideLibrary.kind, kind), eq(peptideLibrary.key, dataKey)));
        if (existing) {
            return sendJson(res, 409, {
                error: kind === "interaction" ? "Those two peptides already have an interaction." : "There's already one with that id - choose another.",
            });
        }
    }

    const [{ next }] = await db
        .select({ next: sql<number>`coalesce(max(${peptideLibrary.sort}), -1)::int + 1` })
        .from(peptideLibrary)
        .where(eq(peptideLibrary.kind, kind));
    const [row] = await db
        .insert(peptideLibrary)
        .values({ kind, key: dataKey, sort: next, data })
        .onConflictDoUpdate({
            target: [peptideLibrary.businessId, peptideLibrary.kind, peptideLibrary.key],
            set: { data, updatedAt: new Date() },
        })
        .returning({ kind: peptideLibrary.kind, key: peptideLibrary.key, data: peptideLibrary.data });
    return sendJson(res, 200, row);
}

// ---- Supplier price list (quick picks on supplier orders) ----

const supplierProductSchema = z.object({
    name: text.min(1, "Every product needs a name"),
    note: z.string().default(""),
    options: z
        .array(
            z.object({
                code: text.max(40).optional().transform((c) => c || undefined),
                vialSize: text.min(1, "Every size needs a description, e.g. 10mg"),
                priceUsd: money.min(0),
                inStock: z.boolean().optional(),
            })
        )
        .min(1, "Add at least one size")
        .refine((options) => {
            const codes = options.map((o) => o.code).filter(Boolean);
            return new Set(codes).size === codes.length;
        }, "Each size needs a different code"),
});

async function handleSupplierCatalog(req: any, res: any, db: Db) {
    const id = typeof req.query?.id === "string" ? req.query.id : null;

    if (req.method === "GET") {
        const rows = await db.select().from(supplierCatalog).orderBy(asc(supplierCatalog.sort), asc(supplierCatalog.name));
        return sendJson(res, 200, rows);
    }

    if (req.method === "DELETE" && id) {
        await db.delete(supplierCatalog).where(eq(supplierCatalog.id, id));
        return sendJson(res, 200, { success: true });
    }

    const read = await readBody(req, res);
    if (!read.ok) return;
    const parsed = supplierProductSchema.safeParse(read.body);
    if (!parsed.success) return validationError(res, parsed.error);

    // A code already used by another product would make two products stock the same inventory item.
    const codes = parsed.data.options.map((o) => o.code).filter((c): c is string => Boolean(c));
    if (codes.length > 0) {
        const others = await db.select().from(supplierCatalog).where(id ? ne(supplierCatalog.id, id) : undefined);
        const taken = others.find((p) => (p.options as { code?: string }[]).some((o) => o.code && codes.includes(o.code)));
        if (taken) return sendJson(res, 409, { error: `${taken.name} already uses one of those codes.` });
    }

    if (req.method === "POST" && !id) {
        const [{ next }] = await db
            .select({ next: sql<number>`coalesce(max(${supplierCatalog.sort}), -1)::int + 1` })
            .from(supplierCatalog);
        const [row] = await db
            .insert(supplierCatalog)
            .values({ id: crypto.randomUUID(), ...parsed.data, sort: next })
            .returning();
        return sendJson(res, 201, row);
    }

    if (req.method === "PATCH" && id) {
        const [row] = await db
            .update(supplierCatalog)
            .set({ ...parsed.data, updatedAt: new Date() })
            .where(eq(supplierCatalog.id, id))
            .returning();
        if (!row) return sendJson(res, 404, { error: "Product not found" });
        return sendJson(res, 200, row);
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
async function handleImages(req: any, res: any, db: Db, businessId: string) {
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
            blob = await put(`shop/${businessId}/${target}/${folder}/${crypto.randomUUID()}.${ext}`, bytes, {
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
    const userId = await requireAuthUserId(req);
    if (!userId) {
        return sendJson(res, 401, { error: "Unauthenticated" });
    }
    return handleAdminRequest(req, res, userId);
}

function businessDto({ business }: BusinessAccess) {
    return { name: business.name, slug: business.slug, logoUrl: business.logoUrl };
}

export async function handleAdminRequest(req: any, res: any, userId: string) {
    const resource = req.query?.resource;

    // The only admin endpoint customers may call: tells the app whether to show the Admin tab.
    if (resource === "me") {
        return serveAsBusiness(req, res, userId, { ownersOnly: false }, async ({ access, res }) =>
            sendJson(res, 200, { isAdmin: access.role === "owner", business: businessDto(access) })
        );
    }

    return serveAsBusiness(req, res, userId, { ownersOnly: true }, async ({ db, access, res }) => {
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
                    return await handleImages(req, res, db, access.business.id);
                case "customers":
                    return await handleCustomers(req, res, db);
                case "shop-orders":
                    return await handleShopOrders(req, res, db);
                case "settings":
                    return await handleSettings(req, res, db);
                case "library":
                    return await handleLibrary(req, res, db);
                case "supplier-catalog":
                    return await handleSupplierCatalog(req, res, db);
                default:
                    return sendJson(res, 404, { error: "Not found" });
            }
        } catch (error) {
            console.error(`Admin ${resource} request failed:`, error);
            return sendJson(res, 500, { error: "Request failed" });
        }
    });
}
