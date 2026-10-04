import { eq } from "drizzle-orm";
import type { Db } from "./business.js";
import { notifications, shopOrders } from "./schema.js";
import type { NotificationKind } from "../../shared/shop.js";
import { saleTotals, type SaleInput } from "../../shared/sales.js";

type Tx = Db;

const money = (n: number) => `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function notify(
  db: Db | Tx,
  n: { customerId: string; shopOrderId: string | null; kind: NotificationKind; title: string; body: string }
) {
  await db.insert(notifications).values({ id: crypto.randomUUID(), ...n });
}

export function confirmedMessage(orderNumber: number, totalNzd: number, adminMessage: string) {
  return {
    kind: "confirmed" as const,
    title: `Order #${orderNumber} confirmed`,
    body: [`Total ${money(totalNzd)} including shipping - see My Orders for how to pay.`, adminMessage]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export function declinedMessage(orderNumber: number, adminMessage: string) {
  return {
    kind: "declined" as const,
    title: `Order #${orderNumber} declined`,
    body: adminMessage || "Sorry, we can't fill this order right now.",
  };
}

// When the owner deletes the customer order a confirmed shop order became, the shop order is cancelled
// and the customer told. Returns nothing if the sale didn't come from the shop.
export async function cancelShopOrderForDeletedSale(db: Db | Tx, saleId: string) {
  const [order] = await db
    .update(shopOrders)
    .set({ status: "cancelled", cancelledBy: "owner", saleId: null, decidedAt: new Date(), updatedAt: new Date() })
    .where(eq(shopOrders.saleId, saleId))
    .returning();
  if (!order) return;
  await notify(db, {
    customerId: order.customerId,
    shopOrderId: order.id,
    kind: "cancelled",
    title: `Order #${order.orderNumber} cancelled`,
    body: "We've cancelled this order. Please get in touch if you have any questions.",
  });
}

// When a customer order from the shop becomes fully paid (however the owner recorded it), thanks the customer.
export async function notifyIfPaid(db: Db | Tx, saleId: string, before: SaleInput, after: SaleInput) {
  if (saleTotals(before).paymentStatus === "paid" || saleTotals(after).paymentStatus !== "paid") return;
  const [order] = await db.select().from(shopOrders).where(eq(shopOrders.saleId, saleId));
  if (!order) return;
  await notify(db, {
    customerId: order.customerId,
    shopOrderId: order.id,
    kind: "paid",
    title: `Payment received for order #${order.orderNumber}`,
    body: "Thank you! We'll let you know when it's on its way.",
  });
}

// When the owner marks a customer order from the shop as sent, tells the customer it's on its way.
export async function notifyIfShipped(db: Db | Tx, saleId: string, before: SaleInput, after: SaleInput) {
  const wasSent = before.shipping.status !== "not-sent";
  const isSent = after.shipping.status === "sent" || after.shipping.status === "delivered";
  if (wasSent || !isSent) return;

  const [order] = await db.select().from(shopOrders).where(eq(shopOrders.saleId, saleId));
  if (!order) return;
  const { courier, tracking } = after.shipping;
  await notify(db, {
    customerId: order.customerId,
    shopOrderId: order.id,
    kind: "sent",
    title: `Order #${order.orderNumber} is on its way`,
    body: tracking ? `${courier ? `${courier} tracking` : "Tracking"}: ${tracking}` : courier ? `Sent with ${courier}.` : "",
  });
}
