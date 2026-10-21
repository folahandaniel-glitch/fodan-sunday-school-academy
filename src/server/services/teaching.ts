import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { AccessError, NotFoundError, assertCan, assertClassAccess, can, teacherClassIds, type OrgCtx } from "../org";
import { audit } from "../audit";
import { orgSettings } from "./church";
import { initialsName } from "@/lib/text";
import { addDays, isIsoDate } from "@/lib/schedule";
import { notify } from "./notify";
import type { LessonContent } from "@/lib/lesson-types";

export type LessonStatus = "scheduled" | "available" | "in_progress" | "completed" | "locked";

export const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** scheduled | available | in_progress | completed | locked, derived from the date, overrides and progress. */
export function effectiveStatus(sl: { scheduledDate: string | null; status: string; releaseOverride: string | null }, today: string, openDaysBefore: number, started = false): LessonStatus {
  if (sl.status === "completed") return "completed";
  if (sl.releaseOverride === "locked") return "locked";
  if (sl.releaseOverride === "open") return started ? "in_progress" : "available";
  if (!sl.scheduledDate) return "locked";
  if (today >= addDays(sl.scheduledDate, -openDaysBefore)) return started ? "in_progress" : "available";
  return "scheduled";
}

export async function learnerClassIds(ctx: OrgCtx): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ id: schema.classMemberships.classId }).from(schema.classMemberships).innerJoin(schema.classes, eq(schema.classes.id, schema.classMemberships.classId))
    .where(and(eq(schema.classMemberships.organizationId, ctx.orgId), eq(schema.classMemberships.userId, ctx.userId), eq(schema.classMemberships.status, "active"), eq(schema.classes.status, "active")));
  return rows.map((r) => r.id);
}

/** Assignment ids visible to this person: learners via their classes, teachers via assigned classes, administrators all in the church. */
export async function visibleAssignmentIds(ctx: OrgCtx): Promise<string[]> {
  const db = await getDb();
  if (ctx.role === "learner") {
    const cls = await learnerClassIds(ctx);
    if (!cls.length) return [];
    const r = await db.select({ id: schema.classCurriculumAssignments.assignmentId }).from(schema.classCurriculumAssignments).where(and(eq(schema.classCurriculumAssignments.organizationId, ctx.orgId), inArray(schema.classCurriculumAssignments.classId, cls), eq(schema.classCurriculumAssignments.status, "active")));
    return [...new Set(r.map((x) => x.id))];
  }
  const allowed = await teacherClassIds(ctx);
  if (allowed === "all") { const r = await db.select({ id: schema.curriculumAssignments.id }).from(schema.curriculumAssignments).where(eq(schema.curriculumAssignments.organizationId, ctx.orgId)); return r.map((x) => x.id); }
  if (!allowed.length) return [];
  const r = await db.select({ id: schema.classCurriculumAssignments.assignmentId }).from(schema.classCurriculumAssignments).where(and(eq(schema.classCurriculumAssignments.organizationId, ctx.orgId), inArray(schema.classCurriculumAssignments.classId, allowed)));
  return [...new Set(r.map((x) => x.id))];
}

export async function myProgrammes(ctx: OrgCtx) {
  const ids = await visibleAssignmentIds(ctx);
  if (!ids.length) return [];
  const db = await getDb();
  return db.select({ id: schema.curriculumAssignments.id, status: schema.curriculumAssignments.status, title: schema.curricula.title, slug: schema.curricula.slug, session: schema.academicSessions.name, start: schema.academicSessions.startDate, end: schema.academicSessions.endDate })
    .from(schema.curriculumAssignments).innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumAssignments.curriculumId)).innerJoin(schema.academicSessions, eq(schema.academicSessions.id, schema.curriculumAssignments.sessionId))
    .where(and(eq(schema.curriculumAssignments.organizationId, ctx.orgId), inArray(schema.curriculumAssignments.id, ids), eq(schema.curriculumAssignments.status, "active"))).orderBy(desc(schema.academicSessions.startDate));
}

