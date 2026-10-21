import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { AccessError, NotFoundError, assertCan, type OrgCtx } from "../org";
import { audit } from "../audit";
import { friendlyCode } from "../crypto";
import { assertFeature } from "./entitlements";
import { orgSettings } from "./church";
import { notify } from "./notify";
import { pct } from "@/lib/text";

export interface Eligibility { eligible: boolean; reasons: string[]; stats: { attendance: number | null; completion: number | null; finalPercent: number | null } }

/** Checks the church's configured completion rules. Certificates are NEVER issued automatically for learners who do not meet them. */
export async function eligibility(ctx: OrgCtx, assignmentId: string, learnerId: string): Promise<Eligibility> {
  const rules = orgSettings(ctx).certificate;
  const db = await getDb();
  const [a] = await db.select().from(schema.curriculumAssignments).where(and(eq(schema.curriculumAssignments.id, assignmentId), eq(schema.curriculumAssignments.organizationId, ctx.orgId)));
  if (!a) throw new NotFoundError("Programme not found.");
  const sl = await db.select({ id: schema.scheduledLessons.id, status: schema.scheduledLessons.status }).from(schema.scheduledLessons).where(and(eq(schema.scheduledLessons.assignmentId, assignmentId), eq(schema.scheduledLessons.organizationId, ctx.orgId)));
  const slIds = sl.map((s) => s.id);
  const [att] = await db.select({ total: sql<number>`count(*)::int`, present: sql<number>`count(*) filter (where ${schema.attendanceRecords.status} in ('present','late'))::int` }).from(schema.attendanceRecords).innerJoin(schema.attendanceSessions, eq(schema.attendanceSessions.id, schema.attendanceRecords.attendanceSessionId))
    .where(and(eq(schema.attendanceRecords.organizationId, ctx.orgId), eq(schema.attendanceRecords.learnerId, learnerId), inArray(schema.attendanceSessions.scheduledLessonId, slIds)));
  const taught = sl.filter((s) => s.status === "completed").length;
  const [done] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.lessonProgress).where(and(eq(schema.lessonProgress.organizationId, ctx.orgId), eq(schema.lessonProgress.learnerId, learnerId), eq(schema.lessonProgress.status, "completed"), inArray(schema.lessonProgress.scheduledLessonId, slIds)));
  const [fin] = await db.select({ p: sql<number | null>`max(${schema.assessmentResults.percentage})::float` }).from(schema.assessmentResults).innerJoin(schema.examinations, eq(schema.examinations.id, schema.assessmentResults.examId))
    .where(and(eq(schema.assessmentResults.organizationId, ctx.orgId), eq(schema.assessmentResults.learnerId, learnerId), eq(schema.examinations.assignmentId, assignmentId), eq(schema.examinations.kind, "final"), eq(schema.assessmentResults.publicationStatus, "published")));
  const attendance = att.total ? pct(att.present, att.total) : null;
  const completion = taught ? pct(done.n, taught) : null;
  const reasons: string[] = [];
  if (attendance === null || attendance < rules.minAttendancePercent) reasons.push(`Attendance ${attendance ?? 0}% is below the required ${rules.minAttendancePercent}%.`);
  if (completion === null || completion < rules.minLessonCompletionPercent) reasons.push(`Lesson completion ${completion ?? 0}% is below the required ${rules.minLessonCompletionPercent}%.`);
  if (rules.requireFinalExam && fin.p === null) reasons.push("The final examination result has not been published.");
  else if (fin.p !== null && fin.p < rules.minScorePercent) reasons.push(`Final examination score ${Math.round(fin.p)}% is below the required ${rules.minScorePercent}%.`);
  return { eligible: reasons.length === 0, reasons, stats: { attendance, completion, finalPercent: fin.p } };
}

