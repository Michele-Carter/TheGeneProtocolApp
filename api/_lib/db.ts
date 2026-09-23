import "./env.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

declare global {
    // eslint-disable-next-line no-var
    var __pepPalSqlClient: ReturnType<typeof postgres> | undefined;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
    if (_db) {
        return _db;
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error("DATABASE_URL is required");
    }

    const sql = global.__pepPalSqlClient ?? postgres(databaseUrl, { ssl: "require" });

    if (!global.__pepPalSqlClient) {
        global.__pepPalSqlClient = sql;
    }

    _db = drizzle(sql, { schema });
    return _db;
}