export async function lessonList(ctx: OrgCtx, assignmentId: string) {
  const ids = await visibleAssignmentIds(ctx);
  if (!ids.includes(assignmentId)) throw new NotFoundError("Programme not found.");
  const db = await getDb();
  const rows = await db.select({ sl: schema.scheduledLessons, title: schema.curriculumLessons.title, theme: schema.curriculumLessons.theme, scripture: schema.curriculumLessons.primaryScripture })
    .from(schema.scheduledLessons).innerJoin(schema.curriculumLessons, eq(schema.curriculumLessons.id, schema.scheduledLessons.lessonId))
    .where(and(eq(schema.scheduledLessons.assignmentId, assignmentId), eq(schema.scheduledLessons.organizationId, ctx.orgId))).orderBy(asc(schema.scheduledLessons.weekNumber));
  const prog = ctx.role === "learner" ? await db.select().from(schema.lessonProgress).where(and(eq(schema.lessonProgress.organizationId, ctx.orgId), eq(schema.lessonProgress.learnerId, ctx.userId))) : [];
  const started = new Set(prog.map((p) => p.scheduledLessonId));
  const done = new Set(prog.filter((p) => p.status === "completed").map((p) => p.scheduledLessonId));
  const s = orgSettings(ctx), today = todayIn(ctx.timezone);
  const isLearner = ctx.role === "learner";
  return rows.map((r) => {
    const st = effectiveStatus(r.sl, today, s.lessonOpenDaysBefore, started.has(r.sl.id));
    const hidden = isLearner && (st === "scheduled" || st === "locked");
    return { id: r.sl.id, week: r.sl.weekNumber, date: r.sl.scheduledDate, type: r.sl.lessonType, status: st, myCompleted: done.has(r.sl.id), title: hidden ? "Not yet available" : r.title, theme: hidden ? "" : r.theme, scripture: hidden ? [] : r.scripture, combinedWithWeek: r.sl.combinedWithWeek };
  });
}

export interface LessonView {
  id: string; assignmentId: string; week: number; date: string | null; type: string; status: LessonStatus; curriculum: { title: string; slug: string }; versionNumber: number;
  lesson: { title: string; summary: string; theme: string; scripture: string[]; more: string[]; memoryVerse: string; objectives: string[]; keyTerms: { term: string; meaning: string }[]; minutes: number; unitWeek: number };
  content: Omit<LessonContent, "teacherGuidance" | "discussion"> & { teacherGuidance?: string; discussion: { q: string; guidance?: string }[] };
  isTeacherView: boolean; myProgress: "in_progress" | "completed" | null; related: { id: string; week: number; title: string }[]; classIds: string[];
}

/**
 * The lesson reader. Learners get the lesson only when it is available and their class is on the programme; facilitator guidance and
 * teacher notes are stripped HERE on the server, so they never reach a learner's browser.
 */
