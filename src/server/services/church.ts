import "server-only";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { AccessError, NotFoundError, assertCan, assertClassAccess, teacherClassIds, type OrgCtx } from "../org";
import { audit } from "../audit";
import { assertWithinLimit } from "./entitlements";
import { hashPassword } from "../auth/password";
import { friendlyCode, temporaryPassword } from "../crypto";
import { notify, queueEmail } from "./notify";
import { isEmail, normEmail } from "@/lib/text";
import { ASSIGNABLE_ORG_ROLES } from "@/lib/permissions";
import type { OrgRole } from "../db/schema";

/* ===== Members ===== */
export async function listMembers(ctx: OrgCtx, f: { status?: string; role?: string; q?: string; page?: number; pageSize?: number } = {}) {
  assertCan(ctx, "members.manage");
  const db = await getDb();
  const ps = Math.min(f.pageSize ?? 25, 100), off = ((f.page ?? 1) - 1) * ps;
  const where = and(
    eq(schema.organizationMemberships.organizationId, ctx.orgId),
    f.status ? eq(schema.organizationMemberships.status, f.status as "active") : undefined,
    f.role ? eq(schema.organizationMemberships.role, f.role as OrgRole) : undefined,
    f.q ? or(ilike(schema.users.fullName, `%${f.q}%`), ilike(schema.users.email, `%${f.q}%`), ilike(schema.users.username, `%${f.q}%`)) : undefined,
  );
  const rows = await db.select({ id: schema.organizationMemberships.id, userId: schema.users.id, name: schema.users.fullName, email: schema.users.email, username: schema.users.username, role: schema.organizationMemberships.role, status: schema.organizationMemberships.status, joinedAt: schema.organizationMemberships.joinedAt, createdAt: schema.organizationMemberships.createdAt, isMinor: schema.users.isMinor })
    .from(schema.organizationMemberships).innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId)).where(where)
    .orderBy(desc(schema.organizationMemberships.createdAt)).limit(ps).offset(off);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.organizationMemberships).innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId)).where(where);
  return { rows, total: n, page: f.page ?? 1, pageSize: ps };
}

async function loadMembership(ctx: OrgCtx, membershipId: string) {
  const db = await getDb();
  // The organisation id comes from the caller's context, so another church's membership id simply is not found.
  const [m] = await db.select().from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.id, membershipId), eq(schema.organizationMemberships.organizationId, ctx.orgId)));
  if (!m) throw new NotFoundError("Member not found.");
  return m;
}
async function activeAdminCount(orgId: string) {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, orgId), eq(schema.organizationMemberships.role, "church_admin"), eq(schema.organizationMemberships.status, "active")));
  return r.n;
}

export async function decideMembership(ctx: OrgCtx, membershipId: string, decision: "approve" | "reject", role?: OrgRole) {
  assertCan(ctx, "members.manage");
  const m = await loadMembership(ctx, membershipId);
  if (m.status !== "pending") throw new AccessError("That request has already been decided.");
  const db = await getDb();
  const newRole = role && ASSIGNABLE_ORG_ROLES.includes(role) ? role : m.role === "church_admin" ? "learner" : m.role;
  if (decision === "approve") {
    if (newRole === "learner") await assertWithinLimit(ctx.orgId, "maxLearners", await countLearners(ctx.orgId));
    await db.update(schema.organizationMemberships).set({ status: "active", role: newRole, joinedAt: new Date(), decidedBy: ctx.userId }).where(eq(schema.organizationMemberships.id, m.id));
    await notify(m.userId, { type: "membership", title: `Welcome to ${ctx.orgName}`, body: "Your church has approved your membership. Your classes and lessons are now available.", href: "/learn", orgId: ctx.orgId, dedupeKey: `approved:${m.id}` });
  } else {
    await db.update(schema.organizationMemberships).set({ status: "rejected", decidedBy: ctx.userId }).where(eq(schema.organizationMemberships.id, m.id));
  }
  await audit({ id: ctx.userId, label: ctx.userName }, `member.${decision}`, { type: "membership", id: m.id }, { role: newRole }, { orgId: ctx.orgId });
}

