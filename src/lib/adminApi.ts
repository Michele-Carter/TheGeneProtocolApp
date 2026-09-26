import type { CheckStatus, ItemKind, OrderInput } from "../../shared/landedCost";
import type { EXPENSE_CATEGORIES, SaleInput, SaleTotals } from "../../shared/sales";
import type { ExpenseDetail } from "../../shared/expenses";

export interface SaleRecord {
  id: string;
  customerName: string;
  orderDate: string;
  status: "open" | "completed";
  data: SaleInput;
  cogsNzd: number | null; // actual cost of stock sold, set when completed
  costDetail: Record<string, number> | null; // per line id
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  totals: SaleTotals;
  profit: number | null;
  marginPct: number | null;
}

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface ExpenseInput {
  expenseDate: string;
  supplier: string;
  category: ExpenseCategory;
  orderNumber: string;
  notes: string;
  detail: ExpenseDetail;
}

export interface ExpenseRecord extends Omit<ExpenseInput, "detail"> {
  id: string;
  description: string; // derived from the items
  amountNzd: number; // derived total
  detail: ExpenseDetail | null; // null on expenses saved before items existed
  sourceOrderId: string | null; // created from expense lines on this supply order
  createdAt: string;
  updatedAt: string;
}

type GetToken = () => Promise<string | null>;

export interface InvItem {
  id: string;
  kind: ItemKind;
  name: string;
  variant: string;
  unit: string;
  catalogCode: string | null;
  reorderLevel: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderRecord {
  id: string;
  supplier: string;
  orderDate: string;
  status: "ordered" | "received";
  data: OrderInput;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  summary: {
    totalLandedNzd: number | null;
    totalUnits: number;
    averagePerUnitNzd: number | null;
    checkStatus: CheckStatus;
  };
}

export interface InventorySummaryRow {
  item: InvItem;
  onHand: number;
  valueNzd: number;
  averageCostNzd: number | null;
  nextCostNzd: number | null;
  openLots: number;
  fifo: { qty: number; unitCostNzd: number }[]; // open batches, oldest first
  nextExpiry: string | null;
}

export interface InventoryLot {
  id: string;
  itemId: string;
  orderId: string | null;
  receivedAt: string;
  qtyReceived: number;
  qtyRemaining: number;
  unitCostNzd: number;
  lotNumber: string;
  expiryDate: string | null;
}

export interface StockMovement {
  id: string;
  itemId: string;
  lotId: string | null;
  type: "receive" | "sale" | "adjust";
  qty: number;
  unitCostNzd: number;
  refId: string | null;
  reason: string;
  note: string;
  occurredAt: string;
}

export interface InventoryDetail {
  item: InvItem;
  lots: InventoryLot[];
  movements: StockMovement[];
}

async function adminFetch<T>(path: string, init: RequestInit, getToken: GetToken): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("You're signed out - please sign in again.");