export async function getLesson(ctx: OrgCtx, scheduledLessonId: string): Promise<LessonView> {
  const db = await getDb();
  const [row] = await db.select({ sl: schema.scheduledLessons, l: schema.curriculumLessons, cTitle: schema.curricula.title, cSlug: schema.curricula.slug, vNum: schema.curriculumVersions.versionNumber })
    .from(schema.scheduledLessons).innerJoin(schema.curriculumLessons, eq(schema.curriculumLessons.id, schema.scheduledLessons.lessonId))
    .innerJoin(schema.curriculumVersions, eq(schema.curriculumVersions.id, schema.curriculumLessons.versionId)).innerJoin(schema.curriculumAssignments, eq(schema.curriculumAssignments.id, schema.scheduledLessons.assignmentId)).innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumAssignments.curriculumId))
    .where(and(eq(schema.scheduledLessons.id, scheduledLessonId), eq(schema.scheduledLessons.organizationId, ctx.orgId)));
  if (!row) throw new NotFoundError("Lesson not found.");
  const visible = await visibleAssignmentIds(ctx);
  if (!visible.includes(row.sl.assignmentId)) throw new NotFoundError("Lesson not found.");
  const teacher = can(ctx, "lessons.teacher_view");
  const s = orgSettings(ctx);
  const [prog] = ctx.role === "learner" ? await db.select().from(schema.lessonProgress).where(and(eq(schema.lessonProgress.scheduledLessonId, row.sl.id), eq(schema.lessonProgress.learnerId, ctx.userId), eq(schema.lessonProgress.organizationId, ctx.orgId))) : [];
  const status = effectiveStatus(row.sl, todayIn(ctx.timezone), s.lessonOpenDaysBefore, !!prog);
  if (ctx.role === "learner" && (status === "scheduled" || status === "locked")) throw new AccessError("This lesson is not available yet.");
  const related = await db.select({ id: schema.scheduledLessons.id, week: schema.scheduledLessons.weekNumber, title: schema.curriculumLessons.title }).from(schema.scheduledLessons).innerJoin(schema.curriculumLessons, eq(schema.curriculumLessons.id, schema.scheduledLessons.lessonId))
    .where(and(eq(schema.scheduledLessons.assignmentId, row.sl.assignmentId), eq(schema.scheduledLessons.organizationId, ctx.orgId), inArray(schema.scheduledLessons.weekNumber, [row.sl.weekNumber - 1, row.sl.weekNumber + 1]))).orderBy(asc(schema.scheduledLessons.weekNumber));
  const cls = await db.select({ id: schema.classCurriculumAssignments.classId }).from(schema.classCurriculumAssignments).where(and(eq(schema.classCurriculumAssignments.assignmentId, row.sl.assignmentId), eq(schema.classCurriculumAssignments.organizationId, ctx.orgId)));
  const allowed = await teacherClassIds(ctx);
  const classIds = cls.map((c) => c.id).filter((id) => allowed === "all" || allowed.includes(id) || ctx.role === "learner");
  const { teacherGuidance, discussion, ...rest } = row.l.content;
  return {
    id: row.sl.id, assignmentId: row.sl.assignmentId, week: row.sl.weekNumber, date: row.sl.scheduledDate, type: row.sl.lessonType, status, curriculum: { title: row.cTitle, slug: row.cSlug }, versionNumber: row.vNum,
    lesson: { title: row.l.title, summary: row.l.summary, theme: row.l.theme, scripture: row.l.primaryScripture, more: row.l.additionalScripture, memoryVerse: row.l.memoryVerse, objectives: row.l.objectives, keyTerms: row.l.keyTerms, minutes: row.l.durationMinutes, unitWeek: row.l.weekNumber },
    content: { ...rest, assessmentNote: teacher ? rest.assessmentNote : rest.assessmentNote, ...(teacher ? { teacherGuidance } : {}), discussion: discussion.map((d) => (teacher ? { q: d.q, guidance: d.guidance } : { q: d.q })) },
    isTeacherView: teacher, myProgress: prog?.status ?? null, related, classIds,
  };
}

export async function setMyProgress(ctx: OrgCtx, scheduledLessonId: string, status: "in_progress" | "completed") {
  assertCan(ctx, "learn");
  await getLesson(ctx, scheduledLessonId); // enforces access + availability
  const db = await getDb();
  await db.insert(schema.lessonProgress).values({ organizationId: ctx.orgId, learnerId: ctx.userId, scheduledLessonId, status, completedAt: status === "completed" ? new Date() : null })
    .onConflictDoUpdate({ target: [schema.lessonProgress.learnerId, schema.lessonProgress.scheduledLessonId], set: { status, completedAt: status === "completed" ? new Date() : null } });
}

