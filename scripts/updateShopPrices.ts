// The Gene Protocol's shop prices from the owner's price list (2026-10-12). Matches products by their code
// (catalog_code), or by name and size for the one row without a code. Products on the list that aren't in the
// app yet are added. Every peptide with a price is then shown in the shop (with no stock it's a pre-order).
// Also removes 5-Amino-1MQ 50mg (50AM), which the owner doesn't sell - only if nothing refers to it.
//
// Shows what it would change and saves nothing, unless run with --apply.
// Usage (live): powershell -ExecutionPolicy Bypass -File scripts/runLive.ps1 scripts/updateShopPrices.ts [--apply]
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env.local");

const BUSINESS = "tgp";
const APPLY = process.argv.includes("--apply");
const REMOVE_ID_CODE = "50AM";

// code: as printed on the list; also: the code the app uses where it differs.
const PRICE_LIST: { code: string | null; also?: string; name: string; size: string; price: number }[] = [
  { code: "RT5", name: "Retatrutide", size: "5mg", price: 65 },
  { code: "RT10", name: "Retatrutide", size: "10mg", price: 90 },
  { code: "RT15", name: "Retatrutide", size: "15mg", price: 110 },
  { code: "RT20", name: "Retatrutide", size: "20mg", price: 120 },
  { code: "RT30", name: "Retatrutide", size: "30mg", price: 180 },
  { code: "TR5", name: "Tirzepatide", size: "5mg", price: 65 },
  { code: "TR20", name: "Tirzepatide", size: "20mg", price: 90 },
  { code: "TSM10", name: "Tesamorelin", size: "10mg", price: 120 },
  { code: "TSM20", name: "Tesamorelin", size: "20mg", price: 200 },
  { code: "LC526", name: "Lipo-C (Fat Blaster)", size: "10ml", price: 120 },
  { code: "CU50", name: "GHK-Cu", size: "50mg", price: 35 },
  { code: "CU100", name: "GHK-Cu", size: "100mg", price: 55 },
  { code: "MS10", name: "Mots-C", size: "10mg", price: 65 },
  { code: "BBG70", name: "GLOW", size: "70mg", price: 180 },
  { code: "KLOW80", also: "BBK80", name: "KLOW (GHKCU/BPC157/TB500/KPV)", size: "80mg", price: 160 },
  { code: "BB10", name: "Wolverine Blend (BPC157/TB500)", size: "10mg", price: 90 },
  { code: "CP10", name: "CJC1295 + Ipamorelin Blend (no DAC)", size: "10mg", price: 120 },
  { code: "BBX30", name: "Deadpool", size: "30mg", price: 150 },
  { code: "BC5", name: "BPC157", size: "5mg", price: 50 },
  { code: "BC10", name: "BPC157", size: "10mg", price: 90 },
  { code: "TB5", name: "TB500", size: "5mg", price: 80 },
  { code: "TB10", name: "TB500", size: "10mg", price: 120 },
  { code: "H10", name: "HGH 191AA", size: "10iu", price: 60 },
  { code: "H15", name: "HGH 191AA", size: "15iu", price: 90 },
  { code: "XA5", name: "Semax", size: "5mg", price: 70 },
  { code: "XA10", name: "Semax", size: "10mg", price: 90 },
  { code: "SK5", name: "Selank", size: "5mg", price: 70 },
  { code: null, also: "SK10", name: "Selank", size: "10mg", price: 90 },
  { code: "NJ500", name: "NAD+", size: "500mg", price: 80 },
  { code: "NJ1000", name: "NAD+", size: "1000mg", price: 90 },
  { code: "GT600", name: "Glutathione", size: "600mg", price: 40 },
  { code: "GT1500", name: "Glutathione", size: "1500mg", price: 90 },
  { code: "ML10", name: "Melanotan 2", size: "10mg", price: 60 },
  { code: "NP810", name: "Snap8", size: "10mg", price: 70 },
  { code: "KPV5", name: "KPV", size: "5mg", price: 50 },
  { code: "KPV10", name: "KPV", size: "10mg", price: 65 },
  { code: "IG01", name: "IGF1-LR3", size: "100mcg", price: 65 },
  { code: "CBL60", name: "Cerebrolysin", size: "60mg", price: 80 },
  { code: "RA10", name: "Ara-290", size: "10mg", price: 65 },
  { code: "5AM", name: "5-Amino-1MQ", size: "5mg", price: 65 },
  { code: "2S10", name: "SS31", size: "10mg", price: 85 },
  { code: "2S50", name: "SS31", size: "50mg", price: 180 },
  { code: "ET10", name: "Epithalon", size: "10mg", price: 60 },
  { code: "VIP5", name: "VIP", size: "5mg", price: 80 },
  { code: "BA3", name: "Bac Water", size: "3ml", price: 10 },
  { code: "BA10", name: "Bac Water", size: "10ml", price: 20 },
];

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
const same = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, "") === b.trim().toLowerCase().replace(/\s+/g, "");
const money = (n: number | null) => (n == null ? "no price" : `$${Number(n).toFixed(2)}`);

