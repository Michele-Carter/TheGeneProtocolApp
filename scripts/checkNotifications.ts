// Read-only: which devices get phone/computer notifications for a business, and its latest customer
// notifications - to see why one didn't arrive. Changes nothing.
// Usage (live): powershell -ExecutionPolicy Bypass -File scripts/runLive.ps1 scripts/checkNotifications.ts
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env.local");

const BUSINESS = process.argv.find((a) => a.startsWith("--business="))?.split("=")[1] ?? "tgp";
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
const when = (d: Date) => d.toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" });

try {
  console.log(`Notifications for business '${BUSINESS}' on ${new URL(process.env.DATABASE_URL).host.split(".")[0]}\n`);

  const devices = await sql`
    select p.device, p.customer_id, c.name as customer_name, c.email as customer_email, p.created_at,
           split_part(p.endpoint, '/', 3) as service
    from push_subscriptions p
    left join customers c on c.id = p.customer_id and c.business_id = p.business_id
    where p.business_id = ${BUSINESS}
    order by p.created_at`;
  console.log(`Devices getting notifications: ${devices.length}`);
  for (const d of devices) {
    const who = d.customer_id ? `CUSTOMER ${d.customer_name ?? "?"} <${d.customer_email ?? "?"}>` : "OWNER";
    console.log(`  ${who.padEnd(50)} ${String(d.device || "device").padEnd(26)} since ${when(d.created_at)}  (${d.service})`);
  }

  const notes = await sql`
    select n.title, n.created_at, c.name as customer_name
    from notifications n
    left join customers c on c.id = n.customer_id and c.business_id = n.business_id
    where n.business_id = ${BUSINESS}
    order by n.created_at desc limit 5`;
  console.log(`\nLatest customer notifications (what's sent to their bell and phone):`);
  for (const n of notes) console.log(`  ${when(n.created_at)}  ${String(n.customer_name ?? "?").padEnd(24)} ${n.title}`);

  console.log(`\nServer keys for notifications: VAPID keys are set in Vercel, not checked here.`);
} finally {
  await sql.end();
}
