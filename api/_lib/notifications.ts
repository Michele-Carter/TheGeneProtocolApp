import { eq } from "drizzle-orm";
import { getDb } from "./db.js";
import { notifications, shopOrders } from "./schema.js";
import type { NotificationKind } from "../../shared/shop.js";
import type { SaleInput } from "../../shared/sales.js";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

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
    body: [`Total ${money(totalNzd)} including shipping.`, adminMessage].filter(Boolean).join("\n\n"),
  };
}

export function declinedMessage(orderNumber: number, adminMessage: string) {
  return {
    kind: "declined" as const,
    title: `Order #${orderNumber} declined`,
    body: adminMessage || "Sorry, we can't fill this order right now.",
  };
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
