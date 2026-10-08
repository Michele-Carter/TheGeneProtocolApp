import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { invItems, inventoryLots, stockMovements } from "./schema.js";
import type { ItemKind } from "../../shared/landedCost.js";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class InventoryError extends Error {}

export interface ItemSnapshot {
    itemId: string;
    kind: ItemKind;
    name: string;
    variant: string;
    unit: string;
    catalogCode?: string | null;
}

// Makes sure every item referenced by an order exists. Existing items are left as they are.
export async function ensureItems(tx: Tx | Db, items: ItemSnapshot[]) {
    const seen = new Set<string>();
    for (const item of items) {
        if (seen.has(item.itemId)) continue;
        seen.add(item.itemId);
        await tx
            .insert(invItems)
            .values({
                id: item.itemId,
                kind: item.kind,
                name: item.name,
                variant: item.variant ?? "",
                unit: item.unit || "unit",
                catalogCode: item.catalogCode ?? null,
            })
            .onConflictDoNothing();
    }
}

interface MovementMeta {
    type: "sale" | "adjust";
    refId?: string | null;
    reason?: string;
    note?: string;
    occurredAt?: Date;
}

// Takes `qty` units of an item out of stock, oldest batch first.
// Returns what was taken from each batch so the cost of the units is known.
export async function consumeFifo(tx: Tx, itemId: string, qty: number, meta: MovementMeta) {
    const lots = await tx
        .select()
        .from(inventoryLots)
        .where(and(eq(inventoryLots.itemId, itemId), gt(inventoryLots.qtyRemaining, 0)))
        .orderBy(asc(inventoryLots.receivedAt), asc(inventoryLots.createdAt))
        .for("update");

    const available = lots.reduce((total, lot) => total + lot.qtyRemaining, 0);
    if (available < qty) {
        throw new InventoryError(`Only ${available} in stock, cannot take out ${qty}.`);
    }

    let remaining = qty;
    const taken: { lotId: string; qty: number; unitCostNzd: number }[] = [];
    for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, lot.qtyRemaining);
        remaining -= take;
        await tx
            .update(inventoryLots)
            .set({ qtyRemaining: lot.qtyRemaining - take })
            .where(eq(inventoryLots.id, lot.id));
        await tx.insert(stockMovements).values({
            id: crypto.randomUUID(),
            itemId,
            lotId: lot.id,
            type: meta.type,
            qty: -take,
            unitCostNzd: lot.unitCostNzd,
            refId: meta.refId ?? null,
            reason: meta.reason ?? "",
            note: meta.note ?? "",
            occurredAt: meta.occurredAt ?? new Date(),
        });
        taken.push({ lotId: lot.id, qty: take, unitCostNzd: lot.unitCostNzd });
    }

    return {
        taken,
        totalCostNzd: taken.reduce((total, t) => total + t.qty * t.unitCostNzd, 0),
    };
}

// Undoes the stock taken out for a customer order: each unit goes back into the batch it came from.
export async function restoreSaleStock(tx: Tx, saleId: string) {
    const movements = await tx
        .select()
        .from(stockMovements)
        .where(and(eq(stockMovements.refId, saleId), eq(stockMovements.type, "sale")));
    for (const movement of movements) {
        if (movement.lotId) {
            await tx
                .update(inventoryLots)
                .set({ qtyRemaining: sql`${inventoryLots.qtyRemaining} + ${-movement.qty}` })
                .where(eq(inventoryLots.id, movement.lotId));
        }
        await tx.delete(stockMovements).where(eq(stockMovements.id, movement.id));
    }
}

// Adds stock that didn't come from an order (e.g. a stocktake found extra units).
// Uses the given cost, otherwise the item's most recent batch cost.
export async function addAdjustmentLot(
    tx: Tx,
    itemId: string,
    qty: number,
    unitCostNzd: number | null,
    meta: { refId?: string | null; reason?: string; note?: string; occurredAt?: Date }
) {
    let cost = unitCostNzd;
    if (cost == null) {
        const [latest] = await tx
            .select({ unitCostNzd: inventoryLots.unitCostNzd })
            .from(inventoryLots)
            .where(eq(inventoryLots.itemId, itemId))
            .orderBy(desc(inventoryLots.receivedAt))
            .limit(1);
        cost = latest?.unitCostNzd ?? 0;
    }

    const occurredAt = meta.occurredAt ?? new Date();
    const lotId = crypto.randomUUID();
    await tx.insert(inventoryLots).values({
        id: lotId,
        itemId,
        orderId: null,
        orderLineId: null,
        receivedAt: occurredAt,
        qtyReceived: qty,
        qtyRemaining: qty,
        unitCostNzd: cost,
    });
    await tx.insert(stockMovements).values({
        id: crypto.randomUUID(),
        itemId,
        lotId,
        type: "adjust",
        qty,
        unitCostNzd: cost,
        refId: meta.refId ?? null,
        reason: meta.reason ?? "",
        note: meta.note ?? "",
        occurredAt,
    });
}

// The stock movements that make up one adjustment. A removal can span several batches, so its movements
// share an adjustment id in refId. Adjustments made before that id existed are keyed by their movement id.
export async function findAdjustment(tx: Tx, adjustmentId: string) {
    return tx
        .select()
        .from(stockMovements)
        .where(
            and(
                eq(stockMovements.type, "adjust"),
                or(
                    eq(stockMovements.refId, adjustmentId),
                    and(isNull(stockMovements.refId), eq(stockMovements.id, adjustmentId))
                )
            )
        )
        .for("update");
}

// Reverses an adjustment: removed units go back to the batch they came from, and a batch the
// adjustment added is deleted - but only if none of it has been sold or used since.
export async function undoAdjustment(tx: Tx, movements: (typeof stockMovements.$inferSelect)[]) {
    for (const movement of movements) {
        if (movement.lotId && movement.qty < 0) {
            await tx
                .update(inventoryLots)
                .set({ qtyRemaining: sql`${inventoryLots.qtyRemaining} + ${-movement.qty}` })
                .where(eq(inventoryLots.id, movement.lotId));
        } else if (movement.lotId) {
            const [lot] = await tx
                .select()
                .from(inventoryLots)
                .where(eq(inventoryLots.id, movement.lotId))
                .for("update");
            if (lot && lot.qtyRemaining !== lot.qtyReceived) {
                const used = lot.qtyReceived - lot.qtyRemaining;
                throw new InventoryError(
                    `${used} of the units this adjustment added have already been sold or used, so it can't be deleted or have its quantity, cost or date changed. You can still edit the reason and note.`
                );
            }
            if (lot) await tx.delete(inventoryLots).where(eq(inventoryLots.id, lot.id));
        }
        await tx.delete(stockMovements).where(eq(stockMovements.id, movement.id));
    }
}
