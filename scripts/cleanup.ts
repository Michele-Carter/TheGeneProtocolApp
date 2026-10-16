// Runs the daily deletion of ended businesses by hand (api/_lib/cleanup.ts). Only lists what's due unless
// --delete is given. Uses the database, Stripe, Clerk and file store in .env.local (the dev ones).
// Usage: npx tsx scripts/cleanup.ts            (list what's due)
//        npx tsx scripts/cleanup.ts --delete   (delete it)
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const { runCleanup } = await import("../api/_lib/cleanup");

const dryRun = !process.argv.includes("--delete");
const result = await runCleanup({ dryRun });
console.log(dryRun ? "Dry run - nothing deleted." : "Deleted what was due.");
console.log(JSON.stringify(result, null, 2));
process.exit(0);
