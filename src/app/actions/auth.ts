"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { run, s, b, type FormState } from "@/server/action-util";
import { COOKIE, createSession, destroySession, getSession, requestCtx } from "@/server/auth/session";
import { authenticate, beginTotpSetup, changePassword, completePasswordReset, disableTotp, enableTotp, registerChurch, registerMember, requestPasswordReset, verifyTotp } from "@/server/services/auth";
import { homeFor, requireUser, safeNext, actorOf } from "@/server/guards";
import { listMemberships, resolveOrgCtx } from "@/server/org";
import { getDb, schema } from "@/server/db";
import { hmac } from "@/server/crypto";
import { audit } from "@/server/audit";

async function startSession(userId: string, mfaRequired: boolean, remember: boolean, ip: string | null, ua: string | null) {
  const org = await resolveOrgCtx(userId, null);
  await createSession(userId, { remember, mfaOk: !mfaRequired, activeOrgId: org?.orgId ?? null }, { ip, userAgent: ua });
}

export async function loginAction(_: FormState | null, fd: FormData): Promise<FormState> {
  const ctx = await requestCtx();
  const r = await authenticate(s(fd, "identifier"), String(fd.get("password") ?? ""), ctx.ip);
  if (!r.ok) return { ok: false, error: r.error };
  await startSession(r.userId, r.mfaRequired, b(fd, "remember"), ctx.ip, ctx.userAgent);
  const next = safeNext(s(fd, "next"));
  if (r.mfaRequired) return { ok: true, redirect: `/login/mfa${next ? `?next=${encodeURIComponent(next)}` : ""}` };
  if (r.mustChangePassword) return { ok: true, redirect: "/account/password?first=1" };
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, r.userId));
  return { ok: true, redirect: next ?? (await homeFor({ id: u.id, platformRole: u.platformRole } as never)) };
}

export async function mfaAction(_: FormState | null, fd: FormData): Promise<FormState> {
  const sess = await getSession();
  if (!sess) return { ok: false, error: "Your sign-in expired. Please sign in again.", redirect: "/login" };
  if (!(await verifyTotp(sess.user.id, s(fd, "code")))) return { ok: false, error: "That code is not correct or has expired." };
  const db = await getDb();
  await db.update(schema.sessions).set({ mfaOk: true, recentAuthAt: new Date() }).where(eq(schema.sessions.id, sess.sessionId));
  const next = safeNext(s(fd, "next"));
  return { ok: true, redirect: sess.user.mustChangePassword ? "/account/password?first=1" : next ?? (await homeFor(sess.user)) };
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function registerChurchAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const ctx = await requestCtx();
    const r = await registerChurch({
      churchName: s(fd, "churchName"), type: s(fd, "type") || "Church", denomination: s(fd, "denomination"), country: s(fd, "country") || "Nigeria", state: s(fd, "state"), city: s(fd, "city"), address: s(fd, "address"),
      contactEmail: s(fd, "contactEmail"), phone: s(fd, "phone"), adminName: s(fd, "adminName"), adminEmail: s(fd, "adminEmail"), password: String(fd.get("password") ?? ""),
      language: s(fd, "language") || "en", timezone: s(fd, "timezone") || "Africa/Lagos", currency: s(fd, "currency") || "NGN", acceptTerms: b(fd, "acceptTerms") as true, claimOrgId: s(fd, "claimOrgId") || undefined,
    }, { id: null, ip: ctx.ip });
    if (!r.ok) return { ok: false, error: r.error } as FormState;
    await startSession(r.userId, false, false, ctx.ip, ctx.userAgent);
    return { redirect: r.status === "pending" ? "/app" : "/church?welcome=1" };
  });
}

