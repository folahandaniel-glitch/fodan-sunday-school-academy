import "server-only";
import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getAsset, logoFor } from "./services/cms";

const SECURE = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" };

/** Placement -> built-in fallback file, so the default Fodan Sunday School Academy brand never disappears. */
const FALLBACK: Record<string, string> = {
  "header-light": "horizontal.svg", "header-dark": "horizontal-dark.svg", login: "stacked.svg", footer: "horizontal-dark.svg", certificate: "stacked.svg", email: "horizontal.png",
  "favicon-svg": "favicon.svg", "favicon-32": "favicon-32.png", "favicon-ico": "favicon.ico", "apple-180": "apple-touch-icon.png", "pwa-192": "icon-192.png", "pwa-512": "icon-512.png", "pwa-maskable": "maskable-512.png",
};
const MIME: Record<string, string> = { svg: "image/svg+xml", png: "image/png", ico: "image/x-icon" };

export async function serveLogoRow(l: typeof schema.logos.$inferSelect): Promise<Response> {
  const headers: Record<string, string> = { ...SECURE, "Cache-Control": "public, max-age=300, stale-while-revalidate=3600", "Content-Type": l.mime };
  if (l.svg) return new Response(l.svg, { headers });
  if (l.assetId) {
    const a = await getAsset(l.assetId);
    if (!a) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(a.data), { headers: { ...headers, "Content-Type": a.mime } });
  }
  if (l.builtinPath && /^\/brand\/[\w.-]+$/.test(l.builtinPath)) return serveBuiltin(l.builtinPath.replace("/brand/", ""), headers);
  return new Response("Not found", { status: 404 });
}

function serveBuiltin(file: string, base: Record<string, string> = { ...SECURE, "Cache-Control": "public, max-age=300" }) {
  const f = path.join(process.cwd(), "public", "brand", file);
  if (!/^[\w.-]+$/.test(file) || !fs.existsSync(f)) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(f)), { headers: { ...base, "Content-Type": MIME[file.split(".").pop()!] ?? "application/octet-stream" } });
}

export async function logoById(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = await getDb();
  const [l] = await db.select().from(schema.logos).where(and(eq(schema.logos.id, id), isNull(schema.logos.organizationId)));
  return l ?? null;
}

export async function servePlacement(placement: string): Promise<Response> {
  if (!/^[a-z0-9-]{3,30}$/.test(placement)) return new Response("Not found", { status: 404 });
  const l = await logoFor(placement);
  if (l) { const r = await serveLogoRow(l); if (r.status === 200) return r; }
  const fb = FALLBACK[placement];
  return fb ? serveBuiltin(fb) : new Response("Not found", { status: 404 });
}
export { desc, sql };
