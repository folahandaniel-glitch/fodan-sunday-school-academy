import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema, qid } from "../db";
import { assertCan, teacherClassIds, type OrgCtx } from "../org";
import { pct } from "@/lib/text";
import { hasFeature } from "./entitlements";

export const csvEscape = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"` : s; };
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";

export async function churchOverview(ctx: OrgCtx) {
  assertCan(ctx, "classes.view");
  const db = await getDb();
  const by = await db.select({ role: schema.organizationMemberships.role, status: schema.organizationMemberships.status, n: sql<number>`count(*)::int` }).from(schema.organizationMemberships).where(eq(schema.organizationMemberships.organizationId, ctx.orgId)).groupBy(schema.organizationMemberships.role, schema.organizationMemberships.status);
  const n = (role: string, status = "active") => by.find((r) => r.role === role && r.status === status)?.n ?? 0;
  const [cl] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.classes).where(and(eq(schema.classes.organizationId, ctx.orgId), eq(schema.classes.status, "active")));
  const [pr] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.curriculumAssignments).where(and(eq(schema.curriculumAssignments.organizationId, ctx.orgId), eq(schema.curriculumAssignments.status, "active")));
  const [att] = await db.select({ total: sql<number>`count(*)::int`, present: sql<number>`count(*) filter (where status in ('present','late'))::int` }).from(schema.attendanceRecords).where(eq(schema.attendanceRecords.organizationId, ctx.orgId));
  const [ex] = await db.select({ n: sql<number>`count(*)::int`, avg: sql<number | null>`avg(percentage)::float`, pass: sql<number>`count(*) filter (where pass_status = 'pass')::int` }).from(schema.assessmentResults).where(eq(schema.assessmentResults.organizationId, ctx.orgId));
  const upcoming = await db.select({ week: schema.scheduledLessons.weekNumber, date: schema.scheduledLessons.scheduledDate, title: schema.curriculumLessons.title, id: schema.scheduledLessons.id, type: schema.scheduledLessons.lessonType })
    .from(schema.scheduledLessons).innerJoin(schema.curriculumLessons, eq(schema.curriculumLessons.id, schema.scheduledLessons.lessonId)).innerJoin(schema.curriculumAssignments, eq(schema.curriculumAssignments.id, schema.scheduledLessons.assignmentId))
    .where(and(eq(schema.scheduledLessons.organizationId, ctx.orgId), eq(schema.curriculumAssignments.status, "active"), sql`${schema.scheduledLessons.scheduledDate} >= current_date`, sql`${schema.scheduledLessons.status} <> 'completed'`)).orderBy(asc(schema.scheduledLessons.scheduledDate)).limit(5);
  return { learners: n("learner"), teachers: n("teacher"), pending: by.filter((r) => r.status === "pending").reduce((a, r) => a + r.n, 0), classes: cl.n, programmes: pr.n, attendancePercent: att.total ? pct(att.present, att.total) : null, resultsCount: ex.n, averageScore: ex.avg === null ? null : Math.round(ex.avg), passRate: ex.n ? pct(ex.pass, ex.n) : null, upcoming };
}

export interface ReportFilter { classId?: string; from?: string; to?: string; assignmentId?: string }