export async function changeMemberRole(ctx: OrgCtx, membershipId: string, role: OrgRole) {
  assertCan(ctx, "members.manage");
  const m = await loadMembership(ctx, membershipId);
  if (!(ASSIGNABLE_ORG_ROLES.includes(role) || (role === "church_admin" && ctx.role === "church_admin"))) throw new AccessError("You cannot assign that role.");
  if (m.role === "church_admin" && ctx.role !== "church_admin") throw new AccessError("Only a church administrator can change an administrator.");
  if (m.role === "church_admin" && role !== "church_admin" && (await activeAdminCount(ctx.orgId)) <= 1) throw new AccessError("A church must keep at least one administrator.");
  if (role === "church_admin" || role === "assistant_admin") await assertWithinLimit(ctx.orgId, "maxAdmins", await countAdmins(ctx.orgId), m.role === role ? 0 : 1);
  const db = await getDb();
  await db.update(schema.organizationMemberships).set({ role }).where(eq(schema.organizationMemberships.id, m.id));
  await audit({ id: ctx.userId, label: ctx.userName }, "member.role_changed", { type: "membership", id: m.id }, { from: m.role, to: role }, { orgId: ctx.orgId });
}

export async function removeMember(ctx: OrgCtx, membershipId: string) {
  assertCan(ctx, "members.manage");
  const m = await loadMembership(ctx, membershipId);
  if (m.userId === ctx.userId) throw new AccessError("You cannot remove yourself.");
  if (m.role === "church_admin" && (ctx.role !== "church_admin" || (await activeAdminCount(ctx.orgId)) <= 1)) throw new AccessError("That administrator cannot be removed.");
  const db = await getDb();
  await db.update(schema.organizationMemberships).set({ status: "removed" }).where(eq(schema.organizationMemberships.id, m.id));
  await db.update(schema.classMemberships).set({ status: "left" }).where(and(eq(schema.classMemberships.organizationId, ctx.orgId), eq(schema.classMemberships.userId, m.userId)));
  await audit({ id: ctx.userId, label: ctx.userName }, "member.removed", { type: "membership", id: m.id }, {}, { orgId: ctx.orgId });
}

export async function countLearners(orgId: string) {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, orgId), eq(schema.organizationMemberships.role, "learner"), eq(schema.organizationMemberships.status, "active")));
  return r.n;
}
async function countAdmins(orgId: string) {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, orgId), inArray(schema.organizationMemberships.role, ["church_admin", "assistant_admin"]), eq(schema.organizationMemberships.status, "active")));
  return r.n;
}

const managedSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().max(254).optional().default(""),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{4,30}$/, "Username: 4-30 letters, numbers, dots, dashes or underscores.").optional().or(z.literal("")),
  role: z.enum(["learner", "teacher", "assistant_admin", "exam_supervisor"]).default("learner"),
  isMinor: z.boolean().default(false),
});
/** An administrator creates an account directly (for example for a child without an email address). Returns the one-time temporary password. */
export async function addManagedMember(ctx: OrgCtx, input: z.input<typeof managedSchema>) {
  assertCan(ctx, "members.manage");
  const p = managedSchema.safeParse(input);
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message };
  const d = p.data;
  if (!d.email && !d.username) return { ok: false as const, error: "Enter an email address or a username." };
  if (d.email && !isEmail(d.email)) return { ok: false as const, error: "Enter a valid email address." };
  if (d.role === "learner") await assertWithinLimit(ctx.orgId, "maxLearners", await countLearners(ctx.orgId));
  if (d.role === "assistant_admin") await assertWithinLimit(ctx.orgId, "maxAdmins", await countAdmins(ctx.orgId));
  const db = await getDb();
  const em = d.email ? normEmail(d.email) : null;
  if (em) { const [t] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.normalizedEmail, em)); if (t) return { ok: false as const, error: "An account with that email already exists. Ask the person to register and choose your church." }; }
  if (d.username) { const [t] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, d.username)); if (t) return { ok: false as const, error: "That username is taken." }; }
  const temp = temporaryPassword();
  const hash = await hashPassword(temp);
  const userId = await db.transaction(async (tx) => {
    const [u] = await tx.insert(schema.users).values({ fullName: d.fullName, email: d.email || null, normalizedEmail: em, username: d.username || null, passwordHash: hash, mustChangePassword: true, isMinor: d.isMinor, showChurchInForum: !d.isMinor }).returning({ id: schema.users.id });
    await tx.insert(schema.organizationMemberships).values({ organizationId: ctx.orgId, userId: u.id, role: d.role, status: "active", joinedAt: new Date(), decidedBy: ctx.userId });
    await audit({ id: ctx.userId, label: ctx.userName }, "member.created", { type: "user", id: u.id }, { role: d.role }, { orgId: ctx.orgId, db: tx });
    return u.id;
  });
  return { ok: true as const, userId, temporaryPassword: temp };
}