/* ===================== Delivery ===================== */
export async function markDelivered(ctx: OrgCtx, scheduledLessonId: string, classId: string, notes = "") {
  assertCan(ctx, "lessons.deliver");
  await assertClassAccess(ctx, classId);
  const db = await getDb();
  const [sl] = await db.select().from(schema.scheduledLessons).where(and(eq(schema.scheduledLessons.id, scheduledLessonId), eq(schema.scheduledLessons.organizationId, ctx.orgId)));
  if (!sl) throw new NotFoundError("Lesson not found.");
  const [link] = await db.select().from(schema.classCurriculumAssignments).where(and(eq(schema.classCurriculumAssignments.assignmentId, sl.assignmentId), eq(schema.classCurriculumAssignments.classId, classId), eq(schema.classCurriculumAssignments.organizationId, ctx.orgId)));
  if (!link) throw new AccessError("That class is not on this programme.");
  await db.transaction(async (tx) => {
    await tx.insert(schema.lessonDeliveries).values({ organizationId: ctx.orgId, scheduledLessonId, classId, teacherId: ctx.userId, deliveredAt: new Date(), notes, status: "delivered" })
      .onConflictDoUpdate({ target: [schema.lessonDeliveries.scheduledLessonId, schema.lessonDeliveries.classId], set: { deliveredAt: new Date(), notes, status: "delivered", teacherId: ctx.userId } });
    const classes = await tx.select({ id: schema.classCurriculumAssignments.classId }).from(schema.classCurriculumAssignments).where(and(eq(schema.classCurriculumAssignments.assignmentId, sl.assignmentId), eq(schema.classCurriculumAssignments.organizationId, ctx.orgId)));
    const done = await tx.select({ id: schema.lessonDeliveries.classId }).from(schema.lessonDeliveries).where(and(eq(schema.lessonDeliveries.scheduledLessonId, scheduledLessonId), eq(schema.lessonDeliveries.organizationId, ctx.orgId), eq(schema.lessonDeliveries.status, "delivered")));
    if (classes.every((c) => done.some((d) => d.id === c.id))) await tx.update(schema.scheduledLessons).set({ status: "completed", deliveredAt: new Date() }).where(eq(schema.scheduledLessons.id, scheduledLessonId));
    await audit({ id: ctx.userId, label: ctx.userName }, "lesson.delivered", { type: "scheduled_lesson", id: scheduledLessonId }, { classId }, { orgId: ctx.orgId, db: tx });
  });
}
export async function deliveriesFor(ctx: OrgCtx, scheduledLessonId: string) {
  const db = await getDb();
  return db.select().from(schema.lessonDeliveries).where(and(eq(schema.lessonDeliveries.scheduledLessonId, scheduledLessonId), eq(schema.lessonDeliveries.organizationId, ctx.orgId)));
}

/* ===================== Attendance ===================== */
export async function attendanceSheet(ctx: OrgCtx, scheduledLessonId: string, classId: string) {
  assertCan(ctx, "attendance.record");
  await assertClassAccess(ctx, classId);
  const db = await getDb();
  const learners = await db.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.classMemberships).innerJoin(schema.users, eq(schema.users.id, schema.classMemberships.userId))
    .where(and(eq(schema.classMemberships.classId, classId), eq(schema.classMemberships.organizationId, ctx.orgId), eq(schema.classMemberships.status, "active"))).orderBy(asc(schema.users.fullName));
  const [as] = await db.select().from(schema.attendanceSessions).where(and(eq(schema.attendanceSessions.scheduledLessonId, scheduledLessonId), eq(schema.attendanceSessions.classId, classId), eq(schema.attendanceSessions.organizationId, ctx.orgId)));
  const recs = as ? await db.select().from(schema.attendanceRecords).where(and(eq(schema.attendanceRecords.attendanceSessionId, as.id), eq(schema.attendanceRecords.organizationId, ctx.orgId))) : [];
  const m = new Map(recs.map((r) => [r.learnerId, r]));
  return learners.map((l) => ({ ...l, status: m.get(l.id)?.status ?? null, remarks: m.get(l.id)?.remarks ?? "" }));
}
export async function saveAttendance(ctx: OrgCtx, scheduledLessonId: string, classId: string, records: { learnerId: string; status: "present" | "absent" | "late" | "excused"; remarks?: string }[]) {
  assertCan(ctx, "attendance.record");
  await assertClassAccess(ctx, classId);
  const db = await getDb();
  const [sl] = await db.select().from(schema.scheduledLessons).where(and(eq(schema.scheduledLessons.id, scheduledLessonId), eq(schema.scheduledLessons.organizationId, ctx.orgId)));
  if (!sl) throw new NotFoundError("Lesson not found.");
  const [link] = await db.select({ id: schema.classCurriculumAssignments.id }).from(schema.classCurriculumAssignments).where(and(eq(schema.classCurriculumAssignments.assignmentId, sl.assignmentId), eq(schema.classCurriculumAssignments.classId, classId), eq(schema.classCurriculumAssignments.organizationId, ctx.orgId)));
  if (!link) throw new AccessError("That class is not on this programme.");
  const members = await db.select({ id: schema.classMemberships.userId }).from(schema.classMemberships).where(and(eq(schema.classMemberships.classId, classId), eq(schema.classMemberships.organizationId, ctx.orgId), eq(schema.classMemberships.status, "active")));
  const ok = new Set(members.map((m) => m.id));
  const clean = records.filter((r) => ok.has(r.learnerId)); // learners outside the class are ignored, never recorded
  await db.transaction(async (tx) => {
    const [as] = await tx.insert(schema.attendanceSessions).values({ organizationId: ctx.orgId, scheduledLessonId, classId, recordedBy: ctx.userId, sessionDate: sl.scheduledDate ?? todayIn(ctx.timezone) })
      .onConflictDoUpdate({ target: [schema.attendanceSessions.scheduledLessonId, schema.attendanceSessions.classId], set: { recordedBy: ctx.userId } }).returning({ id: schema.attendanceSessions.id });
    for (const r of clean) await tx.insert(schema.attendanceRecords).values({ organizationId: ctx.orgId, attendanceSessionId: as.id, learnerId: r.learnerId, status: r.status, remarks: r.remarks?.slice(0, 200) || null })
      .onConflictDoUpdate({ target: [schema.attendanceRecords.attendanceSessionId, schema.attendanceRecords.learnerId], set: { status: r.status, remarks: r.remarks?.slice(0, 200) || null } });
  });
  return { saved: clean.length };
}