export async function registerMemberAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const ctx = await requestCtx();
    const typedName = s(fd, "typedName");
    const r = await registerMember({
      fullName: s(fd, "fullName"), email: s(fd, "email"), password: String(fd.get("password") ?? ""), role: s(fd, "role") === "teacher" ? "teacher" : "learner",
      orgId: s(fd, "orgId") || undefined, typedChurch: typedName ? { name: typedName, city: s(fd, "typedCity"), state: s(fd, "typedState"), country: s(fd, "typedCountry") || "Nigeria" } : undefined,
      joinCode: s(fd, "joinCode"), isThirteenOrOlder: b(fd, "isThirteenOrOlder") as true, acceptTerms: b(fd, "acceptTerms") as true,
    }, { id: null, ip: ctx.ip });
    if (!r.ok) return { ok: false, error: r.error } as FormState;
    await startSession(r.userId, false, false, ctx.ip, ctx.userAgent);
    return { redirect: "/app?registered=1" };
  });
}

export async function forgotAction(_: FormState | null, fd: FormData): Promise<FormState> {
  const ctx = await requestCtx();
  await requestPasswordReset(s(fd, "identifier"), ctx.ip);
  return { ok: true, message: "If an account with that email or username exists, we have sent a reset link. It is valid for 30 minutes." };
}

export async function resetAction(_: FormState | null, fd: FormData): Promise<FormState> {
  const r = await completePasswordReset(s(fd, "token"), String(fd.get("password") ?? ""));
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, redirect: "/login?reset=1" };
}

export async function changePasswordAction(_: FormState | null, fd: FormData): Promise<FormState> {
  const user = await requireUser({ allowPasswordChange: true });
  const first = b(fd, "first");
  const pw = String(fd.get("password") ?? "");
  if (pw !== String(fd.get("confirm") ?? "")) return { ok: false, error: "The two passwords do not match." };
  const r = await changePassword(user.id, first ? null : String(fd.get("current") ?? ""), pw);
  if (!r.ok) return { ok: false, error: r.error };
  // End every other session after a password change.
  const jar = await cookies();
  const tok = jar.get(COOKIE)?.value;
  const db = await getDb();
  const rows = await db.select({ id: schema.sessions.id, h: schema.sessions.tokenHash }).from(schema.sessions).where(eq(schema.sessions.userId, user.id));
  for (const row of rows) if (!tok || row.h !== hmac(tok)) await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, row.id));
  return { ok: true, message: "Password changed.", redirect: first ? await homeFor(user) : undefined };
}

export async function profileAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const name = s(fd, "fullName");
    if (name.length < 2) return { ok: false, error: "Enter your name." } as FormState;
    const db = await getDb();
    await db.update(schema.users).set({ fullName: name, phone: s(fd, "phone") || null, showChurchInForum: b(fd, "showChurchInForum"), emailNotifications: b(fd, "emailNotifications"), timezone: s(fd, "timezone") || "Africa/Lagos" }).where(eq(schema.users.id, user.id));
    return { message: "Profile saved." };
  });
}

export async function startMfaAction(): Promise<{ secret: string; uri: string }> {
  const user = await requireUser();
  return beginTotpSetup(user.id);
}
export async function enableMfaAction(_: FormState | null, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const r = await enableTotp(user.id, s(fd, "code"));
  if (!r.ok) return { ok: false, error: r.error };
  const sess = await getSession();
  const db = await getDb();
  if (sess) await db.update(schema.sessions).set({ mfaOk: true }).where(eq(schema.sessions.id, sess.sessionId));
  return { ok: true, message: "Two-step verification is on." };
}
export async function disableMfaAction(_: FormState | null, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(await verifyTotp(user.id, s(fd, "code")))) return { ok: false, error: "That code is not correct." };
  await disableTotp(user.id);
  return { ok: true, message: "Two-step verification is off." };
}

export async function switchChurchAction(fd: FormData) {
  const user = await requireUser();
  const orgId = s(fd, "orgId");
  const ms = await listMemberships(user.id);
  if (!ms.some((m) => m.orgId === orgId && m.status === "active" && m.orgStatus === "active")) return;
  const sess = await getSession();
  const db = await getDb();
  if (sess) await db.update(schema.sessions).set({ activeOrgId: orgId }).where(and(eq(schema.sessions.id, sess.sessionId)));
  await audit(await actorOf(user), "session.church_switched", { type: "organization", id: orgId });
  redirect("/app");
}