export async function issueCertificate(ctx: OrgCtx, assignmentId: string, learnerId: string) {
  assertCan(ctx, "certificates.issue");
  await assertFeature(ctx.orgId, "certificates");
  const e = await eligibility(ctx, assignmentId, learnerId);
  if (!e.eligible) return { ok: false as const, error: e.reasons[0], reasons: e.reasons };
  const db = await getDb();
  const [row] = await db.select({ u: schema.users.fullName, title: schema.curricula.title, session: schema.academicSessions.name, org: schema.organizations.name, v: schema.curriculumVersions.versionNumber })
    .from(schema.curriculumAssignments).innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumAssignments.curriculumId)).innerJoin(schema.academicSessions, eq(schema.academicSessions.id, schema.curriculumAssignments.sessionId))
    .innerJoin(schema.curriculumVersions, eq(schema.curriculumVersions.id, schema.curriculumAssignments.versionId)).innerJoin(schema.organizations, eq(schema.organizations.id, schema.curriculumAssignments.organizationId))
    .innerJoin(schema.users, eq(schema.users.id, learnerId)).where(and(eq(schema.curriculumAssignments.id, assignmentId), eq(schema.curriculumAssignments.organizationId, ctx.orgId)));
  const [member] = await db.select({ id: schema.organizationMemberships.id }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, ctx.orgId), eq(schema.organizationMemberships.userId, learnerId), eq(schema.organizationMemberships.status, "active")));
  if (!member) throw new NotFoundError("Learner not found in your church.");
  const code = `FSSA-${friendlyCode(3, 4)}`;
  const [c] = await db.insert(schema.certificates).values({ organizationId: ctx.orgId, learnerId, assignmentId, verificationCode: code, issuedBy: ctx.userId, data: { learner: row.u, curriculum: row.title, session: row.session, church: row.org, version: row.v, finalPercent: e.stats.finalPercent, attendance: e.stats.attendance } })
    .onConflictDoNothing().returning({ id: schema.certificates.id, code: schema.certificates.verificationCode });
  if (!c) return { ok: true as const, existing: true };
  await notify(learnerId, { type: "certificate", title: "Your certificate is ready", href: "/learn/certificates", orgId: ctx.orgId, dedupeKey: `cert:${c.id}` });
  await audit({ id: ctx.userId, label: ctx.userName }, "certificate.issued", { type: "certificate", id: c.id }, { learnerId }, { orgId: ctx.orgId });
  return { ok: true as const, code };
}

export async function issueAllEligible(ctx: OrgCtx, assignmentId: string) {
  assertCan(ctx, "certificates.issue");
  const db = await getDb();
  const learners = await db.select({ id: schema.classMemberships.userId }).from(schema.classCurriculumAssignments).innerJoin(schema.classMemberships, eq(schema.classMemberships.classId, schema.classCurriculumAssignments.classId))
    .where(and(eq(schema.classCurriculumAssignments.assignmentId, assignmentId), eq(schema.classCurriculumAssignments.organizationId, ctx.orgId), eq(schema.classMemberships.status, "active")));
  let issued = 0, skipped = 0;
  for (const id of [...new Set(learners.map((l) => l.id))]) { const r = await issueCertificate(ctx, assignmentId, id); if (r.ok && !("existing" in r)) issued++; else skipped++; }
  return { issued, skipped };
}

export async function myCertificates(ctx: OrgCtx) {
  const db = await getDb();
  return db.select().from(schema.certificates).where(and(eq(schema.certificates.organizationId, ctx.orgId), eq(schema.certificates.learnerId, ctx.userId))).orderBy(desc(schema.certificates.issuedAt));
}
export async function certificateForPrint(ctx: OrgCtx, id: string) {
  const db = await getDb();
  const [c] = await db.select().from(schema.certificates).where(and(eq(schema.certificates.id, id), eq(schema.certificates.organizationId, ctx.orgId)));
  if (!c) throw new NotFoundError("Certificate not found.");
  if (ctx.role === "learner" && c.learnerId !== ctx.userId) throw new AccessError();
  return c;
}
/** Public verification: reveals only what the certificate itself states (name, course, church, session, date). No scores, no contact details. */
export async function verifyCertificate(code: string) {
  const db = await getDb();
  const [c] = await db.select().from(schema.certificates).where(eq(schema.certificates.verificationCode, code.trim().toUpperCase()));
  if (!c) return null;
  const d = c.data as { learner?: string; curriculum?: string; session?: string; church?: string };
  return { valid: !c.revokedAt, revoked: !!c.revokedAt, learner: d.learner, curriculum: d.curriculum, session: d.session, church: d.church, issuedAt: c.issuedAt };
}
export async function revokeCertificate(ctx: OrgCtx, id: string) {
  assertCan(ctx, "certificates.issue");
  const db = await getDb();
  await db.update(schema.certificates).set({ revokedAt: new Date() }).where(and(eq(schema.certificates.id, id), eq(schema.certificates.organizationId, ctx.orgId)));
}
