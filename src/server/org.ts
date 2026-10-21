import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { orgCan, type OrgPerm } from "@/lib/permissions";
import type { OrgRole } from "./db/schema";

export class AccessError extends Error {
  constructor(message = "You do not have permission to do that.") { super(message); this.name = "AccessError"; }
}
export class NotFoundError extends Error {
  constructor(message = "Not found.") { super(message); this.name = "NotFoundError"; }
}

/**
 * The ONLY way services learn which church a request belongs to. It is derived on the server from the signed-in user's
 * ACTIVE membership; it is never read from a URL, form field or request body.
 */
export interface OrgCtx {
  readonly userId: string;
  readonly userName: string;
  readonly orgId: string;
  readonly orgName: string;
  readonly role: OrgRole;
  readonly orgSettings: Record<string, unknown>;
  readonly timezone: string;
  readonly currency: string;
}

export interface MembershipSummary { orgId: string; orgName: string; orgStatus: string; role: OrgRole; status: string }

export async function listMemberships(userId: string): Promise<MembershipSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({ orgId: schema.organizations.id, orgName: schema.organizations.name, orgStatus: schema.organizations.status, role: schema.organizationMemberships.role, status: schema.organizationMemberships.status })
    .from(schema.organizationMemberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationMemberships.organizationId))
    .where(eq(schema.organizationMemberships.userId, userId))
    .orderBy(asc(schema.organizationMemberships.createdAt));
  return rows as MembershipSummary[];
}

/** Builds the organisation context for a user. Returns null unless the user has an ACTIVE membership in an ACTIVE church. */
export async function resolveOrgCtx(userId: string, preferredOrgId?: string | null): Promise<OrgCtx | null> {
  const db = await getDb();
  const rows = await db
    .select({ m: schema.organizationMemberships, o: schema.organizations, u: schema.users })
    .from(schema.organizationMemberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationMemberships.organizationId))
    .innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId))
    .where(and(eq(schema.organizationMemberships.userId, userId), eq(schema.organizationMemberships.status, "active"), eq(schema.organizations.status, "active")))
    .orderBy(asc(schema.organizationMemberships.createdAt));
  if (!rows.length) return null;
  const pick = rows.find((r) => r.o.id === preferredOrgId) ?? rows[0];
  return { userId, userName: pick.u.fullName, orgId: pick.o.id, orgName: pick.o.name, role: pick.m.role, orgSettings: pick.o.settings, timezone: pick.o.timezone, currency: pick.o.currency };
}

export function can(ctx: OrgCtx, perm: OrgPerm) { return orgCan(ctx.role, perm); }
export function assertCan(ctx: OrgCtx, perm: OrgPerm) { if (!orgCan(ctx.role, perm)) throw new AccessError(); }

/** Class ids a teacher may work with. Administrators and read-only staff see every class in their own church. */
export async function teacherClassIds(ctx: OrgCtx): Promise<string[] | "all"> {
  if (ctx.role === "church_admin" || ctx.role === "assistant_admin" || ctx.role === "coordinator" || ctx.role === "auditor" || ctx.role === "exam_supervisor") return "all";
  const db = await getDb();
  const rows = await db.select({ id: schema.classTeachers.classId }).from(schema.classTeachers)
    .where(and(eq(schema.classTeachers.organizationId, ctx.orgId), eq(schema.classTeachers.teacherId, ctx.userId)));
  return rows.map((r) => r.id);
}

/** Throws unless the class belongs to the caller's church AND (for teachers) is assigned to them. */
export async function assertClassAccess(ctx: OrgCtx, classId: string) {
  const db = await getDb();
  const [c] = await db.select({ id: schema.classes.id }).from(schema.classes).where(and(eq(schema.classes.id, classId), eq(schema.classes.organizationId, ctx.orgId)));
  if (!c) throw new NotFoundError("Class not found.");
  const allowed = await teacherClassIds(ctx);
  if (allowed !== "all" && !allowed.includes(classId)) throw new AccessError("That class is not assigned to you.");
  return c;
}
