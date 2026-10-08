// One-off: makes everyone in ADMIN_USER_IDS an owner of The Gene Protocol (business 'tgp').
// Safe to run again. Run after scripts/multi-business.sql.
// Usage: node scripts/seedBusinessOwners.mjs
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env.local");

const ids = (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
if (!ids.length) throw new Error("ADMIN_USER_IDS is empty in .env.local");

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });
try {
  for (const id of ids) {
    await sql`
      insert into business_members (business_id, clerk_user_id, role)
      values ('tgp', ${id}, 'owner')
      on conflict do nothing`;
  }
  const owners = await sql`select clerk_user_id from business_members where business_id = 'tgp'`;
  console.log(`The Gene Protocol owners: ${owners.length}`);
} finally {
  await sql.end();
}
