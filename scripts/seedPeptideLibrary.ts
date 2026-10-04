// One-off: fills The Gene Protocol's peptide library and supplier price list from the data that used to be
// built into the app (src/data). Records already in the database are left alone, so edits made in the app
// are never overwritten. Run after scripts/multi-business-3.sql.
// Usage: npx tsx scripts/seedPeptideLibrary.ts
import dotenv from "dotenv";
import postgres from "postgres";
import { PEPTIDEDB_ENTRIES } from "../src/data/peptideDb";
import { PEPTIDES_DATABASE, PEPTIDE_INTERACTIONS } from "../src/data/peptides";
import { PEPTIDEDB_META } from "../src/data/peptideDbSource";
import { PEPTIDEDOSAGES_META } from "../src/data/peptideDosagesSource";
import { MY_PRODUCTS } from "../src/data/myProducts";

dotenv.config({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env.local");

const BUSINESS_ID = "tgp";

const rows: { kind: string; key: string; sort: number; data: unknown }[] = [
  ...PEPTIDEDB_ENTRIES.map((data, sort) => ({ kind: "entry", key: data.slug, sort, data })),
  ...PEPTIDES_DATABASE.map((data, sort) => ({ kind: "peptide", key: data.id, sort, data })),
  ...PEPTIDE_INTERACTIONS.map((data, sort) => ({ kind: "interaction", key: `${data.peptideA}|${data.peptideB}`, sort, data })),
  ...Object.entries(PEPTIDEDB_META).map(([key, data], sort) => ({ kind: "peptidedb-meta", key, sort, data })),
  ...Object.entries(PEPTIDEDOSAGES_META).map(([key, data], sort) => ({ kind: "peptidedosages-meta", key, sort, data })),
];

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });
try {
  let added = 0;
  for (const row of rows) {
    const result = await sql`
      insert into peptide_library (business_id, kind, key, sort, data)
      values (${BUSINESS_ID}, ${row.kind}, ${row.key}, ${row.sort}, ${sql.json(row.data as any)})
      on conflict do nothing`;
    added += result.count;
  }
  let products = 0;
  for (const [sort, product] of MY_PRODUCTS.entries()) {
    const result = await sql`
      insert into supplier_catalog (business_id, id, name, note, options, sort)
      values (${BUSINESS_ID}, ${product.id}, ${product.name}, ${product.note ?? ""}, ${sql.json(product.options as any)}, ${sort})
      on conflict do nothing`;
    products += result.count;
  }
  console.log(`Peptide library: added ${added} of ${rows.length} records. Supplier price list: added ${products} of ${MY_PRODUCTS.length} products.`);
} finally {
  await sql.end();
}
