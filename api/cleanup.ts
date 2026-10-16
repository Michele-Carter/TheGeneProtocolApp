import { runCleanup } from "./_lib/cleanup.js";
import { sendJson } from "./_lib/http.js";

// GET /api/cleanup - deletes businesses whose subscription ended more than 30 days ago (api/_lib/cleanup.ts).
// Run once a day by Vercel Cron (vercel.json), which sends "Authorization: Bearer <CRON_SECRET>"; CRON_SECRET is
// set in Vercel's environment variables. ?dryRun=1 only lists what's due.

export default async function handler(req: any, res: any) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return sendJson(res, 405, { error: "Method not allowed" });
    }
    const secret = process.env.CRON_SECRET;
    if (!secret) return sendJson(res, 500, { error: "CRON_SECRET is missing" });
    if (req.headers?.authorization !== `Bearer ${secret}`) return sendJson(res, 401, { error: "Unauthorized" });

    try {
        const result = await runCleanup({ dryRun: req.query?.dryRun === "1" });
        console.log("Cleanup:", JSON.stringify(result));
        return sendJson(res, result.failed.length ? 500 : 200, result);
    } catch (error) {
        console.error("Cleanup failed:", error);
        return sendJson(res, 500, { error: "Cleanup failed" });
    }
}
