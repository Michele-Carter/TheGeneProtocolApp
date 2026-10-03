// One-off: gives each peptide in inventory the categories its Peptide Database entry has
// (e.g. 5-Amino-1MQ -> Longevity, Metabolic, Weight Loss). Only fills items with no categories yet,
// so anything already set in admin is left alone. Lists the items it couldn't match.
// Usage: npx tsx scripts/seedShopCategories.ts
import dotenv from "dotenv";
import postgres from "postgres";
import { PEPTIDEDB_ENTRIES } from "../src/data/peptideDb";
import { categoryLabel } from "../shared/shop";

dotenv.config({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env.local");

// "BPC-157" and "BPC157" are the same peptide.
const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

const byKey = new Map<string, string[]>();
const bySlug = new Map<string, string[]>();
for (const entry of PEPTIDEDB_ENTRIES) {
  const labels = entry.categories.filter((c) => c !== "other").map(categoryLabel);
  bySlug.set(entry.slug, labels);
  for (const name of [entry.name, entry.slug, ...entry.aliases]) byKey.set(key(name), labels);
}

// Price-list names that don't match a database name. Blends get every ingredient's categories.
const MANUAL: Record<string, string[]> = {
  "Melanotan 2": ["melanotan-ii"],
  "HCG 10,000 IU": ["hcg"],
  "Oxytocin Acetate": ["oxytocin"],
  "CJC1295 + Ipamorelin Blend (no DAC)": ["cjc-ipa-protocol"],
  "Wolverine Blend (BPC157/TB500)": ["bpc-157", "tb-500"],
  "KLOW (GHKCU/BPC157/TB500/KPV)": ["ghk-cu", "bpc-157", "tb-500", "kpv"],
};
for (const [name, slugs] of Object.entries(MANUAL)) {
  byKey.set(key(name), [...new Set(slugs.flatMap((slug) => bySlug.get(slug) ?? []))]);
}
byKey.set(key("Bac Water"), ["Supplies"]);

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
try {
  const items = await sql<{ id: string; name: string }[]>`
    select id, name from inv_items where kind = 'peptide' and shop_categories = '[]'::jsonb order by name`;
  const unmatched = new Set<string>();
  let filled = 0;
  for (const item of items) {
    const labels = byKey.get(key(item.name));
    if (!labels || labels.length === 0) {
      unmatched.add(item.name);
      continue;
    }
    await sql`update inv_items set shop_categories = ${sql.json(labels)}, updated_at = now() where id = ${item.id}`;
    filled++;
  }
  console.log(`Gave ${filled} items their Peptide Database categories.`);
  if (unmatched.size > 0) console.log(`No match (set these in admin): ${[...unmatched].join(", ")}`);
} finally {
  await sql.end();
}
