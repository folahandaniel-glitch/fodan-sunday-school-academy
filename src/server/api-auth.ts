import "server-only";
import { cookies, headers } from "next/headers";
import { COOKIE, resolveToken } from "./auth/session";
import { resolveOrgCtx, type OrgCtx } from "./org";

/** CSRF guard for JSON endpoints that change state: the request must come from this site's own origin. */
export async function sameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return h.get("sec-fetch-site") === "same-origin" || h.get("sec-fetch-site") === null;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function apiOrgCtx(): Promise<OrgCtx | null> {
  const jar = await cookies();
  const s = await resolveToken(jar.get(COOKIE)?.value);
  if (!s || (s.user.totpEnabled && !s.mfaOk) || s.user.mustChangePassword) return null;
  return resolveOrgCtx(s.user.id, s.activeOrgId);
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
