// One-off: copies the selling prices from src/data/myProducts.ts (NZD, despite the field name priceUsd)
// into inv_items.sell_price_nzd, creating any catalogue items that haven't been ordered yet.
// Safe to re-run: existing items keep their names, and a price already set in admin is never overwritten.
// Usage: npx tsx scripts/seedShopPrices.ts
import dotenv from "dotenv";
import postgres from "postgres";
import { MY_PRODUCTS } from "../src/data/myProducts";

dotenv.config({ path: ".env.local" });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env.local");

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });

let created = 0;
let priced = 0;
try {
  await sql.begin(async (tx) => {
    for (const product of MY_PRODUCTS) {
      for (const option of product.options) {
        if (!option.code) continue;
        const id = `cat:${option.code}`;
        // Priced but not shown in the shop: the price list is the supplier's range, not what's actually stocked.
        const inserted = await tx`
          insert into inv_items (id, kind, name, variant, unit, catalog_code, sell_price_nzd)
          values (${id}, 'peptide', ${product.name}, ${option.vialSize}, 'vial', ${option.code}, ${option.priceUsd})
          on conflict (id) do nothing
          returning id`;
        if (inserted.length > 0) {
          created++;
          continue;
        }
        const updated = await tx`
          update inv_items set sell_price_nzd = ${option.priceUsd}, updated_at = now()
          where id = ${id} and sell_price_nzd is null
          returning id`;
        priced += updated.length;
      }
    }
  });
  console.log(`Done: ${created} catalogue items created, ${priced} existing items given their price.`);
} finally {
  await sql.end();
}
