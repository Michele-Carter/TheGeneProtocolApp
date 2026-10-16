import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";

// Local preview only (`npm run dev`): serves /api/* from the api/ folder inside Vite, the way Vercel does live.
// `vercel dev` starts a fresh copy of the server for every request (6-10 seconds each, long enough for sign-in
// passes to run out); here the code stays loaded and keeps its database connection, and edits are picked up
// on the next request.

const API_DIR = path.resolve(process.cwd(), "api");

// /api/admin/inventory -> api/admin/[resource].ts with resource = "inventory"; /api/library -> api/library.ts
function routeFor(urlPath: string): { file: string; params: Record<string, string> } | null {
  const parts = urlPath.replace(/^\/api\/?/, "").replace(/\/$/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0 || parts.some((p) => p.startsWith("_") || p.includes(".."))) return null;

  const exact = path.join(API_DIR, ...parts) + ".ts";
  if (fs.existsSync(exact)) return { file: exact, params: {} };

  const dir = path.join(API_DIR, ...parts.slice(0, -1));
  const dynamic = fs.existsSync(dir) ? fs.readdirSync(dir).find((name) => /^\[\w+\]\.ts$/.test(name)) : undefined;
  if (!dynamic) return null;
  return { file: path.join(dir, dynamic), params: { [dynamic.slice(1, -4)]: parts[parts.length - 1] } };
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// Vercel's additions to Node's request and response: req.query, req.body, res.status/json/send.
async function asVercel(req: IncomingMessage, res: ServerResponse, url: URL, params: Record<string, string>, parseBody: boolean) {
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    query[key] = values.length > 1 ? values : values[0];
  }
  Object.assign(req, { query: { ...query, ...params } });

  if (parseBody && req.method !== "GET" && req.method !== "HEAD") {
    const raw = await readBody(req);
    const type = String(req.headers["content-type"] ?? "");
    let body: unknown = raw.length ? raw : undefined;
    if (raw.length && type.includes("application/json")) body = JSON.parse(raw.toString("utf8"));
    else if (raw.length && type.startsWith("text/")) body = raw.toString("utf8");
    Object.assign(req, { body });
  }

  const vres = res as ServerResponse & Record<string, any>;
  vres.status = (code: number) => {
    res.statusCode = code;
    return vres;
  };
  vres.json = (data: unknown) => {
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
    return vres;
  };
  vres.send = (data: unknown) => {
    if (data != null && typeof data === "object" && !Buffer.isBuffer(data)) return vres.json(data);
    res.end(data as any);
    return vres;
  };
  return vres;
}

export function localApi(): Plugin {
  let server: ViteDevServer;
  return {
    name: "pepbiz-local-api",
    apply: "serve",
    configureServer(s) {
      server = s;
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/") && req.url !== "/api") return next();
        const url = new URL(req.url, "http://localhost");
        const route = routeFor(url.pathname);
        if (!route) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ error: "Not found" }));
        }
        try {
          const mod = await server.ssrLoadModule(route.file);
          const parseBody = mod.config?.api?.bodyParser !== false;
          const vres = await asVercel(req, res, url, route.params, parseBody);
          await mod.default(req, vres);
        } catch (error) {
          console.error(`[local api] ${req.method} ${url.pathname} failed:`, error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Something went wrong - please try again." }));
          }
        }
      });
    },
  };
}
