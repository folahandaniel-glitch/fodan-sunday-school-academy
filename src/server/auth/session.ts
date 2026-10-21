import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import { hmac, randomToken } from "../crypto";
import type { PlatformRole } from "../db/schema";

export const COOKIE = process.env.NODE_ENV === "production" ? "__Host-fssa_session" : "fssa_session";

export interface SessionUser {
  id: string; email: string | null; username: string | null; fullName: string; platformRole: PlatformRole; status: string;
  mustChangePassword: boolean; totpEnabled: boolean; isMinor: boolean; timezone: string;
}
export interface Ctx { ip: string | null; userAgent: string | null }

export async function requestCtx(): Promise<Ctx> {
  try {
    const h = await headers();
    return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
  } catch { return { ip: null, userAgent: null }; }
}

export async function createSession(userId: string, opts: { remember: boolean; mfaOk?: boolean; activeOrgId?: string | null }, ctx: Ctx) {
  const token = randomToken(32);
  const hours = opts.remember ? 24 * 30 : 12;
  const expiresAt = new Date(Date.now() + hours * 3_600_000);
  const db = await getDb();
  await db.insert(schema.sessions).values({ tokenHash: hmac(token), userId, ip: ctx.ip, userAgent: ctx.userAgent, expiresAt, mfaOk: opts.mfaOk ?? false, activeOrgId: opts.activeOrgId ?? null });
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", ...(opts.remember ? { expires: expiresAt } : {}) });
  return { token, expiresAt };
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.tokenHash, hmac(token)));
  }
  jar.delete(COOKIE);
}

export async function revokeAllSessions(userId: string, exceptToken?: string) {
  const db = await getDb();
  const rows = await db.select({ id: schema.sessions.id, h: schema.sessions.tokenHash }).from(schema.sessions).where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));
  const keep = exceptToken ? hmac(exceptToken) : null;
  for (const r of rows) if (r.h !== keep) await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, r.id));
}

export interface Resolved { sessionId: string; recentAuthAt: Date; mfaOk: boolean; activeOrgId: string | null; user: SessionUser }

export async function resolveToken(token: string | undefined | null): Promise<Resolved | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const db = await getDb();
  const [row] = await db
    .select({ sessionId: schema.sessions.id, recentAuthAt: schema.sessions.recentAuthAt, mfaOk: schema.sessions.mfaOk, activeOrgId: schema.sessions.activeOrgId, u: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, hmac(token)), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date())));
  if (!row) return null;
  const u = row.u;
  if (u.status === "suspended" || u.status === "deactivated") return null;
  return {
    sessionId: row.sessionId, recentAuthAt: row.recentAuthAt, mfaOk: row.mfaOk, activeOrgId: row.activeOrgId,
    user: { id: u.id, email: u.email, username: u.username, fullName: u.fullName, platformRole: u.platformRole, status: u.status, mustChangePassword: u.mustChangePassword, totpEnabled: u.totpEnabled, isMinor: u.isMinor, timezone: u.timezone },
  };
}

/** Per-request cached session lookup. */
export const getSession = cache(async (): Promise<Resolved | null> => {
  const jar = await cookies();
  return resolveToken(jar.get(COOKIE)?.value);
});
export const currentUser = cache(async () => (await getSession())?.user ?? null);
