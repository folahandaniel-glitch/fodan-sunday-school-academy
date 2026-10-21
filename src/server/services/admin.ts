import "server-only";
import { and, asc, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { AccessError, NotFoundError } from "../org";
import { audit, type Actor } from "../audit";
import { hashPassword } from "../auth/password";
import { temporaryPassword } from "../crypto";
import { emailAdminsOf, queueEmail, flushOutbox } from "./notify";
import { billingMaintenance } from "./billing";
import { effectivePlan } from "./entitlements";
import type { PlatformRole } from "../db/schema";

/* ============================ Churches ============================ */
export async function listChurches(f: { q?: string; status?: string; page?: number; pageSize?: number } = {}) {
  const db = await getDb();
  const ps = Math.min(f.pageSize ?? 25, 100), off = ((f.page ?? 1) - 1) * ps;
  const where = and(f.status ? eq(schema.organizations.status, f.status as "active") : undefined, f.q ? or(ilike(schema.organizations.name, `%${f.q}%`), ilike(schema.organizations.city, `%${f.q}%`), ilike(schema.organizations.contactEmail, `%${f.q}%`)) : undefined);
  const rows = await db.select({ o: schema.organizations,
    members: sql<number>`(select count(*)::int from organization_memberships m where m.organization_id = ${schema.organizations.id} and m.status = 'active')`,
    pending: sql<number>`(select count(*)::int from organization_memberships m where m.organization_id = ${schema.organizations.id} and m.status = 'pending')`,
    plan: sql<string | null>`(select p.name from organization_subscriptions s join subscription_plans p on p.id = s.plan_id where s.organization_id = ${schema.organizations.id} and s.status = 'active' order by s.created_at desc limit 1)` })
    .from(schema.organizations).where(where).orderBy(desc(schema.organizations.createdAt)).limit(ps).offset(off);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.organizations).where(where);
  return { rows, total: n, page: f.page ?? 1, pageSize: ps };
}
export async function churchDetail(orgId: string) {
  const db = await getDb();
  const [o] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
  if (!o) throw new NotFoundError("Church not found.");
  const admins = await db.select({ id: schema.users.id, name: schema.users.fullName, email: schema.users.email, status: schema.organizationMemberships.status, role: schema.organizationMemberships.role }).from(schema.organizationMemberships).innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId)).where(and(eq(schema.organizationMemberships.organizationId, orgId), sql`${schema.organizationMemberships.role} in ('church_admin','assistant_admin')`));
  const counts = await db.select({ role: schema.organizationMemberships.role, status: schema.organizationMemberships.status, n: sql<number>`count(*)::int` }).from(schema.organizationMemberships).where(eq(schema.organizationMemberships.organizationId, orgId)).groupBy(schema.organizationMemberships.role, schema.organizationMemberships.status);
  const programmes = await db.select({ a: schema.curriculumAssignments, title: schema.curricula.title, session: schema.academicSessions.name }).from(schema.curriculumAssignments).innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumAssignments.curriculumId)).innerJoin(schema.academicSessions, eq(schema.academicSessions.id, schema.curriculumAssignments.sessionId)).where(eq(schema.curriculumAssignments.organizationId, orgId)).orderBy(desc(schema.curriculumAssignments.createdAt));
  const audits = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.organizationId, orgId)).orderBy(desc(schema.auditLogs.createdAt)).limit(30);
  const [cls] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.classes).where(eq(schema.classes.organizationId, orgId));
  return { org: o, admins, counts, programmes, audits, plan: await effectivePlan(orgId), classes: cls.n };
}
export async function setChurchStatus(actor: Actor, orgId: string, status: "active" | "suspended", reason: string) {
  if (status === "suspended" && reason.trim().length < 5) return { ok: false as const, error: "Record a reason for suspending a church." };
  const db = await getDb();
  const [o] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
  if (!o) throw new NotFoundError();
  await db.update(schema.organizations).set({ status, suspendedReason: status === "suspended" ? reason.trim() : null, verifiedAt: status === "active" ? (o.verifiedAt ?? new Date()) : o.verifiedAt }).where(eq(schema.organizations.id, orgId));
  await audit(actor, status === "suspended" ? "church.suspended" : "church.activated", { type: "organization", id: orgId }, { reason: reason.slice(0, 200), from: o.status }, { orgId });
  if (status === "active" && o.status === "pending") await emailAdminsOf(orgId, "Your church is approved", "Your church has been approved. Sign in to get started.", `approved:${orgId}`);
  return { ok: true as const };
}
/** Folds a duplicate, member-typed church listing into the real church. Members move over as PENDING so the church's own administrator still decides. */
export async function mergeUnverifiedChurch(actor: Actor, fromId: string, intoId: string) {
  if (fromId === intoId) return { ok: false as const, error: "Choose two different churches." };
  const db = await getDb();
  const [from] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, fromId));
  const [into] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, intoId));
  if (!from || !into) throw new NotFoundError();
  if (from.status !== "unverified") return { ok: false as const, error: "Only an unverified listing can be merged into another church." };
  const moved = await db.transaction(async (tx) => {
    const ms = await tx.select().from(schema.organizationMemberships).where(eq(schema.organizationMemberships.organizationId, fromId));
    let n = 0;
    for (const m of ms) {
      const [dup] = await tx.select({ id: schema.organizationMemberships.id }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, intoId), eq(schema.organizationMemberships.userId, m.userId)));
      if (!dup) { await tx.insert(schema.organizationMemberships).values({ organizationId: intoId, userId: m.userId, role: m.role === "church_admin" ? "learner" : m.role, status: "pending" }); n++; }
    }
    await tx.delete(schema.organizations).where(eq(schema.organizations.id, fromId));
    await audit(actor, "church.merged", { type: "organization", id: intoId }, { from: from.name, moved: n }, { orgId: intoId, db: tx });
    return n;
  });
  return { ok: true as const, moved };
}