  const response = await fetch(`/api/admin/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return body as T;
}

const q = encodeURIComponent;

export const adminApi = {
  me: (t: GetToken) => adminFetch<{ isAdmin: boolean }>("me", { method: "GET" }, t),

  listItems: (t: GetToken) => adminFetch<InvItem[]>("items", { method: "GET" }, t),
  updateItem: (id: string, patch: Partial<Pick<InvItem, "name" | "variant" | "unit" | "reorderLevel">>, t: GetToken) =>
    adminFetch<InvItem>(`items?id=${q(id)}`, { method: "PATCH", body: JSON.stringify(patch) }, t),

  listOrders: (t: GetToken) => adminFetch<PurchaseOrderRecord[]>("orders", { method: "GET" }, t),
  createOrder: (data: OrderInput, t: GetToken) =>
    adminFetch<PurchaseOrderRecord>("orders", { method: "POST", body: JSON.stringify({ data }) }, t),
  updateOrder: (id: string, data: OrderInput, t: GetToken) =>
    adminFetch<PurchaseOrderRecord>(`orders?id=${q(id)}`, { method: "PATCH", body: JSON.stringify({ data }) }, t),
  deleteOrder: (id: string, t: GetToken) => adminFetch<{ success: true }>(`orders?id=${q(id)}`, { method: "DELETE" }, t),
  receiveOrder: (
    id: string,
    payload: { receivedDate?: string; lots?: Record<string, { lotNumber: string; expiryDate: string | null }> },
    t: GetToken
  ) =>
    adminFetch<PurchaseOrderRecord>(
      `orders?id=${q(id)}&action=receive`,
      { method: "POST", body: JSON.stringify(payload) },
      t
    ),
  unreceiveOrder: (id: string, t: GetToken) =>
    adminFetch<
      PurchaseOrderRecord & {
        previousLots: Record<string, { lotNumber: string; expiryDate: string | null }>;
        previousReceivedDate: string | null;
      }
    >(`orders?id=${q(id)}&action=unreceive`, { method: "POST", body: "{}" }, t),

  inventory: (t: GetToken) => adminFetch<InventorySummaryRow[]>("inventory", { method: "GET" }, t),
  inventoryItem: (id: string, t: GetToken) => adminFetch<InventoryDetail>(`inventory?id=${q(id)}`, { method: "GET" }, t),
  adjust: (
    payload: { itemId: string; qty: number; reason: string; note?: string; unitCostNzd?: number | null; date?: string },
    t: GetToken
  ) => adminFetch<{ success: true }>("adjust", { method: "POST", body: JSON.stringify(payload) }, t),

  listSales: (t: GetToken) => adminFetch<SaleRecord[]>("sales", { method: "GET" }, t),
  createSale: (data: SaleInput, t: GetToken) =>
    adminFetch<SaleRecord>("sales", { method: "POST", body: JSON.stringify({ data }) }, t),
  updateSale: (id: string, data: SaleInput, t: GetToken) =>
    adminFetch<SaleRecord>(`sales?id=${q(id)}`, { method: "PATCH", body: JSON.stringify({ data }) }, t),
  deleteSale: (id: string, t: GetToken) => adminFetch<{ success: true }>(`sales?id=${q(id)}`, { method: "DELETE" }, t),
  completeSale: (id: string, completedDate: string, t: GetToken) =>
    adminFetch<SaleRecord>(`sales?id=${q(id)}&action=complete`, { method: "POST", body: JSON.stringify({ completedDate }) }, t),
  reopenSale: (id: string, t: GetToken) =>
    adminFetch<SaleRecord>(`sales?id=${q(id)}&action=reopen`, { method: "POST", body: "{}" }, t),

  listExpenses: (t: GetToken) => adminFetch<ExpenseRecord[]>("expenses", { method: "GET" }, t),
  createExpense: (data: ExpenseInput, t: GetToken) =>
    adminFetch<ExpenseRecord>("expenses", { method: "POST", body: JSON.stringify(data) }, t),
  updateExpense: (id: string, data: ExpenseInput, t: GetToken) =>
    adminFetch<ExpenseRecord>(`expenses?id=${q(id)}`, { method: "PATCH", body: JSON.stringify(data) }, t),
  deleteExpense: (id: string, t: GetToken) =>
    adminFetch<{ success: true }>(`expenses?id=${q(id)}`, { method: "DELETE" }, t),
};

export const money = (value: number | null | undefined, currency: "USD" | "NZD", digits = 2) => {
  if (value == null || !Number.isFinite(value)) return "—";
  // Avoid "-NZ$0.00" from tiny rounding leftovers.
  const rounded = Math.abs(value) < 0.5 / 10 ** digits ? 0 : value;
  const formatted = Math.abs(rounded).toLocaleString("en-NZ", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${rounded < 0 ? "−" : ""}${currency === "USD" ? "US$" : "NZ$"}${formatted}`;
};

export const nzd = (value: number | null | undefined, digits = 2) => money(value, "NZD", digits);

export const todayIso = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};
