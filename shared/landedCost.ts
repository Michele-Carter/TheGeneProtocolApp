// Landed-cost engine for supply/purchase orders.
// Lives outside api/ because in dev every /api/* URL is routed to the serverless functions,
// so the browser could not load it from there.
// Shared by the API (when stock is received) and the admin UI (live calculator),
// so it must stay free of Node- or browser-only imports.
//
// Rules:
// - Product cost is each line's own price (after the order discount %), converted to NZD.
// - Every other cost on the order (supplier-side freight/adjustments, payment fees,
//   customs, GST, courier...) is spread EQUALLY across every individual unit received
//   (e.g. each vial in a 10-vial kit counts as one unit).
// - The exchange rate is the effective one: NZD actually converted / supplier total.

export type SupplierCurrency = "USD" | "NZD";
export type ItemKind = "peptide" | "supply";
export type OrderType = "peptides" | "supplies";

export interface CostEntry {
  id: string;
  label: string;
  amount: number;
}

export interface OrderLineInput {
  id: string;
  itemId: string;
  kind: ItemKind;
  name: string;
  variant: string;
  unit: string;
  catalogCode?: string | null;
  packPrice: number; // supplier currency, price per kit/pack
  packs: number; // number of kits/packs ordered
  unitsPerPack: number; // individual units in each kit/pack (e.g. 10 vials)
  // Supplies orders only: "expense" lines (bubble wrap, a printer...) share the order's costs like
  // everything else but become an Expense when received instead of going into stock.
  use?: "stock" | "expense";
  expenseCategory?: string | null;
}

export function isExpenseLine(line: Pick<OrderLineInput, "use">): boolean {
  return line.use === "expense";
}

export interface OrderInput {
  // Missing on orders saved before order types existed - use orderTypeOf().
  orderType?: OrderType;
  supplier: string;
  orderDate: string; // yyyy-mm-dd
  currency: SupplierCurrency;
  lines: OrderLineInput[];
  orderDiscountPct: number;
  // Supplier-side charges in the supplier's currency (freight, rounding adjustments...). May be negative.
  supplierCharges: CostEntry[];
  // Fixed-amount coupons/discounts in the supplier's currency, entered as positive amounts.
  // Like other non-product costs they are spread equally per unit. (Missing on older orders.)
  supplierDiscounts?: CostEntry[];
  // What the supplier actually billed, in their currency. Only used as a check.
  supplierBilledTotal: number | null;
  // Total that left your account for the supplier payment, in NZD (incl. the fees below).
  totalPaidNzd: number | null;
  // Fees already included in totalPaidNzd (e.g. Wise fee, card/bank fee).
  paymentFeesNzd: CostEntry[];
  // Costs paid separately in NZD (customs, GST, courier clearance...).
  extraCostsNzd: CostEntry[];
  // Fallback when nothing has been paid yet: 1 NZD = x USD (as Wise displays it).
  manualRateUsdPerNzd: number | null;
  orderNumber?: string; // supplier order / invoice number
  tracking: string;
  notes: string;
}

export interface LineResult {
  lineId: string;
  units: number;
  grossSupplier: number;
  discountSupplier: number;
  netSupplier: number;
  productNzd: number | null;
  sharedNzd: number | null;
  landedLineNzd: number | null;
  landedPerPackNzd: number | null;
  landedPerUnitNzd: number | null;
}

export type CheckStatus = "matches" | "mismatch" | "not-checked";

export interface OrderResult {
  totalUnits: number;
  totalPacks: number;
  grossSupplier: number;
  discountSupplier: number;
  productsNetSupplier: number;
  supplierChargesTotal: number;
  supplierDiscountsTotal: number;
  calcSupplierTotal: number;
  supplierBilledDiff: number | null;
  paymentFeesTotalNzd: number;
  extraCostsTotalNzd: number;
  convertedNzd: number | null; // NZD that paid the supplier (after fees)
  paymentDiffNzd: number | null; // NZD orders only: paid vs expected
  rateNzdPerSupplier: number | null;
  rateSource: "fixed" | "payment" | "manual" | null;
  sharedCostsNzd: number | null;
  sharedPerUnitNzd: number | null;
  totalLandedNzd: number | null;
  averagePerUnitNzd: number | null;
  status: CheckStatus;
  problems: string[];
  lines: LineResult[];
}

