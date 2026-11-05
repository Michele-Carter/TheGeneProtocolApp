// One-off fix (2026-11-05): The Gene Protocol's Pharmacy Direct order of 28 Aug 2026 had its box of pen needles
// entered as 1 needle instead of 100, so that one needle cost $19.54 (sold to Sarah B) and the owner added the other
// 99 with a +99 adjustment. This corrects the order to 100 and costs everything the way receiving it would have:
//   - the order's shipping is re-split over 301 units, so its needles, wipes and cream expense are re-costed
//   - the order's batches and every stock movement from them get the new costs (needle batch: 100 received, 99 left)
//   - customer orders that used those batches get their cost of stock corrected
//   - the +99 adjustment and its batch are deleted (those needles now come from the order)
// Needles on hand don't change. Everything happens in one transaction. Without --apply it's a trial run: it makes the
// changes, prints them, then rolls everything back.
// Usage (live): powershell -ExecutionPolicy Bypass -File scripts/runLive.ps1 scripts/fixPharmacyNeedles.ts [--apply]
import dotenv from "dotenv";
import postgres from "postgres";
import { calculateOrder, type OrderInput } from "../shared/landedCost";
import { expenseSummary, expenseTotals, type ExpenseDetail } from "../shared/expenses";

dotenv.config({ path: ".env.local", quiet: true });
const APPLY = process.argv.includes("--apply");
const B = "tgp";
const ORDER = "986e8fa5-5af4-42bb-8f8a-096695e3e659";
const NEEDLES = "d4b62d9c-d814-4e56-94f7-25698891d00d";
const ADJUSTMENT_NOTE = "Pharmacy Direct box was entered as 1 needle instead of 100";

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1, onnotice: () => {} });
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const money = (n: number) => `$${n.toFixed(4)}`;
class TrialRun extends Error {}
function must(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(`Stopping, nothing changed: ${message}`);
}

