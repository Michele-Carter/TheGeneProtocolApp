// Runs a .sql file against DATABASE_URL from .env.local.
// Usage: node scripts/applySql.mjs scripts/admin-tables.sql
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });

const file = process.argv[2];
if (!file) throw new Error("Pass the .sql file to run");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env.local");

// onnotice: silence "already exists, skipping" notices from IF NOT EXISTS.
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
try {
  await sql.unsafe(readFileSync(file, "utf8"));
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name`;
  console.log("Applied", file, "- tables now:", tables.map((t) => t.table_name).join(", "));
} finally {
  await sql.end();
}