const TOLERANCE = 0.005;

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sum(entries: CostEntry[] | undefined): number {
  return (entries ?? []).reduce((total, entry) => total + num(entry.amount), 0);
}

export function lineUnits(line: Pick<OrderLineInput, "packs" | "unitsPerPack">): number {
  return Math.max(0, num(line.packs)) * Math.max(0, num(line.unitsPerPack));
}

export function calculateOrder(order: OrderInput): OrderResult {
  const problems: string[] = [];
  const discountPct = num(order.orderDiscountPct);

  const base = order.lines.map((line) => {
    const units = lineUnits(line);
    const grossSupplier = num(line.packPrice) * Math.max(0, num(line.packs));
    const discountSupplier = (grossSupplier * discountPct) / 100;
    return { line, units, grossSupplier, discountSupplier, netSupplier: grossSupplier - discountSupplier };
  });

  const totalUnits = base.reduce((t, b) => t + b.units, 0);
  const totalPacks = order.lines.reduce((t, l) => t + Math.max(0, num(l.packs)), 0);
  const grossSupplier = base.reduce((t, b) => t + b.grossSupplier, 0);
  const discountSupplier = base.reduce((t, b) => t + b.discountSupplier, 0);
  const productsNetSupplier = grossSupplier - discountSupplier;
  const supplierChargesTotal = sum(order.supplierCharges);
  const supplierDiscountsTotal = (order.supplierDiscounts ?? []).reduce((t, e) => t + Math.abs(num(e.amount)), 0);
  const calcSupplierTotal = productsNetSupplier + supplierChargesTotal - supplierDiscountsTotal;
  const paymentFeesTotalNzd = sum(order.paymentFeesNzd);
  const extraCostsTotalNzd = sum(order.extraCostsNzd);

  const supplierBilledDiff =
    order.supplierBilledTotal != null && Number.isFinite(order.supplierBilledTotal)
      ? order.supplierBilledTotal - calcSupplierTotal
      : null;

  const paid =
    order.totalPaidNzd != null && Number.isFinite(order.totalPaidNzd) ? order.totalPaidNzd : null;
  const convertedNzd = paid != null ? paid - paymentFeesTotalNzd : null;

  let rateNzdPerSupplier: number | null = null;
  let rateSource: OrderResult["rateSource"] = null;
  let paymentDiffNzd: number | null = null;

  if (order.currency === "NZD") {
    rateNzdPerSupplier = 1;
    rateSource = "fixed";
    if (convertedNzd != null) {
      paymentDiffNzd = convertedNzd - calcSupplierTotal;
    }
  } else if (convertedNzd != null && calcSupplierTotal > 0) {
    rateNzdPerSupplier = convertedNzd / calcSupplierTotal;
    rateSource = "payment";
  } else if (order.manualRateUsdPerNzd != null && order.manualRateUsdPerNzd > 0) {
    rateNzdPerSupplier = 1 / order.manualRateUsdPerNzd;
    rateSource = "manual";
  }

  if (order.lines.length === 0) problems.push("Add at least one item.");
  if (base.some((b) => b.units <= 0)) problems.push("Every item needs a quantity and units per kit/pack.");
  if (rateNzdPerSupplier == null) {
    problems.push("Enter the total paid in NZD (or an exchange rate) to work out NZD costs.");
  }
  if (supplierBilledDiff != null && Math.abs(supplierBilledDiff) >= TOLERANCE) {
    const symbol = order.currency === "USD" ? "US$" : "NZ$";
    problems.push(
      `The supplier billed ${symbol}${Math.abs(supplierBilledDiff).toFixed(2)} ${supplierBilledDiff < 0 ? "less" : "more"} than the items and charges add up to. If that's right, add it as an adjustment.`
    );
  }
  if (paymentDiffNzd != null && Math.abs(paymentDiffNzd) >= TOLERANCE) {
    problems.push(
      `You paid NZ${Math.abs(paymentDiffNzd).toFixed(2)} ${paymentDiffNzd < 0 ? "less" : "more"} than the items and charges add up to. If that's right, add it as an adjustment.`
    );
  }
  if (convertedNzd != null && convertedNzd <= 0) {
    problems.push("Payment fees are larger than the total paid.");
  }

  const sharedCostsNzd =
    rateNzdPerSupplier != null
      ? (supplierChargesTotal - supplierDiscountsTotal) * rateNzdPerSupplier + paymentFeesTotalNzd + extraCostsTotalNzd
      : null;
  const sharedPerUnitNzd = sharedCostsNzd != null && totalUnits > 0 ? sharedCostsNzd / totalUnits : null;

  const lines: LineResult[] = base.map((b) => {
    const productNzd = rateNzdPerSupplier != null ? b.netSupplier * rateNzdPerSupplier : null;
    const sharedNzd = sharedPerUnitNzd != null ? sharedPerUnitNzd * b.units : null;
    const landedLineNzd = productNzd != null && sharedNzd != null ? productNzd + sharedNzd : null;
    const landedPerUnitNzd = landedLineNzd != null && b.units > 0 ? landedLineNzd / b.units : null;
    return {
      lineId: b.line.id,
      units: b.units,
      grossSupplier: b.grossSupplier,
      discountSupplier: b.discountSupplier,
      netSupplier: b.netSupplier,
      productNzd,
      sharedNzd,
      landedLineNzd,
      landedPerUnitNzd,
      landedPerPackNzd: landedPerUnitNzd != null ? landedPerUnitNzd * Math.max(0, num(b.line.unitsPerPack)) : null,
    };
  });

  const totalLandedNzd = lines.every((l) => l.landedLineNzd != null)
    ? lines.reduce((t, l) => t + (l.landedLineNzd ?? 0), 0)
    : null;

  const checked = supplierBilledDiff != null || paymentDiffNzd != null;
  const status: CheckStatus = problems.length > 0 ? "mismatch" : checked ? "matches" : "not-checked";

  return {
    totalUnits,
    totalPacks,
    grossSupplier,
    discountSupplier,
    productsNetSupplier,
    supplierChargesTotal,
    supplierDiscountsTotal,
    calcSupplierTotal,
    supplierBilledDiff,
    paymentFeesTotalNzd,
    extraCostsTotalNzd,
    convertedNzd,
    paymentDiffNzd,
    rateNzdPerSupplier,
    rateSource,
    sharedCostsNzd,
    sharedPerUnitNzd,
    totalLandedNzd,
    averagePerUnitNzd: totalLandedNzd != null && totalUnits > 0 ? totalLandedNzd / totalUnits : null,
    status,
    problems,
    lines,
  };
}

export function orderTypeOf(order: Pick<OrderInput, "orderType" | "lines">): OrderType {
  if (order.orderType) return order.orderType;
  return order.lines.length > 0 && order.lines.every((line) => line.kind === "supply") ? "supplies" : "peptides";
}

export function emptyOrder(today: string): OrderInput {
  return {
    orderType: "peptides",
    supplier: "",
    orderDate: today,
    currency: "USD",
    lines: [],
    orderDiscountPct: 0,
    supplierCharges: [],
    supplierDiscounts: [],
    supplierBilledTotal: null,
    totalPaidNzd: null,
    paymentFeesNzd: [],
    extraCostsNzd: [],
    manualRateUsdPerNzd: null,
    orderNumber: "",
    tracking: "",
    notes: "",
  };
}
