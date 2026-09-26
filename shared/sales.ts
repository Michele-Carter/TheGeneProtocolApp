// Customer orders (sales): shared by the API and the admin UI.
// All money here is NZD.

import type { ItemKind } from "./landedCost.js";

export type PaymentStatus = "unpaid" | "part-paid" | "paid";
export type ShippingStatus = "not-sent" | "sent" | "delivered" | "collected";

export interface SaleLine {
  id: string;
  itemId: string;
  kind: ItemKind;
  name: string;
  variant: string;
  unit: string;
  qty: number; // individual units (vials, pens...)
  unitPriceNzd: number;
}

export interface SaleInput {
  customerName: string;
  customerContact: string;
  orderDate: string; // yyyy-mm-dd
  orderNumber: string;
  lines: SaleLine[];
  discountNzd: number; // off the whole order
  shippingChargedNzd: number; // what the customer paid for shipping
  shippingCostNzd: number; // what the courier cost you
  paymentFeesNzd: number; // e.g. card / payment provider fees
  payment: {
    method: string;
    amountPaidNzd: number;
    paidDate: string | null;
  };
  shipping: {
    status: ShippingStatus;
    courier: string;
    tracking: string;
    sentDate: string | null;
  };
  notes: string;
}

export const EXPENSE_CATEGORIES = [
  "Equipment",
  "Packaging",
  "Labels & printing",
  "Postage & courier",
  "Software & website",
  "Marketing",
  "Bank & payment fees",
  "Other",
] as const;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export interface SaleTotals {
  itemsSubtotal: number;
  total: number; // what the customer owes
  balance: number; // still to pay
  paymentStatus: PaymentStatus;
  units: number;
}

export function saleTotals(sale: SaleInput): SaleTotals {
  const itemsSubtotal = sale.lines.reduce((t, l) => t + num(l.qty) * num(l.unitPriceNzd), 0);
  const total = itemsSubtotal - num(sale.discountNzd) + num(sale.shippingChargedNzd);
  const paid = num(sale.payment?.amountPaidNzd);
  const balance = total - paid;
  const paymentStatus: PaymentStatus =
    paid <= 0.004 ? "unpaid" : balance > 0.004 ? "part-paid" : "paid";
  return {
    itemsSubtotal,
    total,
    balance,
    paymentStatus,
    units: sale.lines.reduce((t, l) => t + num(l.qty), 0),
  };
}

// Profit once the cost of the stock sold is known (exact after completion, estimated before).
export function saleProfit(sale: SaleInput, cogsNzd: number | null) {
  const { total } = saleTotals(sale);
  if (cogsNzd == null) return { profit: null, marginPct: null };
  const profit = total - cogsNzd - num(sale.shippingCostNzd) - num(sale.paymentFeesNzd);
  return { profit, marginPct: total > 0 ? (profit / total) * 100 : null };
}

// Estimates the cost of each line by taking units from the oldest batches first,
// the same way completing the order will. `stock` maps itemId -> open batches, oldest first.
export function fifoEstimate(
  lines: SaleLine[],
  stock: Record<string, { qty: number; unitCostNzd: number }[]>
): { byLine: Record<string, number | null>; total: number | null; short: string[] } {
  const remaining: Record<string, { qty: number; unitCostNzd: number }[]> = {};
  const byLine: Record<string, number | null> = {};
  const short: string[] = [];
  let total: number | null = 0;

  for (const line of lines) {
    if (!line.itemId || num(line.qty) <= 0) {
      byLine[line.id] = null;
      continue;
    }
    remaining[line.itemId] ??= (stock[line.itemId] ?? []).map((lot) => ({ ...lot }));
    let need = num(line.qty);
    let cost = 0;
    for (const lot of remaining[line.itemId]) {
      if (need <= 0) break;
      const take = Math.min(need, lot.qty);
      lot.qty -= take;
      need -= take;
      cost += take * lot.unitCostNzd;
    }
    if (need > 0) {
      short.push(line.id);
      byLine[line.id] = null;
      total = null;
    } else {
      byLine[line.id] = cost;
      if (total != null) total += cost;
    }
  }
  return { byLine, total, short };
}

export function emptySale(today: string): SaleInput {
  return {
    customerName: "",
    customerContact: "",
    orderDate: today,
    orderNumber: "",
    lines: [],
    discountNzd: 0,
    shippingChargedNzd: 0,
    shippingCostNzd: 0,
    paymentFeesNzd: 0,
    payment: { method: "", amountPaidNzd: 0, paidDate: null },
    shipping: { status: "not-sent", courier: "", tracking: "", sentDate: null },
    notes: "",
  };
}
