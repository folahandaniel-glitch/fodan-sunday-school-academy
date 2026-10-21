import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSession, requestCtx, type SessionUser } from "./auth/session";
import { platformCan, orgCan, type PlatformPerm, type OrgPerm } from "@/lib/permissions";
import { listMemberships, resolveOrgCtx, type OrgCtx } from "./org";
import type { Actor } from "./audit";
import { getSetting } from "./settings";

export const safeNext = (n: string | null | undefined) => (n && n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : null);

interface Opts { next?: string; allowPasswordChange?: boolean }

/** Server-side gate. Call at the top of EVERY protected page and action: layouts are not re-run on client navigation. */
export async function requireUser(opts: Opts = {}): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect(`/login${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ""}`);
  if (s.user.totpEnabled && !s.mfaOk) redirect("/login/mfa");
  if (s.user.mustChangePassword && !opts.allowPasswordChange) redirect("/account/password?first=1");
  return s.user;
}
export async function optionalUser() { return (await getSession())?.user ?? null; }

export async function requirePlatform(perm: PlatformPerm = "admin.access"): Promise<SessionUser> {
  const u = await requireUser();
  if (!platformCan(u.platformRole, "admin.access") || !platformCan(u.platformRole, perm)) redirect("/app?denied=1");
  return u;
}

export const getOrgCtx = cache(async (): Promise<OrgCtx | null> => {
  const s = await getSession();
  if (!s) return null;
  return resolveOrgCtx(s.user.id, s.activeOrgId);
});

/** Gate for church pages: signed in, ACTIVE membership in an ACTIVE church, and the permission. Redirects otherwise. */
export async function requireOrg(perm?: OrgPerm): Promise<{ user: SessionUser; ctx: OrgCtx }> {
  const user = await requireUser();
  const ctx = await getOrgCtx();
  if (!ctx) redirect("/app");
  if (perm && !orgCan(ctx.role, perm)) redirect("/app?denied=1");
  return { user, ctx };
}

export async function actorOf(u: SessionUser | null): Promise<Actor> {
  const ctx = await requestCtx();
  return { id: u?.id ?? null, label: u?.fullName, role: u?.platformRole, ip: ctx.ip };
}

export async function maintenanceOn() { return (await getSetting("maintenance")).suspended; }

export async function homeFor(user: SessionUser): Promise<string> {
  if (platformCan(user.platformRole, "admin.access")) return "/admin";
  const ctx = await resolveOrgCtx(user.id, null);
  if (!ctx) return "/app";
  return ctx.role === "learner" ? "/learn" : ctx.role === "teacher" ? "/teach" : "/church";
}
export { listMemberships };