/** Church report. Teachers are limited to their assigned classes; the scope is enforced here, not in the page. */
export async function churchReport(ctx: OrgCtx, f: ReportFilter = {}) {
  assertCan(ctx, "reports.view");
  const db = await getDb();
  const allowed = await teacherClassIds(ctx);
  let classes = await db.select({ id: schema.classes.id, name: schema.classes.name }).from(schema.classes).where(and(eq(schema.classes.organizationId, ctx.orgId), allowed === "all" ? undefined : inArray(schema.classes.id, allowed.length ? allowed : ["00000000-0000-0000-0000-000000000000"]))).orderBy(asc(schema.classes.name));
  if (f.classId) classes = classes.filter((c) => c.id === f.classId);
  const classIds = classes.map((c) => c.id);
  const learners = classIds.length ? await db.select({ id: schema.users.id, name: schema.users.fullName, classId: schema.classMemberships.classId }).from(schema.classMemberships).innerJoin(schema.users, eq(schema.users.id, schema.classMemberships.userId))
    .where(and(eq(schema.classMemberships.organizationId, ctx.orgId), inArray(schema.classMemberships.classId, classIds), eq(schema.classMemberships.status, "active"))).orderBy(asc(schema.users.fullName)) : [];
  const ids = [...new Set(learners.map((l) => l.id))];
  const dateWhere = [f.from ? gte(schema.attendanceSessions.sessionDate, f.from) : undefined, f.to ? lte(schema.attendanceSessions.sessionDate, f.to) : undefined];
  const att = ids.length ? await db.select({ learnerId: schema.attendanceRecords.learnerId, status: schema.attendanceRecords.status, date: schema.attendanceSessions.sessionDate, classId: schema.attendanceSessions.classId }).from(schema.attendanceRecords).innerJoin(schema.attendanceSessions, eq(schema.attendanceSessions.id, schema.attendanceRecords.attendanceSessionId))
    .where(and(eq(schema.attendanceRecords.organizationId, ctx.orgId), inArray(schema.attendanceRecords.learnerId, ids), inArray(schema.attendanceSessions.classId, classIds), ...dateWhere)) : [];
  const prog = ids.length ? await db.select({ learnerId: schema.lessonProgress.learnerId, n: sql<number>`count(*)::int` }).from(schema.lessonProgress).where(and(eq(schema.lessonProgress.organizationId, ctx.orgId), inArray(schema.lessonProgress.learnerId, ids), eq(schema.lessonProgress.status, "completed"))).groupBy(schema.lessonProgress.learnerId) : [];
  const [{ taught }] = await db.select({ taught: sql<number>`count(*)::int` }).from(schema.scheduledLessons).innerJoin(schema.curriculumAssignments, eq(schema.curriculumAssignments.id, schema.scheduledLessons.assignmentId))
    .where(and(eq(schema.scheduledLessons.organizationId, ctx.orgId), eq(schema.curriculumAssignments.status, "active"), sql`${schema.scheduledLessons.scheduledDate} <= current_date`, f.assignmentId ? eq(schema.scheduledLessons.assignmentId, f.assignmentId) : undefined));
  const res = ids.length ? await db.select({ learnerId: schema.assessmentResults.learnerId, pct: schema.assessmentResults.percentage, pass: schema.assessmentResults.passStatus, exam: schema.examinations.title, kind: schema.examinations.kind, published: schema.assessmentResults.publicationStatus })
    .from(schema.assessmentResults).innerJoin(schema.examinations, eq(schema.examinations.id, schema.assessmentResults.examId)).where(and(eq(schema.assessmentResults.organizationId, ctx.orgId), inArray(schema.assessmentResults.learnerId, ids))) : [];
  const asg = ids.length ? await db.select({ learnerId: schema.assignmentSubmissions.learnerId, n: sql<number>`count(*)::int` }).from(schema.assignmentSubmissions).where(and(eq(schema.assignmentSubmissions.organizationId, ctx.orgId), inArray(schema.assignmentSubmissions.learnerId, ids))).groupBy(schema.assignmentSubmissions.learnerId) : [];
  const [{ asgTotal }] = classIds.length ? await db.select({ asgTotal: sql<number>`count(*)::int` }).from(schema.assignments).where(and(eq(schema.assignments.organizationId, ctx.orgId), inArray(schema.assignments.classId, classIds), eq(schema.assignments.status, "published"))) : [{ asgTotal: 0 }];
  const rows = [...new Map(learners.map((l) => [l.id, l])).values()].map((l) => {
    const a = att.filter((x) => x.learnerId === l.id), present = a.filter((x) => x.status === "present" || x.status === "late").length;
    const completed = prog.find((p) => p.learnerId === l.id)?.n ?? 0;
    const r = res.filter((x) => x.learnerId === l.id);
    const avg = r.length ? Math.round(r.reduce((s, x) => s + x.pct, 0) / r.length) : null;
    const attendance = a.length ? pct(present, a.length) : null;
    const support = (attendance !== null && attendance < 50) || (avg !== null && avg < 40) || (taught > 3 && pct(completed, taught) < 40);
    return { id: l.id, name: l.name, classes: learners.filter((x) => x.id === l.id).map((x) => classes.find((c) => c.id === x.classId)?.name).filter(Boolean).join(", "), attendance, sessions: a.length, lessonsCompleted: completed, lessonsTaught: taught, completion: taught ? pct(completed, taught) : null, assignmentsDone: asg.find((x) => x.learnerId === l.id)?.n ?? 0, assignmentsTotal: asgTotal, examAverage: avg, examsTaken: r.length, support };
  });
  const byDate = new Map<string, { present: number; total: number }>();
  for (const a of att) { const e = byDate.get(a.date) ?? { present: 0, total: 0 }; e.total++; if (a.status === "present" || a.status === "late") e.present++; byDate.set(a.date, e); }
  const advanced = await hasFeature(ctx.orgId, "advancedReports");
  return { classes, learners: rows, attendanceByDate: [...byDate.entries()].sort().map(([date, v]) => ({ date, ...v, percent: pct(v.present, v.total) })), support: rows.filter((r) => r.support), advanced, passRate: res.length ? pct(res.filter((r) => r.pass === "pass").length, res.length) : null, averageScore: res.length ? Math.round(res.reduce((s, r) => s + r.pct, 0) / res.length) : null };
}

export async function reportCsv(ctx: OrgCtx, f: ReportFilter = {}) {
  const r = await churchReport(ctx, f);
  return toCsv([["Learner", "Classes", "Attendance %", "Sessions recorded", "Lessons completed", "Lessons taught so far", "Assignments submitted", "Assignments published", "Exam average %", "Exams taken", "Needs support"],
    ...r.learners.map((l) => [l.name, l.classes, l.attendance ?? "", l.sessions, l.lessonsCompleted, l.lessonsTaught, l.assignmentsDone, l.assignmentsTotal, l.examAverage ?? "", l.examsTaken, l.support ? "Yes" : ""])]);
}