/* ============================ Users ============================ */
export async function listUsers(f: { q?: string; role?: string; status?: string; page?: number; pageSize?: number } = {}) {
  const db = await getDb();
  const ps = Math.min(f.pageSize ?? 25, 100), off = ((f.page ?? 1) - 1) * ps;
  const where = and(f.role ? eq(schema.users.platformRole, f.role as PlatformRole) : undefined, f.status ? eq(schema.users.status, f.status as "active") : undefined, f.q ? or(ilike(schema.users.fullName, `%${f.q}%`), ilike(schema.users.email, `%${f.q}%`)) : undefined);
  const rows = await db.select({ u: { id: schema.users.id, name: schema.users.fullName, email: schema.users.email, username: schema.users.username, role: schema.users.platformRole, status: schema.users.status, lastLoginAt: schema.users.lastLoginAt, createdAt: schema.users.createdAt, mfa: schema.users.totpEnabled },
    church: sql<string | null>`(select o.name from organization_memberships m join organizations o on o.id = m.organization_id where m.user_id = ${schema.users.id} order by m.created_at limit 1)` })
    .from(schema.users).where(where).orderBy(desc(schema.users.createdAt)).limit(ps).offset(off);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(where);
  return { rows, total: n, page: f.page ?? 1, pageSize: ps };
}
export async function setUserStatus(actor: Actor, userId: string, status: "active" | "suspended") {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw new NotFoundError();
  if (u.platformRole === "super_admin" && status === "suspended") {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(and(eq(schema.users.platformRole, "super_admin"), eq(schema.users.status, "active"), ne(schema.users.id, userId)));
    if (!n) throw new AccessError("The last active Super Admin cannot be suspended.");
  }
  await db.update(schema.users).set({ status }).where(eq(schema.users.id, userId));
  if (status === "suspended") await db.update(schema.sessions).set({ revokedAt: new Date() }).where(and(eq(schema.sessions.userId, userId), sql`${schema.sessions.revokedAt} is null`));
  await audit(actor, `user.${status}`, { type: "user", id: userId });
}
export async function setPlatformRole(actor: Actor, userId: string, role: PlatformRole) {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw new NotFoundError();
  if (u.platformRole === "super_admin" && role !== "super_admin") {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(and(eq(schema.users.platformRole, "super_admin"), ne(schema.users.id, userId)));
    if (!n) throw new AccessError("There must always be at least one Super Admin.");
  }
  if (role === "super_admin" && !u.totpEnabled) throw new AccessError("Turn on two-step verification for that account before making it a Super Admin.");
  await db.update(schema.users).set({ platformRole: role }).where(eq(schema.users.id, userId));
  await db.update(schema.sessions).set({ revokedAt: new Date() }).where(and(eq(schema.sessions.userId, userId), sql`${schema.sessions.revokedAt} is null`));
  await audit(actor, "user.platform_role_changed", { type: "user", id: userId }, { from: u.platformRole, to: role });
}
export async function adminResetPassword(actor: Actor, userId: string) {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw new NotFoundError();
  const temp = temporaryPassword();
  await db.update(schema.users).set({ passwordHash: await hashPassword(temp), mustChangePassword: true, failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, userId));
  await db.update(schema.sessions).set({ revokedAt: new Date() }).where(and(eq(schema.sessions.userId, userId), sql`${schema.sessions.revokedAt} is null`));
  await audit(actor, "user.password_reset_by_admin", { type: "user", id: userId });
  if (u.email) await queueEmail(u.email, "Your password was reset", "An administrator reset your password. Sign in with the temporary password they give you, then choose a new one.");
  return temp;
}
export async function createStaffUser(actor: Actor, d: { fullName: string; email: string; role: PlatformRole }) {
  const db = await getDb();
  if (d.role === "member") return { ok: false as const, error: "Choose a staff role." };
  const em = d.email.trim().toLowerCase();
  const [dup] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.normalizedEmail, em));
  if (dup) return { ok: false as const, error: "An account with that email exists. Change its role instead." };
  const temp = temporaryPassword();
  const [u] = await db.insert(schema.users).values({ fullName: d.fullName.trim(), email: d.email.trim(), normalizedEmail: em, passwordHash: await hashPassword(temp), platformRole: d.role === "super_admin" ? "curriculum_admin" : d.role, mustChangePassword: true }).returning({ id: schema.users.id });
  await audit(actor, "user.staff_created", { type: "user", id: u.id }, { role: d.role });
  return { ok: true as const, id: u.id, temporaryPassword: temp };
}
export async function revokeUserSessions(actor: Actor, userId: string) {
  const db = await getDb();
  await db.update(schema.sessions).set({ revokedAt: new Date() }).where(and(eq(schema.sessions.userId, userId), sql`${schema.sessions.revokedAt} is null`));
  await audit(actor, "user.sessions_revoked", { type: "user", id: userId });
}