/** Pending members of the caller's church only. */
export async function pendingCount(ctx: OrgCtx) {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, ctx.orgId), eq(schema.organizationMemberships.status, "pending")));
  return r.n;
}

/* ===== Classes ===== */
export async function listClasses(ctx: OrgCtx) {
  assertCan(ctx, "classes.view");
  const db = await getDb();
  const allowed = await teacherClassIds(ctx);
  const rows = await db.select({ id: schema.classes.id, name: schema.classes.name, description: schema.classes.description, ageGroup: schema.classes.ageGroup, status: schema.classes.status,
    learners: sql<number>`(select count(*)::int from class_memberships cm where cm.class_id = ${schema.classes.id} and cm.status = 'active')`,
    teachers: sql<string[]>`coalesce((select array_agg(u.full_name order by u.full_name) from class_teacher_assignments ct join users u on u.id = ct.teacher_id where ct.class_id = ${schema.classes.id}), '{}')` })
    .from(schema.classes).where(and(eq(schema.classes.organizationId, ctx.orgId), allowed === "all" ? undefined : inArray(schema.classes.id, allowed.length ? allowed : ["00000000-0000-0000-0000-000000000000"]))).orderBy(asc(schema.classes.name));
  return rows;
}

export async function createClass(ctx: OrgCtx, input: { name: string; description?: string; ageGroup?: string }) {
  assertCan(ctx, "classes.manage");
  const name = input.name.trim();
  if (name.length < 2) return { ok: false as const, error: "Enter a class name." };
  const db = await getDb();
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.classes).where(and(eq(schema.classes.organizationId, ctx.orgId), eq(schema.classes.status, "active")));
  await assertWithinLimit(ctx.orgId, "maxClasses", n.n);
  const [dup] = await db.select({ id: schema.classes.id }).from(schema.classes).where(and(eq(schema.classes.organizationId, ctx.orgId), eq(schema.classes.name, name)));
  if (dup) return { ok: false as const, error: "You already have a class with that name." };
  const [c] = await db.insert(schema.classes).values({ organizationId: ctx.orgId, name, description: input.description?.trim() ?? "", ageGroup: input.ageGroup?.trim() || null }).returning({ id: schema.classes.id });
  await audit({ id: ctx.userId, label: ctx.userName }, "class.created", { type: "class", id: c.id }, { name }, { orgId: ctx.orgId });
  return { ok: true as const, id: c.id };
}

export async function classDetail(ctx: OrgCtx, classId: string) {
  await assertClassAccess(ctx, classId);
  const db = await getDb();
  const [c] = await db.select().from(schema.classes).where(and(eq(schema.classes.id, classId), eq(schema.classes.organizationId, ctx.orgId)));
  const learners = await db.select({ userId: schema.users.id, name: schema.users.fullName, status: schema.classMemberships.status }).from(schema.classMemberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.classMemberships.userId))
    .where(and(eq(schema.classMemberships.classId, classId), eq(schema.classMemberships.organizationId, ctx.orgId), eq(schema.classMemberships.status, "active"))).orderBy(asc(schema.users.fullName));
  const teachers = await db.select({ userId: schema.users.id, name: schema.users.fullName }).from(schema.classTeachers)
    .innerJoin(schema.users, eq(schema.users.id, schema.classTeachers.teacherId))
    .where(and(eq(schema.classTeachers.classId, classId), eq(schema.classTeachers.organizationId, ctx.orgId))).orderBy(asc(schema.users.fullName));
  return { class: c, learners, teachers };
}