/** Per-session summary for a church (the "session report" download). */
export async function sessionReport(ctx: OrgCtx, assignmentId: string) {
  assertCan(ctx, "reports.view");
  const db = await getDb();
  const lessons = await db.select({ week: schema.scheduledLessons.weekNumber, date: schema.scheduledLessons.scheduledDate, type: schema.scheduledLessons.lessonType, status: schema.scheduledLessons.status, title: schema.curriculumLessons.title })
    .from(schema.scheduledLessons).innerJoin(schema.curriculumLessons, eq(schema.curriculumLessons.id, schema.scheduledLessons.lessonId)).where(and(eq(schema.scheduledLessons.assignmentId, assignmentId), eq(schema.scheduledLessons.organizationId, ctx.orgId))).orderBy(asc(schema.scheduledLessons.weekNumber));
  const exams = await db.select({ title: schema.examinations.title, kind: schema.examinations.kind, status: schema.examinations.status, n: sql<number>`(select count(*)::int from assessment_results r where r.exam_id = ${qid(schema.examinations)})`, avg: sql<number | null>`(select avg(percentage)::float from assessment_results r where r.exam_id = ${qid(schema.examinations)})`, pass: sql<number>`(select count(*)::int from assessment_results r where r.exam_id = ${qid(schema.examinations)} and r.pass_status = 'pass')` })
    .from(schema.examinations).where(and(eq(schema.examinations.assignmentId, assignmentId), eq(schema.examinations.organizationId, ctx.orgId)));
  return { lessons, exams };
}

/* ======================== Platform (Super Admin) metrics ======================== */
export async function platformMetrics() {
  const db = await getDb();
  const one = async <T,>(q: Promise<T[]>) => (await q)[0];
  const [orgs, learners, teachers, pub, review, sessions, lessons, exams, subs, pendingPay, jobsFailed] = await Promise.all([
    one(db.select({ total: sql<number>`count(*)::int`, active: sql<number>`count(*) filter (where status = 'active')::int`, unverified: sql<number>`count(*) filter (where status = 'unverified')::int`, pending: sql<number>`count(*) filter (where status = 'pending')::int` }).from(schema.organizations)),
    one(db.select({ n: sql<number>`count(distinct user_id)::int` }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.role, "learner"), eq(schema.organizationMemberships.status, "active")))),
    one(db.select({ n: sql<number>`count(distinct user_id)::int` }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.role, "teacher"), eq(schema.organizationMemberships.status, "active")))),
    one(db.select({ n: sql<number>`count(*)::int` }).from(schema.curricula).where(eq(schema.curricula.status, "published"))),
    one(db.select({ n: sql<number>`count(*)::int` }).from(schema.curriculumVersions).where(eq(schema.curriculumVersions.status, "in_review"))),
    one(db.select({ n: sql<number>`count(*)::int` }).from(schema.academicSessions).where(eq(schema.academicSessions.status, "active"))),
    one(db.select({ n: sql<number>`count(*)::int` }).from(schema.scheduledLessons)),
    one(db.select({ n: sql<number>`count(*)::int`, avg: sql<number | null>`avg(percentage)::float` }).from(schema.assessmentResults)),
    one(db.select({ n: sql<number>`count(*)::int` }).from(schema.organizationSubscriptions).innerJoin(schema.subscriptionPlans, eq(schema.subscriptionPlans.id, schema.organizationSubscriptions.planId)).where(and(eq(schema.organizationSubscriptions.status, "active"), sql`${schema.subscriptionPlans.code} <> 'free'`))),
    one(db.select({ n: sql<number>`count(*)::int` }).from(schema.paymentTransactions).where(eq(schema.paymentTransactions.status, "pending"))),
    one(db.select({ n: sql<number>`count(*)::int` }).from(schema.backgroundJobs).where(eq(schema.backgroundJobs.status, "failed"))),
  ]);
  const recent = await db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(10);
  const forum = await one(db.select({ threads: sql<number>`count(*)::int` }).from(schema.forumThreads));
  const held = await one(db.select({ n: sql<number>`count(*)::int` }).from(schema.emailOutbox).where(inArray(schema.emailOutbox.status, ["held", "queued"])));
  return { churches: orgs, learners: learners.n, teachers: teachers.n, publishedCurricula: pub.n, awaitingReview: review.n, activeSessions: sessions.n, scheduledLessons: lessons.n, examsCompleted: exams.n, averageScore: exams.avg === null ? null : Math.round(exams.avg), activeSubscriptions: subs.n, pendingPayments: pendingPay.n, failedJobs: jobsFailed.n, recent, forumThreads: forum.threads, emailsWaiting: held.n };
}