/* ============================ Audit, jobs, health ============================ */
export async function auditPage(f: { q?: string; orgId?: string; page?: number } = {}) {
  const db = await getDb();
  const ps = 50, off = ((f.page ?? 1) - 1) * ps;
  const where = and(f.q ? ilike(schema.auditLogs.action, `%${f.q}%`) : undefined, f.orgId ? eq(schema.auditLogs.organizationId, f.orgId) : undefined);
  const rows = await db.select().from(schema.auditLogs).where(where).orderBy(desc(schema.auditLogs.createdAt)).limit(ps).offset(off);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.auditLogs).where(where);
  return { rows, total: n, page: f.page ?? 1, pageSize: ps };
}

export type JobKind = "maintenance" | "flush_email" | "billing";
export async function enqueueJob(kind: string, payload: Record<string, unknown> = {}, opts: { idempotencyKey?: string; runAfter?: Date } = {}) {
  const db = await getDb();
  await db.insert(schema.backgroundJobs).values({ kind, payload, idempotencyKey: opts.idempotencyKey ?? null, runAfter: opts.runAfter ?? new Date() }).onConflictDoNothing();
}
/** Runs due jobs with retry and back-off. A job that keeps failing is parked as "failed" and shown to the Super Admin. */
export async function runDueJobs(limit = 10) {
  const db = await getDb();
  const out = { ran: 0, failed: 0 };
  const due = await db.update(schema.backgroundJobs).set({ status: "running", lockedAt: new Date(), attempts: sql`${schema.backgroundJobs.attempts} + 1` })
    .where(sql`${schema.backgroundJobs.id} in (select id from background_jobs where status in ('queued') and run_after <= now() order by run_after limit ${limit} for update skip locked)`).returning();
  for (const j of due) {
    try {
      let result: Record<string, unknown> = {};
      if (j.kind === "flush_email") result = await flushOutbox(50);
      else if (j.kind === "billing") result = await billingMaintenance();
      else if (j.kind === "maintenance") { result = { billing: await billingMaintenance(), email: await flushOutbox(50) }; }
      else throw new Error(`Unknown job kind ${j.kind}`);
      await db.update(schema.backgroundJobs).set({ status: "done", result, lastError: null }).where(eq(schema.backgroundJobs.id, j.id));
      out.ran++;
    } catch (e) {
      const final = j.attempts >= j.maxAttempts;
      await db.update(schema.backgroundJobs).set({ status: final ? "failed" : "queued", lastError: (e as Error).message.slice(0, 400), runAfter: new Date(Date.now() + Math.min(3600, 30 * 2 ** j.attempts) * 1000) }).where(eq(schema.backgroundJobs.id, j.id));
      out.failed++;
    }
  }
  return out;
}
export async function jobsOverview() {
  const db = await getDb();
  const jobs = await db.select().from(schema.backgroundJobs).orderBy(desc(schema.backgroundJobs.createdAt)).limit(40);
  const outbox = await db.select({ status: schema.emailOutbox.status, n: sql<number>`count(*)::int` }).from(schema.emailOutbox).groupBy(schema.emailOutbox.status);
  return { jobs, outbox };
}
export async function retryJob(actor: Actor, id: string) {
  const db = await getDb();
  await db.update(schema.backgroundJobs).set({ status: "queued", attempts: 0, runAfter: new Date(), lastError: null }).where(eq(schema.backgroundJobs.id, id));
  await audit(actor, "job.retried", { type: "job", id });
}
export async function health() {
  const db = await getDb();
  const t0 = Date.now();
  await db.execute(sql`select 1`);
  return { database: "up", latencyMs: Date.now() - t0, email: process.env.RESEND_API_KEY ? "configured" : "not configured", payments: process.env.PAYSTACK_SECRET_KEY ? "configured" : "not configured", authSecret: process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32 ? "set" : "missing" };
}
export { asc };
