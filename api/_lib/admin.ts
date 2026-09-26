import "./env.js";
import { requireAuthUserId } from "./auth.js";

// Owner-only access. ADMIN_USER_IDS is a comma-separated list of Clerk user ids
// (Clerk dashboard -> Users -> click the user -> "User ID", looks like user_2abc...).
function adminUserIds(): Set<string> {
    return new Set(
        (process.env.ADMIN_USER_IDS ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
    );
}

export function isAdminUserId(userId: string | null): boolean {
    return Boolean(userId) && adminUserIds().has(userId as string);
}

export async function getAdminStatus(req: any): Promise<{ userId: string | null; isAdmin: boolean }> {
    const userId = await requireAuthUserId(req);
    return { userId, isAdmin: isAdminUserId(userId) };
}