try {
  const host = new URL(process.env.DATABASE_URL).host.split(".")[0];
  console.log(`${APPLY ? "SAVING to" : "Checking (nothing is saved)"} ${host} - business '${BUSINESS}'\n`);

  await sql.begin(async (tx) => {
    const items = await tx`
      select id, kind, catalog_code, name, variant, sell_price_nzd, shop_visible
      from inv_items where business_id = ${BUSINESS}`;

    let changed = 0;
    let same_ = 0;
    let added = 0;
    for (const row of PRICE_LIST) {
      const codes = [row.code, row.also].filter((c): c is string => Boolean(c));
      const item =
        items.find((i) => i.catalog_code && codes.includes(i.catalog_code)) ??
        items.find((i) => same(i.name, row.name) && same(i.variant, row.size));
      const label = `${row.name} ${row.size}`.padEnd(42);

      if (!item) {
        const code = row.code ?? row.also!;
        console.log(`  ADD     ${label} ${money(row.price)}   (new product ${code}, shown in the shop)`);
        added++;
        if (APPLY) {
          await tx`
            insert into inv_items (id, business_id, kind, name, variant, unit, catalog_code, sell_price_nzd, shop_visible)
            values (${`cat:${code}`}, ${BUSINESS}, 'peptide', ${row.name}, ${row.size}, 'vial', ${code}, ${row.price}, true)`;
        }
        continue;
      }
      const current = item.sell_price_nzd == null ? null : Number(item.sell_price_nzd);
      if (current === row.price) {
        same_++;
        continue;
      }
      console.log(`  PRICE   ${label} ${money(current)} -> ${money(row.price)}${item.shop_visible ? "   (in shop)" : ""}`);
      changed++;
      if (APPLY) {
        await tx`
          update inv_items set sell_price_nzd = ${row.price}, updated_at = now()
          where business_id = ${BUSINESS} and id = ${item.id}`;
      }
    }

    // Every peptide with a price goes in the shop (supplies are left as they are).
    const priced = (i: (typeof items)[number]) =>
      i.sell_price_nzd != null ||
      PRICE_LIST.some((r) => (i.catalog_code && [r.code, r.also].includes(i.catalog_code)) || (same(i.name, r.name) && same(i.variant, r.size)));
    const toShow = items.filter(
      (i) => i.kind === "peptide" && !i.shop_visible && i.catalog_code !== REMOVE_ID_CODE && priced(i)
    );
    if (toShow.length) console.log("");
    for (const i of toShow) {
      console.log(`  SHOW    ${`${i.name} ${i.variant}`.padEnd(42)} switched on in the shop`);
      if (APPLY) await tx`update inv_items set shop_visible = true, updated_at = now() where business_id = ${BUSINESS} and id = ${i.id}`;
    }

    // 5-Amino-1MQ 50mg isn't sold - remove it, unless anything refers to it.
    const [extra] = items.filter((i) => i.catalog_code === REMOVE_ID_CODE);
    if (extra) {
      const needle = `%${JSON.stringify(extra.id)}%`;
      const [refs] = await tx`
        select
          (select count(*) from inventory_lots where business_id = ${BUSINESS} and item_id = ${extra.id})
        + (select count(*) from stock_movements where business_id = ${BUSINESS} and item_id = ${extra.id})
        + (select count(*) from purchase_orders where business_id = ${BUSINESS} and data::text like ${needle})
        + (select count(*) from sales where business_id = ${BUSINESS} and data::text like ${needle})
        + (select count(*) from shop_orders where business_id = ${BUSINESS} and lines::text like ${needle})
        + (select count(*) from bundles where business_id = ${BUSINESS} and components::text like ${needle}) as n`;
      if (Number(refs.n) > 0) {
        console.log(`\n  KEEP    ${extra.name} ${extra.variant} (${REMOVE_ID_CODE}) - it's used in ${refs.n} order/stock record(s), so it can't be removed safely.`);
      } else {
        console.log(`\n  REMOVE  ${extra.name} ${extra.variant} (${REMOVE_ID_CODE}) - not used anywhere`);
        if (APPLY) await tx`delete from inv_items where business_id = ${BUSINESS} and id = ${extra.id}`;
      }
    }

    console.log(
      `\n${changed} price(s) to change, ${added} product(s) to add, ${toShow.length} to switch on in the shop, ${same_} prices already right.`
    );
    const unlisted = items.filter(
      (i) =>
        i.catalog_code &&
        i.catalog_code !== REMOVE_ID_CODE &&
        !PRICE_LIST.some((r) => [r.code, r.also].includes(i.catalog_code))
    );
    if (unlisted.length) {
      console.log(`Not on the price list (prices left as they are): ${unlisted.map((i) => `${i.name} ${i.variant}`).join(", ")}`);
    }
  });

  console.log(APPLY ? "\nSaved." : "\nNothing saved. If that all looks right, run it again with --apply at the end.");
} finally {
  await sql.end();
}
