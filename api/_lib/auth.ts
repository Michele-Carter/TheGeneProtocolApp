import "./env.js";
import { verifyToken } from "@clerk/backend";

function getBearerToken(req: any): string | null {
    const header = req.headers?.authorization;

    if (!header || typeof header !== "string") {
        return null;
    }

    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
        return null;
    }

    return token;
}

export async function requireAuthUserId(
    req: any
): Promise<string | null> {
    const token = getBearerToken(req);

    if (!token) {
        console.error("Clerk auth failed: no Bearer token received");
        return null;
    }

    const secretKey = process.env.CLERK_SECRET_KEY;

    if (!secretKey) {
        console.error("Clerk auth failed: CLERK_SECRET_KEY is missing");
        return null;
    }

    try {
        const payload = await verifyToken(token, { secretKey });

        console.log("Clerk token verified for user:", payload.sub);

        return payload.sub ?? null;
    } catch (error) {
        console.error("Clerk token verification failed:", error);
        return null;
    }
}