export async function myAttendance(ctx: OrgCtx) {
  const db = await getDb();
  const rows = await db.select({ status: schema.attendanceRecords.status, n: sql<number>`count(*)::int` }).from(schema.attendanceRecords).where(and(eq(schema.attendanceRecords.organizationId, ctx.orgId), eq(schema.attendanceRecords.learnerId, ctx.userId))).groupBy(schema.attendanceRecords.status);
  const total = rows.reduce((n, r) => n + r.n, 0), present = rows.filter((r) => r.status === "present" || r.status === "late").reduce((n, r) => n + r.n, 0);
  return { total, present, percent: total ? Math.round((present / total) * 100) : null };
}

/* ===================== Discussions ===================== */
export async function startDiscussion(ctx: OrgCtx, scheduledLessonId: string, classId: string, prompt: string) {
  assertCan(ctx, "lessons.deliver");
  await assertClassAccess(ctx, classId);
  if (prompt.trim().length < 8) return { ok: false as const, error: "Write the discussion prompt." };
  const db = await getDb();
  const [sl] = await db.select().from(schema.scheduledLessons).where(and(eq(schema.scheduledLessons.id, scheduledLessonId), eq(schema.scheduledLessons.organizationId, ctx.orgId)));
  if (!sl) throw new NotFoundError("Lesson not found.");
  const [d] = await db.insert(schema.lessonDiscussions).values({ organizationId: ctx.orgId, scheduledLessonId, classId, facilitatorId: ctx.userId, prompt: prompt.trim().slice(0, 1000) }).returning({ id: schema.lessonDiscussions.id });
  return { ok: true as const, id: d.id };
}
export async function discussionsFor(ctx: OrgCtx, scheduledLessonId: string) {
  const db = await getDb();
  const isLearner = ctx.role === "learner";
  const cls = isLearner ? await learnerClassIds(ctx) : await teacherClassIds(ctx);
  if (Array.isArray(cls) && !cls.length) return [];
  const ds = await db.select().from(schema.lessonDiscussions).where(and(eq(schema.lessonDiscussions.scheduledLessonId, scheduledLessonId), eq(schema.lessonDiscussions.organizationId, ctx.orgId), cls === "all" ? undefined : inArray(schema.lessonDiscussions.classId, cls))).orderBy(desc(schema.lessonDiscussions.createdAt));
  const out = [];
  for (const d of ds) {
    const rs = await db.select({ r: schema.discussionResponses, name: schema.users.fullName }).from(schema.discussionResponses).innerJoin(schema.users, eq(schema.users.id, schema.discussionResponses.learnerId))
      .where(and(eq(schema.discussionResponses.discussionId, d.id), eq(schema.discussionResponses.organizationId, ctx.orgId), isLearner ? eq(schema.discussionResponses.moderationStatus, "visible") : undefined)).orderBy(asc(schema.discussionResponses.createdAt));
    out.push({ ...d, responses: rs.map((x) => ({ id: x.r.id, content: x.r.content, hidden: x.r.moderationStatus === "hidden", reflection: x.r.teacherReflection, author: x.r.learnerId === ctx.userId ? "You" : initialsName(x.name), mine: x.r.learnerId === ctx.userId, learnerId: isLearner ? undefined : x.r.learnerId })) });
  }
  return out;
}
export async function respondToDiscussion(ctx: OrgCtx, discussionId: string, content: string) {
  assertCan(ctx, "learn");
  const text = content.trim();
  if (text.length < 2) return { ok: false as const, error: "Write your response." };
  if (text.length > 2000) return { ok: false as const, error: "Please keep your response under 2000 characters." };
  const db = await getDb();
  const [d] = await db.select().from(schema.lessonDiscussions).where(and(eq(schema.lessonDiscussions.id, discussionId), eq(schema.lessonDiscussions.organizationId, ctx.orgId)));
  if (!d || d.status !== "open") throw new NotFoundError("Discussion not found or closed.");
  if (!(await learnerClassIds(ctx)).includes(d.classId)) throw new AccessError("This discussion belongs to another class.");
  await db.insert(schema.discussionResponses).values({ organizationId: ctx.orgId, discussionId, learnerId: ctx.userId, content: text });
  return { ok: true as const };
}
export async function moderateResponse(ctx: OrgCtx, responseId: string, action: "hide" | "show" | "reflect", reflection?: string) {
  assertCan(ctx, "lessons.deliver");
  const db = await getDb();
  const [r] = await db.select({ r: schema.discussionResponses, classId: schema.lessonDiscussions.classId }).from(schema.discussionResponses).innerJoin(schema.lessonDiscussions, eq(schema.lessonDiscussions.id, schema.discussionResponses.discussionId))
    .where(and(eq(schema.discussionResponses.id, responseId), eq(schema.discussionResponses.organizationId, ctx.orgId)));
  if (!r) throw new NotFoundError();
  await assertClassAccess(ctx, r.classId);
  await db.update(schema.discussionResponses).set(action === "reflect" ? { teacherReflection: reflection?.slice(0, 1000) || null } : { moderationStatus: action === "hide" ? "hidden" : "visible" }).where(eq(schema.discussionResponses.id, responseId));
}