async function assertMemberRole(ctx: OrgCtx, userId: string, roles: OrgRole[]) {
  const db = await getDb();
  const [m] = await db.select().from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, ctx.orgId), eq(schema.organizationMemberships.userId, userId), eq(schema.organizationMemberships.status, "active")));
  if (!m || !roles.includes(m.role)) throw new NotFoundError("That person is not an eligible active member of your church.");
}

export async function assignTeacher(ctx: OrgCtx, classId: string, teacherId: string) {
  assertCan(ctx, "classes.manage");
  await assertClassAccess(ctx, classId);
  await assertMemberRole(ctx, teacherId, ["teacher", "assistant_admin", "church_admin"]);
  const db = await getDb();
  await db.insert(schema.classTeachers).values({ organizationId: ctx.orgId, classId, teacherId }).onConflictDoNothing();
  await audit({ id: ctx.userId, label: ctx.userName }, "class.teacher_assigned", { type: "class", id: classId }, { teacherId }, { orgId: ctx.orgId });
}
export async function unassignTeacher(ctx: OrgCtx, classId: string, teacherId: string) {
  assertCan(ctx, "classes.manage");
  await assertClassAccess(ctx, classId);
  const db = await getDb();
  await db.delete(schema.classTeachers).where(and(eq(schema.classTeachers.organizationId, ctx.orgId), eq(schema.classTeachers.classId, classId), eq(schema.classTeachers.teacherId, teacherId)));
}
export async function enrolLearner(ctx: OrgCtx, classId: string, learnerId: string) {
  assertCan(ctx, "classes.manage");
  await assertClassAccess(ctx, classId);
  await assertMemberRole(ctx, learnerId, ["learner"]);
  const db = await getDb();
  await db.insert(schema.classMemberships).values({ organizationId: ctx.orgId, classId, userId: learnerId }).onConflictDoUpdate({ target: [schema.classMemberships.classId, schema.classMemberships.userId], set: { status: "active" } });
  await audit({ id: ctx.userId, label: ctx.userName }, "class.learner_enrolled", { type: "class", id: classId }, { learnerId }, { orgId: ctx.orgId });
}
export async function unenrolLearner(ctx: OrgCtx, classId: string, learnerId: string) {
  assertCan(ctx, "classes.manage");
  await assertClassAccess(ctx, classId);
  const db = await getDb();
  await db.update(schema.classMemberships).set({ status: "left" }).where(and(eq(schema.classMemberships.organizationId, ctx.orgId), eq(schema.classMemberships.classId, classId), eq(schema.classMemberships.userId, learnerId)));
}

/** People in the caller's church by role, for pickers. */
export async function peopleByRole(ctx: OrgCtx, roles: OrgRole[]) {
  assertCan(ctx, "classes.view");
  const db = await getDb();
  return db.select({ userId: schema.users.id, name: schema.users.fullName }).from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId))
    .where(and(eq(schema.organizationMemberships.organizationId, ctx.orgId), eq(schema.organizationMemberships.status, "active"), inArray(schema.organizationMemberships.role, roles))).orderBy(asc(schema.users.fullName));
}

/** Learners the caller may see: all (admins) or only those in their assigned classes (teachers). */
export async function visibleLearners(ctx: OrgCtx) {
  assertCan(ctx, "classes.view");
  const db = await getDb();
  const allowed = await teacherClassIds(ctx);
  if (allowed === "all") return peopleByRole(ctx, ["learner"]);
  if (!allowed.length) return [];
  return db.selectDistinct({ userId: schema.users.id, name: schema.users.fullName }).from(schema.classMemberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.classMemberships.userId))
    .where(and(eq(schema.classMemberships.organizationId, ctx.orgId), inArray(schema.classMemberships.classId, allowed), eq(schema.classMemberships.status, "active"))).orderBy(asc(schema.users.fullName));
}

