// Business expenses (things bought to run the business, not to sell). All NZD.
// An expense is one purchase that can list several items plus shipping, tax and discounts.

export interface ExpenseItem {
  id: string;
  name: string;
  qty: number;
  unitCostNzd: number;
}

export interface ExpenseDetail {
  items: ExpenseItem[];
  shippingNzd: number;
  taxNzd: number;
  discountNzd: number; // coupons / discounts, entered as a positive amount
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function expenseTotals(detail: ExpenseDetail) {
  const itemsSubtotal = detail.items.reduce((t, i) => t + num(i.qty) * num(i.unitCostNzd), 0);
  const total = itemsSubtotal + num(detail.shippingNzd) + num(detail.taxNzd) - Math.abs(num(detail.discountNzd));
  return { itemsSubtotal, total: Math.round(total * 100) / 100 };
}

// One-line description for lists, e.g. "2 × V3 Injection Pen, Label rolls".
export function expenseSummary(detail: ExpenseDetail): string {
  return detail.items
    .filter((i) => i.name.trim())
    .map((i) => (num(i.qty) > 1 ? `${i.qty} × ${i.name.trim()}` : i.name.trim()))
    .join(", ");
}

// Expenses saved before items existed only have a description and an amount.
export function detailFromLegacy(description: string, amountNzd: number, id: string): ExpenseDetail {
  return { items: [{ id, name: description, qty: 1, unitCostNzd: amountNzd }], shippingNzd: 0, taxNzd: 0, discountNzd: 0 };
}