/* ===================== Assignments ===================== */
export async function createAssignment(ctx: OrgCtx, input: { classId: string; scheduledLessonId?: string; title: string; instructions: string; dueAt?: string; totalMarks?: number; publish?: boolean }) {
  assertCan(ctx, "assignments.manage");
  await assertClassAccess(ctx, input.classId);
  if (input.title.trim().length < 3) return { ok: false as const, error: "Enter a title." };
  const db = await getDb();
  if (input.scheduledLessonId) {
    const [sl] = await db.select({ id: schema.scheduledLessons.id }).from(schema.scheduledLessons).where(and(eq(schema.scheduledLessons.id, input.scheduledLessonId), eq(schema.scheduledLessons.organizationId, ctx.orgId)));
    if (!sl) throw new NotFoundError("Lesson not found.");
  }
  const due = input.dueAt ? new Date(input.dueAt) : null;
  if (due && Number.isNaN(due.getTime())) return { ok: false as const, error: "Enter a valid due date." };
  const [a] = await db.insert(schema.assignments).values({ organizationId: ctx.orgId, classId: input.classId, scheduledLessonId: input.scheduledLessonId ?? null, title: input.title.trim(), instructions: input.instructions.trim(), dueAt: due, totalMarks: Math.max(1, Math.min(100, input.totalMarks ?? 10)), status: input.publish ? "published" : "draft", createdBy: ctx.userId }).returning({ id: schema.assignments.id });
  if (input.publish) await announceAssignment(ctx, a.id, input.classId, input.title.trim());
  return { ok: true as const, id: a.id };
}
async function announceAssignment(ctx: OrgCtx, id: string, classId: string, title: string) {
  const db = await getDb();
  const members = await db.select({ id: schema.classMemberships.userId }).from(schema.classMemberships).where(and(eq(schema.classMemberships.classId, classId), eq(schema.classMemberships.organizationId, ctx.orgId), eq(schema.classMemberships.status, "active")));
  for (const m of members) await notify(m.id, { type: "assignment", title: `New assignment: ${title}`, href: `/learn/assignments/${id}`, orgId: ctx.orgId, dedupeKey: `asg:${id}` });
}
export async function publishAssignment(ctx: OrgCtx, assignmentId: string) {
  assertCan(ctx, "assignments.manage");
  const db = await getDb();
  const [a] = await db.select().from(schema.assignments).where(and(eq(schema.assignments.id, assignmentId), eq(schema.assignments.organizationId, ctx.orgId)));
  if (!a) throw new NotFoundError();
  await assertClassAccess(ctx, a.classId);
  await db.update(schema.assignments).set({ status: "published" }).where(eq(schema.assignments.id, a.id));
  await announceAssignment(ctx, a.id, a.classId, a.title);
}
export async function listAssignments(ctx: OrgCtx) {
  const db = await getDb();
  if (ctx.role === "learner") {
    const cls = await learnerClassIds(ctx);
    if (!cls.length) return [];
    return db.select({ a: schema.assignments, className: schema.classes.name, sub: schema.assignmentSubmissions }).from(schema.assignments).innerJoin(schema.classes, eq(schema.classes.id, schema.assignments.classId))
      .leftJoin(schema.assignmentSubmissions, and(eq(schema.assignmentSubmissions.assignmentId, schema.assignments.id), eq(schema.assignmentSubmissions.learnerId, ctx.userId)))
      .where(and(eq(schema.assignments.organizationId, ctx.orgId), inArray(schema.assignments.classId, cls), eq(schema.assignments.status, "published"))).orderBy(desc(schema.assignments.createdAt));
  }
  assertCan(ctx, "assignments.manage");
  const allowed = await teacherClassIds(ctx);
  if (allowed !== "all" && !allowed.length) return [];
  return db.select({ a: schema.assignments, className: schema.classes.name, sub: sql<null>`null` }).from(schema.assignments).innerJoin(schema.classes, eq(schema.classes.id, schema.assignments.classId))
    .where(and(eq(schema.assignments.organizationId, ctx.orgId), allowed === "all" ? undefined : inArray(schema.assignments.classId, allowed))).orderBy(desc(schema.assignments.createdAt));
}
export async function getAssignmentForLearner(ctx: OrgCtx, id: string) {
  assertCan(ctx, "learn");
  const db = await getDb();
  const cls = await learnerClassIds(ctx);
  const [a] = await db.select().from(schema.assignments).where(and(eq(schema.assignments.id, id), eq(schema.assignments.organizationId, ctx.orgId), eq(schema.assignments.status, "published"), cls.length ? inArray(schema.assignments.classId, cls) : sql`false`));
  if (!a) throw new NotFoundError("Assignment not found.");
  const [sub] = await db.select().from(schema.assignmentSubmissions).where(and(eq(schema.assignmentSubmissions.assignmentId, id), eq(schema.assignmentSubmissions.learnerId, ctx.userId), eq(schema.assignmentSubmissions.organizationId, ctx.orgId)));
  return { assignment: a, submission: sub ?? null };
}
export async function submitAssignment(ctx: OrgCtx, assignmentId: string, content: string) {
  const { assignment, submission } = await getAssignmentForLearner(ctx, assignmentId);
  const text = content.trim();
  if (text.length < 5) return { ok: false as const, error: "Write your answer before submitting." };
  if (text.length > 10000) return { ok: false as const, error: "Your answer is too long (limit 10,000 characters)." };
  if (assignment.status === "closed") return { ok: false as const, error: "This assignment is closed." };
  if (submission?.gradingStatus === "graded") return { ok: false as const, error: "This work has already been marked." };
  const db = await getDb();
  await db.insert(schema.assignmentSubmissions).values({ organizationId: ctx.orgId, assignmentId, learnerId: ctx.userId, content: text })
    .onConflictDoUpdate({ target: [schema.assignmentSubmissions.assignmentId, schema.assignmentSubmissions.learnerId], set: { content: text, submittedAt: new Date() } });
  return { ok: true as const };
}
export async function submissionsFor(ctx: OrgCtx, assignmentId: string) {
  assertCan(ctx, "grading.mark");
  const db = await getDb();
  const [a] = await db.select().from(schema.assignments).where(and(eq(schema.assignments.id, assignmentId), eq(schema.assignments.organizationId, ctx.orgId)));
  if (!a) throw new NotFoundError();
  await assertClassAccess(ctx, a.classId);
  const subs = await db.select({ s: schema.assignmentSubmissions, name: schema.users.fullName }).from(schema.assignmentSubmissions).innerJoin(schema.users, eq(schema.users.id, schema.assignmentSubmissions.learnerId))
    .where(and(eq(schema.assignmentSubmissions.assignmentId, assignmentId), eq(schema.assignmentSubmissions.organizationId, ctx.orgId))).orderBy(asc(schema.users.fullName));
  return { assignment: a, submissions: subs };
}
export async function gradeSubmission(ctx: OrgCtx, submissionId: string, marks: number, feedback: string) {
  assertCan(ctx, "grading.mark");
  const db = await getDb();
  const [s] = await db.select({ s: schema.assignmentSubmissions, a: schema.assignments }).from(schema.assignmentSubmissions).innerJoin(schema.assignments, eq(schema.assignments.id, schema.assignmentSubmissions.assignmentId))
    .where(and(eq(schema.assignmentSubmissions.id, submissionId), eq(schema.assignmentSubmissions.organizationId, ctx.orgId)));
  if (!s) throw new NotFoundError();
  await assertClassAccess(ctx, s.a.classId);
  if (!Number.isFinite(marks) || marks < 0 || marks > s.a.totalMarks) return { ok: false as const, error: `Marks must be between 0 and ${s.a.totalMarks}.` };
  await db.update(schema.assignmentSubmissions).set({ awardedMarks: Math.round(marks), feedback: feedback.trim().slice(0, 2000) || null, gradingStatus: "graded" }).where(eq(schema.assignmentSubmissions.id, submissionId));
  await notify(s.s.learnerId, { type: "assignment", title: `Marked: ${s.a.title}`, href: `/learn/assignments/${s.a.id}`, orgId: ctx.orgId, dedupeKey: `graded:${submissionId}` });
  return { ok: true as const };
}

/* ===================== Learner summary ===================== */
export async function learnerSummary(ctx: OrgCtx) {
  const db = await getDb();
  const progs = await myProgrammes(ctx);
  const out = [];
  for (const p of progs) {
    const list = await lessonList(ctx, p.id);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.lessonProgress).innerJoin(schema.scheduledLessons, eq(schema.scheduledLessons.id, schema.lessonProgress.scheduledLessonId))
      .where(and(eq(schema.lessonProgress.learnerId, ctx.userId), eq(schema.lessonProgress.organizationId, ctx.orgId), eq(schema.lessonProgress.status, "completed"), eq(schema.scheduledLessons.assignmentId, p.id)));
    const next = list.find((l) => (l.status === "available" || l.status === "in_progress") && !l.myCompleted) ?? list.find((l) => l.status === "scheduled");
    out.push({ programme: p, lessons: list, completed: n, next });
  }
  return out;
}
export { isIsoDate };