/* ===== Church profile and settings ===== */
export const ORG_SETTING_DEFAULTS = {
  teachingWeekday: 0, dateFormat: "dd MMM yyyy", lessonOpenDaysBefore: 1, attendanceLateAfterMinutes: 15, resultVisibility: "after_publish" as "after_publish" | "immediate",
  teachersPublishResults: true, allowedDownloads: ["lesson", "teacher_guide", "student_notes"] as string[],
  certificate: { minAttendancePercent: 60, minLessonCompletionPercent: 70, requireFinalExam: true, minScorePercent: 50 },
  gradeScale: null as null | { min: number; grade: string }[],
};
export function orgSettings(ctx: OrgCtx) {
  const s = ctx.orgSettings as Partial<typeof ORG_SETTING_DEFAULTS>;
  return { ...ORG_SETTING_DEFAULTS, ...s, certificate: { ...ORG_SETTING_DEFAULTS.certificate, ...(s.certificate ?? {}) } };
}

export async function getOrgProfile(ctx: OrgCtx) {
  const db = await getDb();
  const [o] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId));
  return o;
}
export async function updateOrgProfile(ctx: OrgCtx, input: Partial<{ name: string; type: string; denomination: string; country: string; state: string; city: string; address: string; contactEmail: string; phone: string; timezone: string; currency: string; language: string }>) {
  assertCan(ctx, "org.profile.edit");
  const db = await getDb();
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (typeof v === "string") set[k] = v.trim() || null;
  if (set.name === null) delete set.name;
  if (typeof set.name === "string") set.normalizedName = (await import("@/lib/text")).normName(set.name as string);
  await db.update(schema.organizations).set(set).where(eq(schema.organizations.id, ctx.orgId));
  await audit({ id: ctx.userId, label: ctx.userName }, "org.profile_updated", { type: "organization", id: ctx.orgId }, { fields: Object.keys(set) }, { orgId: ctx.orgId });
}
export async function updateOrgSettings(ctx: OrgCtx, patch: Record<string, unknown>) {
  assertCan(ctx, "org.settings");
  const db = await getDb();
  const merged = { ...ctx.orgSettings, ...patch };
  await db.update(schema.organizations).set({ settings: merged }).where(eq(schema.organizations.id, ctx.orgId));
  await audit({ id: ctx.userId, label: ctx.userName }, "org.settings_updated", { type: "organization", id: ctx.orgId }, { keys: Object.keys(patch) }, { orgId: ctx.orgId });
}
export async function regenerateJoinCode(ctx: OrgCtx) {
  assertCan(ctx, "org.settings");
  const db = await getDb();
  const code = friendlyCode();
  await db.update(schema.organizations).set({ joinCode: code }).where(eq(schema.organizations.id, ctx.orgId));
  return code;
}
export async function setAutoApprove(ctx: OrgCtx, on: boolean) {
  assertCan(ctx, "org.settings");
  const db = await getDb();
  await db.update(schema.organizations).set({ autoApproveMembers: on }).where(eq(schema.organizations.id, ctx.orgId));
}

/* ===== Announcements ===== */
export async function listAnnouncements(ctx: OrgCtx, limit = 10) {
  const db = await getDb();
  return db.select().from(schema.announcements).where(and(eq(schema.announcements.organizationId, ctx.orgId))).orderBy(desc(schema.announcements.createdAt)).limit(limit);
}
export async function createAnnouncement(ctx: OrgCtx, title: string, body: string) {
  assertCan(ctx, "announcements.manage");
  if (title.trim().length < 3 || body.trim().length < 3) return { ok: false as const, error: "Enter a title and a message." };
  const db = await getDb();
  const [a] = await db.insert(schema.announcements).values({ organizationId: ctx.orgId, title: title.trim(), body: body.trim(), createdBy: ctx.userId }).returning({ id: schema.announcements.id });
  const members = await db.select({ id: schema.users.id, email: schema.users.email, pref: schema.users.emailNotifications }).from(schema.organizationMemberships).innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId))
    .where(and(eq(schema.organizationMemberships.organizationId, ctx.orgId), eq(schema.organizationMemberships.status, "active"), ne(schema.organizationMemberships.userId, ctx.userId)));
  for (const m of members) {
    await notify(m.id, { type: "announcement", title: title.trim(), body: body.trim().slice(0, 300), orgId: ctx.orgId, dedupeKey: `ann:${a.id}`, href: "/learn" });
    if (m.email && m.pref) await queueEmail(m.email, `${ctx.orgName}: ${title.trim()}`, body.trim(), `ann:${a.id}:${m.id}`);
  }
  return { ok: true as const };
}
