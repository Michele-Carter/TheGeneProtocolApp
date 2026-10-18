import type { CheckStatus, ItemKind, OrderInput } from "../../shared/landedCost";
import type { EXPENSE_CATEGORIES, SaleInput, SaleTotals } from "../../shared/sales";
import type { ExpenseDetail } from "../../shared/expenses";
import type { BundleInput } from "../../shared/bundles";
import type { ShippingAddress } from "../../shared/customers";
import type { ChatMessage, Conversation, ItemShopSection, OrderAlertsInfo, PaymentDetails, SetupStatus, ShopOrderLine, ShopOrderStatus } from "../../shared/shop";
import type { PushSubscriptionData } from "./orderAlerts";
import type { SupplierProduct } from "../../shared/library";
import { ApiError, businessHeaders, type BusinessContext } from "./business";
import { signedInFetch } from "./signedInFetch";
import { appLocale, businessToday, homeCurrency } from "./locale";
import { moneyPrefix } from "../../shared/countries";

export interface SupplierProductRecord extends SupplierProduct {
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export type SupplierProductInput = Omit<SupplierProduct, "id">;

export interface SaleRecord {
  id: string;
  customerId: string | null;
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
  sendTo: ShippingAddress | null; // where to post it (see api/admin sendToAddresses)
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

export interface BundleRecord extends BundleInput {
  id: string;
  images: string[]; // first is the main image
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInput {
  name: string;
  email: string;
  shippingAddress: ShippingAddress;
  notes: string;
}

export interface CustomerStats {
  orders: number;
  openOrders: number;
  spentNzd: number; // completed orders
  profitNzd: number; // completed orders
  owedNzd: number;
  lastOrderDate: string | null;
}

export interface CustomerRecord extends CustomerInput {
  id: string;
  hasLogin: boolean; // linked to an app login
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSummary extends CustomerRecord {
  stats: CustomerStats;
}

export interface CustomerDetail extends CustomerSummary {
  orders: SaleRecord[];
}

export interface ShopOrderSummary {
  id: string;
  orderNumber: number;
  status: ShopOrderStatus;
  customerId: string;
  customerName: string;
  customerEmail: string;
  units: number;
  preorder: boolean; // something was ordered beyond the stock - confirm once it arrives
  subtotalNzd: number;
  shippingNzd: number | null;
  saleId: string | null; // the customer order it became, once confirmed
  createdAt: string;
  decidedAt: string | null;
  paymentStatus: "unpaid" | "part-paid" | "paid" | null; // from the customer order, once confirmed
  paymentReportedAt: string | null; // when the customer said they'd paid
  paymentReference: string;
  paymentToCheck: boolean; // customer says paid, not yet recorded as paid
  cancelledBy: "customer" | "owner" | null;
}

export interface ShopOrderDetail extends ShopOrderSummary {
  // available: free for this order right now; currentPriceNzd: today's shop price (null if no longer in the shop)
  lines: (ShopOrderLine & { available: number; currentPriceNzd: number | null })[];
  notes: string;
  adminMessage: string;
  shippingAddress: ShippingAddress;
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
  sellPriceNzd: number | null;
  shopVisible: boolean;
  comingSoon: boolean; // shown as "Coming soon", not orderable until it has stock
  shopCategories: string[];
  shopDescription: string;
  shopSection: ItemShopSection | null; // shop tab; null = by kind (itemSection)
  images: string[]; // first is the main image
  coaUrl: string | null; // certificate of analysis: an uploaded image/PDF or the testing lab's page
  createdAt: string;
  updatedAt: string;
}

export type ItemPatch = Partial<
  Pick<
    InvItem,
    | "name"
    | "variant"
    | "unit"
    | "reorderLevel"
    | "sellPriceNzd"
    | "shopVisible"
    | "comingSoon"
    | "shopCategories"
    | "shopDescription"
    | "shopSection"
  >
> & { applyToSizes?: boolean };

export type ImageTarget = "item" | "bundle";

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
  const response = await signedInFetch(getToken, (token) =>
    fetch(`/api/admin/${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...businessHeaders(),
        ...(init.headers ?? {}),
      },
    })
  );
  if (!response) throw new Error("You're signed out - please sign in again.");

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(body?.error ?? `Request failed (${response.status})`, response.status, body?.code ?? null);
  }
  return body as T;
}

const q = encodeURIComponent;

export const adminApi = {
  me: (t: GetToken) => adminFetch<BusinessContext>("me", { method: "GET" }, t),

  listItems: (t: GetToken) => adminFetch<InvItem[]>("items", { method: "GET" }, t),
  // Certificate of analysis for a product size: upload an image/PDF (as a data URL), set a lab link, or remove it.
  uploadCoa: (id: string, dataUrl: string, t: GetToken) =>
    adminFetch<InvItem>(`coa?id=${q(id)}`, { method: "POST", body: JSON.stringify({ dataUrl }) }, t),
  setCoaLink: (id: string, url: string, t: GetToken) =>
    adminFetch<InvItem>(`coa?id=${q(id)}`, { method: "PUT", body: JSON.stringify({ url }) }, t),
  removeCoa: (id: string, t: GetToken) => adminFetch<InvItem>(`coa?id=${q(id)}`, { method: "DELETE" }, t),
  updateItem: (id: string, patch: ItemPatch, t: GetToken) =>
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

  createItem: (data: { kind: ItemKind; name: string; variant: string; unit: string }, t: GetToken) =>
    adminFetch<InvItem>("items", { method: "POST", body: JSON.stringify(data) }, t),
  inventory: (t: GetToken) => adminFetch<InventorySummaryRow[]>("inventory", { method: "GET" }, t),
  inventoryItem: (id: string, t: GetToken) => adminFetch<InventoryDetail>(`inventory?id=${q(id)}`, { method: "GET" }, t),
  adjust: (
    payload: { itemId: string; qty: number; reason: string; note?: string; unitCostNzd?: number | null; date?: string },
    t: GetToken
  ) => adminFetch<{ success: true }>("adjust", { method: "POST", body: JSON.stringify(payload) }, t),
  updateAdjustment: (
    id: string,
    payload: { qty: number; reason: string; note?: string; unitCostNzd?: number | null; date?: string },
    t: GetToken
  ) => adminFetch<{ success: true }>(`adjust?id=${q(id)}`, { method: "PATCH", body: JSON.stringify(payload) }, t),
  deleteAdjustment: (id: string, t: GetToken) =>
    adminFetch<{ success: true }>(`adjust?id=${q(id)}`, { method: "DELETE" }, t),

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

  listBundles: (t: GetToken) => adminFetch<BundleRecord[]>("bundles", { method: "GET" }, t),
  createBundle: (data: BundleInput, t: GetToken) =>
    adminFetch<BundleRecord>("bundles", { method: "POST", body: JSON.stringify(data) }, t),
  updateBundle: (id: string, data: BundleInput, t: GetToken) =>
    adminFetch<BundleRecord>(`bundles?id=${q(id)}`, { method: "PATCH", body: JSON.stringify(data) }, t),
  deleteBundle: (id: string, t: GetToken) =>
    adminFetch<{ success: true }>(`bundles?id=${q(id)}`, { method: "DELETE" }, t),

  listCustomers: (t: GetToken) => adminFetch<CustomerSummary[]>("customers", { method: "GET" }, t),
  // Messages with customers (api/admin/messages).
  conversations: (t: GetToken) => adminFetch<{ unread: number; conversations: Conversation[] }>("messages", { method: "GET" }, t),
  unreadMessages: (t: GetToken) => adminFetch<{ unread: number }>("messages?summary=1", { method: "GET" }, t),
  conversation: (customerId: string, t: GetToken) =>
    adminFetch<{ customer: { id: string; name: string; email: string; archived: boolean }; messages: ChatMessage[] }>(
      `messages?customerId=${q(customerId)}`,
      { method: "GET" },
      t
    ),
  sendMessage: (customerId: string, body: string, t: GetToken) =>
    adminFetch<{ message: ChatMessage }>("messages", { method: "POST", body: JSON.stringify({ customerId, body }) }, t),
  markMessagesRead: (customerId: string, t: GetToken) =>
    adminFetch<{ success: true }>("messages?action=read", { method: "POST", body: JSON.stringify({ customerId }) }, t),
  archiveConversation: (customerId: string, archived: boolean, t: GetToken) =>
    adminFetch<{ success: true }>("messages?action=archive", { method: "POST", body: JSON.stringify({ customerId, archived }) }, t),
  getCustomer: (id: string, t: GetToken) => adminFetch<CustomerDetail>(`customers?id=${q(id)}`, { method: "GET" }, t),
  createCustomer: (data: CustomerInput, t: GetToken) =>
    adminFetch<CustomerRecord>("customers", { method: "POST", body: JSON.stringify(data) }, t),
  updateCustomer: (id: string, data: CustomerInput, t: GetToken) =>
    adminFetch<CustomerRecord>(`customers?id=${q(id)}`, { method: "PATCH", body: JSON.stringify(data) }, t),
  deleteCustomer: (id: string, t: GetToken) =>
    adminFetch<{ success: true }>(`customers?id=${q(id)}`, { method: "DELETE" }, t),
  mergeCustomer: (id: string, intoId: string, t: GetToken) =>
    adminFetch<CustomerRecord>(
      `customers?id=${q(id)}&action=merge`,
      { method: "POST", body: JSON.stringify({ intoId }) },
      t
    ),

  listShopOrders: (t: GetToken) => adminFetch<ShopOrderSummary[]>("shop-orders", { method: "GET" }, t),
  waitingShopOrders: (t: GetToken) =>
    adminFetch<{ waiting: number; paymentsToCheck: number }>("shop-orders?count=1", { method: "GET" }, t),
  markShopOrderPaid: (id: string, t: GetToken) =>
    adminFetch<{ success: true }>(`shop-orders?id=${q(id)}&action=mark-paid`, { method: "POST", body: "{}" }, t),
  listSupplierCatalog: (t: GetToken) => adminFetch<SupplierProductRecord[]>("supplier-catalog", { method: "GET" }, t),
  createSupplierProduct: (data: SupplierProductInput, t: GetToken) =>
    adminFetch<SupplierProductRecord>("supplier-catalog", { method: "POST", body: JSON.stringify(data) }, t),
  updateSupplierProduct: (id: string, data: SupplierProductInput, t: GetToken) =>
    adminFetch<SupplierProductRecord>(`supplier-catalog?id=${q(id)}`, { method: "PATCH", body: JSON.stringify(data) }, t),
  deleteSupplierProduct: (id: string, t: GetToken) =>
    adminFetch<{ success: true }>(`supplier-catalog?id=${q(id)}`, { method: "DELETE" }, t),

  getSettings: (t: GetToken) => adminFetch<{ paymentDetails: PaymentDetails }>("settings", { method: "GET" }, t),
  updateSettings: (data: { paymentDetails: PaymentDetails }, t: GetToken) =>
    adminFetch<{ paymentDetails: PaymentDetails }>("settings", { method: "PUT", body: JSON.stringify(data) }, t),

  // The Admin home's "Get your shop ready" checklist
  getSetup: (t: GetToken) => adminFetch<SetupStatus>("setup", { method: "GET" }, t),
  saveSetup: (data: { linkShared?: true; dismissed?: boolean }, t: GetToken) =>
    adminFetch<SetupStatus>("setup", { method: "PUT", body: JSON.stringify(data) }, t),

  // New-order notifications (Admin -> Business)
  getAlerts: (t: GetToken) => adminFetch<OrderAlertsInfo>("alerts", { method: "GET" }, t),
  subscribeAlerts: (subscription: PushSubscriptionData, device: string, t: GetToken) =>
    adminFetch<OrderAlertsInfo>("alerts?action=subscribe", { method: "POST", body: JSON.stringify({ subscription, device }) }, t),
  unsubscribeAlerts: (target: { endpoint?: string; id?: string }, t: GetToken) =>
    adminFetch<OrderAlertsInfo>("alerts?action=unsubscribe", { method: "POST", body: JSON.stringify(target) }, t),
  testAlert: (endpoint: string | null, t: GetToken) =>
    adminFetch<{ sent: boolean }>("alerts?action=test", { method: "POST", body: JSON.stringify({ endpoint }) }, t),
  getShopOrder: (id: string, t: GetToken) => adminFetch<ShopOrderDetail>(`shop-orders?id=${q(id)}`, { method: "GET" }, t),
  confirmShopOrder: (
    id: string,
    payload: { lines: { key: string; qty: number; unitPriceNzd: number }[]; shippingNzd: number; message: string },
    t: GetToken
  ) =>
    adminFetch<{ saleId: string }>(
      `shop-orders?id=${q(id)}&action=confirm`,
      { method: "POST", body: JSON.stringify(payload) },
      t
    ),
  declineShopOrder: (id: string, message: string, t: GetToken) =>
    adminFetch<{ success: true }>(
      `shop-orders?id=${q(id)}&action=decline`,
      { method: "POST", body: JSON.stringify({ message }) },
      t
    ),

  addImage: (target: ImageTarget, id: string, dataUrl: string, t: GetToken) =>
    adminFetch<{ images: string[] }>(
      `images?target=${target}&id=${q(id)}`,
      { method: "POST", body: JSON.stringify({ dataUrl }) },
      t
    ),
  reorderImages: (target: ImageTarget, id: string, images: string[], t: GetToken) =>
    adminFetch<{ images: string[] }>(
      `images?target=${target}&id=${q(id)}`,
      { method: "PATCH", body: JSON.stringify({ images }) },
      t
    ),
  removeImage: (target: ImageTarget, id: string, url: string, t: GetToken) =>
    adminFetch<{ images: string[] }>(`images?target=${target}&id=${q(id)}&url=${q(url)}`, { method: "DELETE" }, t),
};

// An amount in a given currency, labelled so currencies are never confused, e.g. "US$12.50" or "A$12.50".
export const money = (value: number | null | undefined, currency: string, digits = 2) => {
  if (value == null || !Number.isFinite(value)) return "—";
  // Avoid "-NZ$0.00" from tiny rounding leftovers.
  const rounded = Math.abs(value) < 0.5 / 10 ** digits ? 0 : value;
  const formatted = Math.abs(rounded).toLocaleString(appLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${rounded < 0 ? "−" : ""}${moneyPrefix(currency)}${formatted}`;
};

// An amount in the business's own currency (what its prices, costs and reports are in).
export const cash = (value: number | null | undefined, digits = 2) => money(value, homeCurrency(), digits);

// Today where the business is (yyyy-mm-dd).
export const todayIso = () => businessToday();