console.log(`${APPLY ? "APPLYING" : "TRIAL RUN (rolled back)"} on ${new URL(process.env.DATABASE_URL!).host.split(".")[0]}\n`);
try {
  await sql.begin(async (tx) => {
    const onHand = async () =>
      Number((await tx`select coalesce(sum(qty_remaining), 0)::int n from inventory_lots where business_id = ${B} and item_id = ${NEEDLES}`)[0].n);
    const needlesBefore = await onHand();

    // The order: needles 1 -> 100, costed the way receiving it does.
    const [order] = await tx`select data from purchase_orders where business_id = ${B} and id = ${ORDER} and status = 'received' for update`;
    must(Boolean(order), "order not found or not received");
    const data = order.data as OrderInput;
    const line = data.lines.find((l) => l.itemId === NEEDLES);
    must(Boolean(line) && line!.packs === 1 && line!.unitsPerPack === 1, "the needle line isn't 1 x 1 any more - already fixed?");
    const fixed: OrderInput = { ...data, lines: data.lines.map((l) => (l === line ? { ...l, unitsPerPack: 100 } : l)) };
    const calc = calculateOrder(fixed);
    must(calc.lines.every((l) => l.landedPerUnitNzd != null && l.units > 0), "the corrected order can't be costed");
    const newCost = new Map(calc.lines.map((l) => [l.lineId, round4(l.landedPerUnitNzd!)]));
    await tx`update purchase_orders set data = ${tx.json(fixed as any)}, updated_at = now() where business_id = ${B} and id = ${ORDER}`;

    // Its batches and every movement from them.
    const lots = await tx`select * from inventory_lots where business_id = ${B} and order_id = ${ORDER} for update`;
    const costChange = new Map<string, { itemId: string; old: number; new: number }>();
    console.log("Batches from the order:");
    for (const lot of lots) {
      const cost = newCost.get(lot.order_line_id);
      must(cost != null, `batch ${lot.id} has no matching order line`);
      const isNeedles = lot.item_id === NEEDLES;
      if (isNeedles) must(lot.qty_received === 1, "the needle batch isn't 1 received");
      const received = isNeedles ? 100 : lot.qty_received;
      const remaining = isNeedles ? lot.qty_remaining + 99 : lot.qty_remaining;
      await tx`update inventory_lots set unit_cost_nzd = ${cost}, qty_received = ${received}, qty_remaining = ${remaining} where id = ${lot.id}`;
      await tx`update stock_movements set unit_cost_nzd = ${cost} where business_id = ${B} and lot_id = ${lot.id}`;
      if (isNeedles) await tx`update stock_movements set qty = 100 where business_id = ${B} and lot_id = ${lot.id} and type = 'receive'`;
      costChange.set(lot.id, { itemId: lot.item_id, old: Number(lot.unit_cost_nzd), new: cost });
      console.log(`  ${lot.item_id === NEEDLES ? "Needles" : "Wipes  "} ${lot.qty_received} -> ${received} received, ${lot.qty_remaining} -> ${remaining} left, ${money(Number(lot.unit_cost_nzd))} -> ${money(cost)} each`);
    }

    // Customer orders that used those batches: correct each line's cost and the order's cost of stock.
    const used = await tx`select * from stock_movements where business_id = ${B} and type = 'sale' and lot_id in ${tx(Array.from(costChange.keys()))}`;
    console.log("\nCustomer orders:");
    for (const saleId of new Set(used.map((m) => m.ref_id as string))) {
      const [sale] = await tx`select customer_name, data, cost_detail, cogs_nzd from sales where business_id = ${B} and id = ${saleId} and status = 'completed' for update`;
      must(Boolean(sale?.cost_detail), `customer order ${saleId} isn't completed with costs`);
      const costDetail = { ...(sale.cost_detail as Record<string, number>) };
      for (const m of used.filter((u) => u.ref_id === saleId)) {
        const change = costChange.get(m.lot_id)!;
        const lines = (sale.data.lines as { id: string; itemId: string }[]).filter((l) => l.itemId === change.itemId);
        must(lines.length === 1, `${sale.customer_name}'s order has ${lines.length} lines of the same item`);
        costDetail[lines[0].id] += -m.qty * (change.new - change.old);
      }
      const cogs = round4(Object.values(costDetail).reduce((t, v) => t + v, 0));
      await tx`update sales set cost_detail = ${tx.json(costDetail)}, cogs_nzd = ${cogs}, updated_at = now() where id = ${saleId}`;
      console.log(`  ${sale.customer_name}: cost of stock ${money(Number(sale.cogs_nzd))} -> ${money(cogs)} (profit up ${money(Number(sale.cogs_nzd) - cogs)})`);
    }

    // The order's expense lines (cream), costed at their new share.
    console.log("\nExpenses from the order:");
    for (const e of await tx`select * from expenses where business_id = ${B} and source_order_id = ${ORDER} for update`) {
      const detail = e.detail as ExpenseDetail;
      const items = detail.items.map((i) => ({ ...i, unitCostNzd: newCost.get(i.id) ?? i.unitCostNzd }));
      const next = { ...detail, items };
      const amount = expenseTotals(next).total;
      await tx`update expenses set detail = ${tx.json(next as any)}, amount_nzd = ${amount}, description = ${expenseSummary(next)}, updated_at = now() where id = ${e.id}`;
      console.log(`  ${e.description}: ${money(Number(e.amount_nzd))} -> ${money(amount)}`);
    }

    // The +99 adjustment: delete it and its batch (none of it may have been used).
    const adjustments = await tx`select * from stock_movements where business_id = ${B} and item_id = ${NEEDLES} and type = 'adjust' and qty = 99 and note = ${ADJUSTMENT_NOTE}`;
    must(adjustments.length === 1, `expected one +99 needle adjustment, found ${adjustments.length}`);
    const [adjustLot] = await tx`select * from inventory_lots where id = ${adjustments[0].lot_id} for update`;
    must(adjustLot && adjustLot.order_id == null && adjustLot.qty_remaining === 99 && adjustLot.qty_received === 99, "some of the +99 adjustment's needles have been used");
    await tx`delete from stock_movements where id = ${adjustments[0].id}`;
    await tx`delete from inventory_lots where id = ${adjustLot.id}`;
    console.log("\nDeleted the +99 needle adjustment and its batch.");

    const needlesAfter = await onHand();
    must(needlesAfter === needlesBefore, `needles on hand would change ${needlesBefore} -> ${needlesAfter}`);
    console.log(`Needles on hand: ${needlesBefore} -> ${needlesAfter} (unchanged)`);

    if (!APPLY) throw new TrialRun();
  });
  console.log("\nDone - saved.");
} catch (error) {
  if (!(error instanceof TrialRun)) throw error;
  console.log("\nTrial run only - everything rolled back. Run again with --apply to save.");
} finally {
  await sql.end();
}
