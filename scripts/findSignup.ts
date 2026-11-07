// READ-ONLY: looks for an email address anywhere a sign-up would leave a trace, to see how far someone got.
// Usage: powershell -ExecutionPolicy Bypass -File scripts/runLive.ps1 scripts/findSignup.ts someone@example.com
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) throw new Error("Pass the email address to look for");
// The part before the @, to catch a typo in the rest of the address.
const local = email.split("@")[0];

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });
try {
    const exact = await sql`
        select name, slug, owner_email, stripe_customer_id, subscription_status
        from businesses where lower(owner_email) = ${email} or lower(contact_email) = ${email}`;
    console.log(`\nBusinesses registered with ${email}:`, exact.length ? exact : "none");

    const similar = await sql`
        select name, slug, owner_email from businesses
        where lower(owner_email) like ${"%" + local + "%"} and lower(owner_email) <> ${email}`;
    console.log(`Businesses with a similar email (possible typo):`, similar.length ? similar : "none");

    const asCustomer = await sql`
        select c.name, c.email, b.name as shop from customers c join businesses b on b.id = c.business_id
        where lower(c.email) like ${"%" + local + "%"}`;
    console.log(`Shop customers with this or a similar email:`, asCustomer.length ? asCustomer : "none");

    const invites = await sql`
        select code, used_at, business_id from signup_invites order by created_at`;
    console.log(`Invite links:`, invites);
} finally {
    await sql.end();
}
