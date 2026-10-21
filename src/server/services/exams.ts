import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema, type DB, type Tx } from "../db";
import { AccessError, NotFoundError, assertCan, assertClassAccess, teacherClassIds, can, type OrgCtx } from "../org";
import { audit } from "../audit";
import { getSetting } from "../settings";
import { randomToken, seededRng, shuffled } from "../crypto";
import { assertWithinLimit } from "./entitlements";
import { notify } from "./notify";
import { gradeAnswer, gradeFor, percent, round2, type GradeScaleEntry } from "@/lib/grading";
import { selectQuestions, validateExamConfig, type PoolQuestion } from "@/lib/exam-select";
import type { AnswerConfig, QuestionType } from "@/lib/lesson-types";
import { orgSettings } from "./church";
import { learnerClassIds } from "./teaching";
import { initialsName } from "@/lib/text";

const NETWORK_GRACE_MS = 5000;
type Exam = typeof schema.examinations.$inferSelect;

async function scale(ctx: Pick<OrgCtx, "orgSettings">): Promise<GradeScaleEntry[]> {
  const local = (ctx.orgSettings as { gradeScale?: GradeScaleEntry[] }).gradeScale;
  if (local?.length) return local;
  return (await getSetting("assessment")).gradeScale;
}

/* ============================ AUTHORING ============================ */
async function loadExam(ctx: OrgCtx, examId: string): Promise<Exam> {
  const db = await getDb();
  const [e] = await db.select().from(schema.examinations).where(and(eq(schema.examinations.id, examId), eq(schema.examinations.organizationId, ctx.orgId)));
  if (!e) throw new NotFoundError("Examination not found.");
  return e;
}
async function assertAssignment(ctx: OrgCtx, assignmentId: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.curriculumAssignments).where(and(eq(schema.curriculumAssignments.id, assignmentId), eq(schema.curriculumAssignments.organizationId, ctx.orgId)));
  if (!a) throw new NotFoundError("Programme not found.");
  return a;
}

/** Question pool of an assignment: every approved question attached to the lessons the church is actually teaching (survives version adoption). */
export async function poolFor(ctx: OrgCtx, assignmentId: string): Promise<PoolQuestion[]> {
  const db = await getDb();
  await assertAssignment(ctx, assignmentId);
  const lessons = await db.select({ lessonId: schema.scheduledLessons.lessonId, week: schema.curriculumLessons.weekNumber }).from(schema.scheduledLessons)
    .innerJoin(schema.curriculumLessons, eq(schema.curriculumLessons.id, schema.scheduledLessons.lessonId)).where(and(eq(schema.scheduledLessons.assignmentId, assignmentId), eq(schema.scheduledLessons.organizationId, ctx.orgId)));
  if (!lessons.length) return [];
  const qs = await db.select({ id: schema.questions.id, week: schema.questions.weekNumber, type: schema.questions.type, difficulty: schema.questions.difficulty, marks: schema.questions.marks, st: schema.questions.status, rv: schema.questions.reviewStatus })
    .from(schema.questions).where(inArray(schema.questions.lessonId, lessons.map((l) => l.lessonId)));
  return qs.filter((q) => q.rv === "reviewed" || q.st === "reviewed" || q.st === "published").map((q) => ({ id: q.id, week: q.week, type: q.type, difficulty: q.difficulty, marks: q.marks }));
}

export interface ExamSettings {
  title: string; instructions: string; durationMinutes: number; passPercent: number; attemptLimit: number; opensAt: string | null; closesAt: string | null;
  shuffleQuestions: boolean; shuffleOptions: boolean; resultPolicy: Exam["resultPolicy"]; reviewPolicy: Exam["reviewPolicy"]; latePolicy: Exam["latePolicy"]; classIds: string[];
}

/** Draft examination assembled from the curriculum's blueprint (mid-session test: weeks 1-12; final: both halves). Reviewed and published by staff. */
export async function generateExam(ctx: OrgCtx, assignmentId: string, kind: "midtest" | "final" | "practice", overrides: Partial<ExamSettings> = {}) {
  assertCan(ctx, "exams.manage");
  const a = await assertAssignment(ctx, assignmentId);
  const db = await getDb();
  const cap = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.examinations).where(and(eq(schema.examinations.assignmentId, assignmentId), eq(schema.examinations.organizationId, ctx.orgId), sql`${schema.examinations.status} <> 'archived'`)))[0].n;
  await assertWithinLimit(ctx.orgId, "examsPerSession", cap);
  const bpKind = kind === "practice" ? "midtest" : kind;
  const [bpRow] = await db.select().from(schema.assessmentBlueprints).where(and(eq(schema.assessmentBlueprints.versionId, a.versionId), eq(schema.assessmentBlueprints.kind, bpKind)));
  if (!bpRow) return { ok: false as const, error: "This curriculum has no assessment blueprint." };
  const bp = kind === "practice" ? { ...bpRow.config, coversWeeks: [[1, 24]] as [number, number][], types: [{ type: "mcq" as const, count: 15, marksEach: 1 }, { type: "tf" as const, count: 5, marksEach: 1 }], durationMinutes: 30 } : bpRow.config;
  const pool = await poolFor(ctx, assignmentId);
  const sel = selectQuestions(pool, bp, seededRng(randomToken(8)));
  if (!sel.chosen.length) return { ok: false as const, error: "No approved questions are available to build this examination." };
  const sched = await db.select({ sl: schema.scheduledLessons }).from(schema.scheduledLessons).where(and(eq(schema.scheduledLessons.assignmentId, assignmentId), eq(schema.scheduledLessons.organizationId, ctx.orgId), eq(schema.scheduledLessons.lessonType, kind === "practice" ? "revision" : kind)));
  const s = orgSettings(ctx);
  const title = overrides.title ?? (kind === "midtest" ? "Mid-session test" : kind === "final" ? "Final examination" : "Revision practice quiz");
  const [e] = await db.insert(schema.examinations).values({
    organizationId: ctx.orgId, assignmentId, scheduledLessonId: sched[0]?.sl.id ?? null, title, kind,
    instructions: overrides.instructions ?? "Read each question carefully. Your answers are saved automatically. You may mark questions to review and return to them. Submit when you are finished; the timer is controlled by the server.",
    durationSeconds: (overrides.durationMinutes ?? bp.durationMinutes) * 60, totalMarks: sel.totalMarks, passPercent: overrides.passPercent ?? bp.passPercent, attemptLimit: overrides.attemptLimit ?? (kind === "practice" ? 5 : 1),
    opensAt: overrides.opensAt ? new Date(overrides.opensAt) : null, closesAt: overrides.closesAt ? new Date(overrides.closesAt) : null,
    shuffleQuestions: overrides.shuffleQuestions ?? true, shuffleOptions: overrides.shuffleOptions ?? true,
    resultPolicy: overrides.resultPolicy ?? (kind === "practice" ? "immediate" : s.resultVisibility === "immediate" ? "immediate" : "after_review"), reviewPolicy: overrides.reviewPolicy ?? "after_publish", latePolicy: overrides.latePolicy ?? "reject",
    classIds: overrides.classIds ?? [], status: "draft", createdBy: ctx.userId,
  }).returning({ id: schema.examinations.id });
  await db.insert(schema.examinationQuestions).values(sel.chosen.map((c, i) => ({ organizationId: ctx.orgId, examId: e.id, questionId: c.id, marks: c.marks, sortOrder: i })));
  await audit({ id: ctx.userId, label: ctx.userName }, "exam.generated", { type: "exam", id: e.id }, { kind, questions: sel.chosen.length }, { orgId: ctx.orgId });
  return { ok: true as const, id: e.id, selection: sel };
}

export async function updateExam(ctx: OrgCtx, examId: string, patch: Partial<ExamSettings>) {
  assertCan(ctx, "exams.manage");
  const e = await loadExam(ctx, examId);
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.examinationAttempts).where(and(eq(schema.examinationAttempts.examId, examId), eq(schema.examinationAttempts.organizationId, ctx.orgId)));
  if (n > 0 && (patch.durationMinutes !== undefined || patch.attemptLimit !== undefined || patch.passPercent !== undefined)) return { ok: false as const, error: "Learners have already started this examination, so its duration, attempts and pass mark can no longer be changed." };
  if (patch.classIds?.length) {
    const own = await db.select({ id: schema.classes.id }).from(schema.classes).where(and(eq(schema.classes.organizationId, ctx.orgId), inArray(schema.classes.id, patch.classIds)));
    if (own.length !== new Set(patch.classIds).size) throw new NotFoundError("One of the selected classes was not found.");
  }
  const set: Partial<typeof schema.examinations.$inferInsert> = {};
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.instructions !== undefined) set.instructions = patch.instructions;
  if (patch.durationMinutes !== undefined) set.durationSeconds = Math.round(patch.durationMinutes * 60);
  if (patch.passPercent !== undefined) set.passPercent = patch.passPercent;
  if (patch.attemptLimit !== undefined) set.attemptLimit = patch.attemptLimit;
  if (patch.opensAt !== undefined) set.opensAt = patch.opensAt ? new Date(patch.opensAt) : null;
  if (patch.closesAt !== undefined) set.closesAt = patch.closesAt ? new Date(patch.closesAt) : null;
  for (const k of ["shuffleQuestions", "shuffleOptions", "resultPolicy", "reviewPolicy", "latePolicy", "classIds"] as const) if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  await db.update(schema.examinations).set(set).where(eq(schema.examinations.id, e.id));
  await audit({ id: ctx.userId, label: ctx.userName }, "exam.updated", { type: "exam", id: e.id }, { fields: Object.keys(set) }, { orgId: ctx.orgId });
  return { ok: true as const };
}

export async function examQuestionsForStaff(ctx: OrgCtx, examId: string) {
  assertCan(ctx, "exams.manage");
  await loadExam(ctx, examId);
  const db = await getDb();
  return db.select({ eqId: schema.examinationQuestions.id, marks: schema.examinationQuestions.marks, order: schema.examinationQuestions.sortOrder, q: schema.questions, key: schema.questionAnswerKeys })
    .from(schema.examinationQuestions).innerJoin(schema.questions, eq(schema.questions.id, schema.examinationQuestions.questionId)).leftJoin(schema.questionAnswerKeys, eq(schema.questionAnswerKeys.questionId, schema.questions.id))
    .where(and(eq(schema.examinationQuestions.examId, examId), eq(schema.examinationQuestions.organizationId, ctx.orgId))).orderBy(asc(schema.examinationQuestions.sortOrder));
}
export async function removeExamQuestion(ctx: OrgCtx, examId: string, eqId: string) {
  assertCan(ctx, "exams.manage");
  const e = await loadExam(ctx, examId);
  const db = await getDb();
  if (e.status !== "draft") return { ok: false as const, error: "Questions can only be changed while the examination is a draft." };
  await db.delete(schema.examinationQuestions).where(and(eq(schema.examinationQuestions.id, eqId), eq(schema.examinationQuestions.examId, examId), eq(schema.examinationQuestions.organizationId, ctx.orgId)));
  await recomputeTotal(examId, ctx.orgId);
  return { ok: true as const };
}
export async function addExamQuestion(ctx: OrgCtx, examId: string, questionId: string, marks?: number) {
  assertCan(ctx, "exams.manage");
  const e = await loadExam(ctx, examId);
  if (e.status !== "draft") return { ok: false as const, error: "Questions can only be changed while the examination is a draft." };
  const pool = await poolFor(ctx, e.assignmentId);
  const q = pool.find((p) => p.id === questionId);
  if (!q) throw new NotFoundError("That question is not in this programme's approved question bank.");
  const db = await getDb();
  const [mx] = await db.select({ m: sql<number>`coalesce(max(${schema.examinationQuestions.sortOrder}), -1)::int` }).from(schema.examinationQuestions).where(eq(schema.examinationQuestions.examId, examId));
  await db.insert(schema.examinationQuestions).values({ organizationId: ctx.orgId, examId, questionId, marks: marks ?? q.marks, sortOrder: mx.m + 1 }).onConflictDoNothing();
  await recomputeTotal(examId, ctx.orgId);
  return { ok: true as const };
}
async function recomputeTotal(examId: string, orgId: string) {
  const db = await getDb();
  const [r] = await db.select({ t: sql<number>`coalesce(sum(${schema.examinationQuestions.marks}), 0)::float` }).from(schema.examinationQuestions).where(and(eq(schema.examinationQuestions.examId, examId), eq(schema.examinationQuestions.organizationId, orgId)));
  await db.update(schema.examinations).set({ totalMarks: r.t }).where(eq(schema.examinations.id, examId));
}

export async function examProblems(ctx: OrgCtx, examId: string) {
  const e = await loadExam(ctx, examId);
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int`, m: sql<number>`coalesce(sum(${schema.examinationQuestions.marks}),0)::float` }).from(schema.examinationQuestions).where(and(eq(schema.examinationQuestions.examId, examId), eq(schema.examinationQuestions.organizationId, ctx.orgId)));
  return validateExamConfig({ title: e.title, durationSeconds: e.durationSeconds, passPercent: e.passPercent, attemptLimit: e.attemptLimit, opensAt: e.opensAt, closesAt: e.closesAt, totalMarks: e.totalMarks }, r.n, r.m);
}
export async function publishExam(ctx: OrgCtx, examId: string) {
  assertCan(ctx, "exams.manage");
  const e = await loadExam(ctx, examId);
  if (e.status !== "draft") return { ok: false as const, error: "Only a draft examination can be published." };
  const problems = await examProblems(ctx, examId);
  if (problems.length) return { ok: false as const, error: problems[0], problems };
  const db = await getDb();
  await db.update(schema.examinations).set({ status: "published" }).where(eq(schema.examinations.id, e.id));
  await audit({ id: ctx.userId, label: ctx.userName }, "exam.published", { type: "exam", id: e.id }, {}, { orgId: ctx.orgId });
  await announceExam(ctx, e);
  return { ok: true as const };
}
async function announceExam(ctx: OrgCtx, e: Exam) {
  const db = await getDb();
  const links = await db.select({ classId: schema.classCurriculumAssignments.classId }).from(schema.classCurriculumAssignments).where(and(eq(schema.classCurriculumAssignments.assignmentId, e.assignmentId), eq(schema.classCurriculumAssignments.organizationId, ctx.orgId)));
  const cls = e.classIds.length ? links.map((l) => l.classId).filter((c) => e.classIds.includes(c)) : links.map((l) => l.classId);
  if (!cls.length) return;
  const people = await db.selectDistinct({ id: schema.classMemberships.userId }).from(schema.classMemberships).where(and(eq(schema.classMemberships.organizationId, ctx.orgId), inArray(schema.classMemberships.classId, cls), eq(schema.classMemberships.status, "active")));
  for (const p of people) await notify(p.id, { type: "exam", title: `${e.title} is available`, body: e.opensAt ? `Opens ${e.opensAt.toISOString()}` : "Open now", href: `/learn/exams/${e.id}`, orgId: ctx.orgId, dedupeKey: `exam:${e.id}` });
}
export async function closeExam(ctx: OrgCtx, examId: string) {
  assertCan(ctx, "exams.manage");
  const e = await loadExam(ctx, examId);
  const db = await getDb();
  await db.update(schema.examinations).set({ status: "closed" }).where(eq(schema.examinations.id, e.id));
}
export async function listExams(ctx: OrgCtx) {
  const db = await getDb();
  assertCan(ctx, "classes.view");
  return db.select({ e: schema.examinations, programme: schema.curricula.title,
    attempts: sql<number>`(select count(*)::int from examination_attempts a where a.exam_id = ${schema.examinations.id})`,
    pending: sql<number>`(select count(*)::int from examination_attempts a where a.exam_id = ${schema.examinations.id} and a.grading_status = 'pending_review')` })
    .from(schema.examinations).innerJoin(schema.curriculumAssignments, eq(schema.curriculumAssignments.id, schema.examinations.assignmentId)).innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumAssignments.curriculumId))
    .where(eq(schema.examinations.organizationId, ctx.orgId)).orderBy(desc(schema.examinations.createdAt));
}

/* ============================ LEARNER: ELIGIBILITY AND ATTEMPTS ============================ */
export type WindowState = "draft" | "upcoming" | "open" | "closed";
export const windowState = (e: Pick<Exam, "status" | "opensAt" | "closesAt">, now = new Date()): WindowState => {
  if (e.status === "draft") return "draft";
  if (e.status === "closed" || e.status === "archived") return "closed";
  if (e.opensAt && now < e.opensAt) return "upcoming";
  if (e.closesAt && now > e.closesAt) return "closed";
  return "open";
};

async function eligibleExam(ctx: OrgCtx, examId: string): Promise<Exam> {
  assertCan(ctx, "learn");
  const e = await loadExam(ctx, examId);
  if (e.status === "draft" || e.status === "archived") throw new NotFoundError("Examination not found.");
  const mine = await learnerClassIds(ctx);
  const links = await db_links(ctx, e.assignmentId);
  const eligibleClasses = e.classIds.length ? links.filter((c) => e.classIds.includes(c)) : links;
  if (!mine.some((c) => eligibleClasses.includes(c))) throw new NotFoundError("Examination not found.");
  return e;
}
async function db_links(ctx: OrgCtx, assignmentId: string) {
  const db = await getDb();
  return (await db.select({ id: schema.classCurriculumAssignments.classId }).from(schema.classCurriculumAssignments).where(and(eq(schema.classCurriculumAssignments.assignmentId, assignmentId), eq(schema.classCurriculumAssignments.organizationId, ctx.orgId)))).map((r) => r.id);
}

export async function myExams(ctx: OrgCtx) {
  assertCan(ctx, "learn");
  const db = await getDb();
  const mine = await learnerClassIds(ctx);
  if (!mine.length) return [];
  const links = await db.select().from(schema.classCurriculumAssignments).where(and(eq(schema.classCurriculumAssignments.organizationId, ctx.orgId), inArray(schema.classCurriculumAssignments.classId, mine)));
  const aids = [...new Set(links.map((l) => l.assignmentId))];
  if (!aids.length) return [];
  const exams = await db.select().from(schema.examinations).where(and(eq(schema.examinations.organizationId, ctx.orgId), inArray(schema.examinations.assignmentId, aids), inArray(schema.examinations.status, ["published", "closed"]))).orderBy(desc(schema.examinations.createdAt));
  const attempts = await db.select().from(schema.examinationAttempts).where(and(eq(schema.examinationAttempts.organizationId, ctx.orgId), eq(schema.examinationAttempts.learnerId, ctx.userId)));
  const results = await db.select().from(schema.assessmentResults).where(and(eq(schema.assessmentResults.organizationId, ctx.orgId), eq(schema.assessmentResults.learnerId, ctx.userId), eq(schema.assessmentResults.publicationStatus, "published")));
  const out = [];
  for (const e of exams) {
    const eligible = e.classIds.length ? links.some((l) => l.assignmentId === e.assignmentId && e.classIds.includes(l.classId) && mine.includes(l.classId)) : links.some((l) => l.assignmentId === e.assignmentId && mine.includes(l.classId));
    if (!eligible) continue;
    const mineAtt = attempts.filter((a) => a.examId === e.id);
    out.push({ exam: e, state: windowState(e), attemptsUsed: mineAtt.length, inProgress: mineAtt.find((a) => a.status === "in_progress") ?? null, result: results.filter((r) => r.examId === e.id).sort((a, b) => b.percentage - a.percentage)[0] ?? null });
  }
  return out;
}

export async function examIntro(ctx: OrgCtx, examId: string) {
  const e = await eligibleExam(ctx, examId);
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.examinationQuestions).where(eq(schema.examinationQuestions.examId, examId));
  const attempts = await db.select().from(schema.examinationAttempts).where(and(eq(schema.examinationAttempts.examId, examId), eq(schema.examinationAttempts.learnerId, ctx.userId), eq(schema.examinationAttempts.organizationId, ctx.orgId))).orderBy(asc(schema.examinationAttempts.attemptNumber));
  return { exam: { id: e.id, title: e.title, instructions: e.instructions, durationSeconds: e.durationSeconds, totalMarks: e.totalMarks, passPercent: e.passPercent, attemptLimit: e.attemptLimit, opensAt: e.opensAt, closesAt: e.closesAt, shuffleQuestions: e.shuffleQuestions }, questionCount: n, state: windowState(e), attempts };
}

/** Starts (or resumes) an attempt. Safe to call repeatedly: an in-progress attempt is returned, never duplicated. */
export async function startAttempt(ctx: OrgCtx, examId: string) {
  const e = await eligibleExam(ctx, examId);
  const state = windowState(e);
  if (state === "upcoming") return { ok: false as const, error: "This examination has not opened yet." };
  if (state === "closed") return { ok: false as const, error: "This examination is closed." };
  const db = await getDb();
  await finalizeExpired(ctx, examId);
  const existing = await db.select().from(schema.examinationAttempts).where(and(eq(schema.examinationAttempts.examId, examId), eq(schema.examinationAttempts.learnerId, ctx.userId), eq(schema.examinationAttempts.organizationId, ctx.orgId))).orderBy(desc(schema.examinationAttempts.attemptNumber));
  const open = existing.find((a) => a.status === "in_progress");
  if (open) return { ok: true as const, attemptId: open.id, resumed: true };
  if (existing.length >= e.attemptLimit) return { ok: false as const, error: `You have used all ${e.attemptLimit} attempt(s) for this examination.` };
  const now = new Date();
  const deadline = new Date(Math.min(now.getTime() + e.durationSeconds * 1000, e.closesAt && e.latePolicy === "reject" ? e.closesAt.getTime() : Infinity));
  const eqs = await db.select({ id: schema.examinationQuestions.id, qid: schema.examinationQuestions.questionId, order: schema.examinationQuestions.sortOrder }).from(schema.examinationQuestions).where(eq(schema.examinationQuestions.examId, examId)).orderBy(asc(schema.examinationQuestions.sortOrder));
  const attemptNumber = existing.length + 1;
  const seed = `${examId}:${ctx.userId}:${attemptNumber}`;
  const rng = seededRng(seed);
  const order = (e.shuffleQuestions ? shuffled(eqs, rng) : eqs).map((x) => x.id);
  const opts = await db.select({ id: schema.questionOptions.id, qid: schema.questionOptions.questionId, order: schema.questionOptions.sortOrder }).from(schema.questionOptions).where(inArray(schema.questionOptions.questionId, eqs.map((x) => x.qid)));
  const optionOrder: Record<string, string[]> = {};
  for (const x of eqs) {
    const os = opts.filter((o) => o.qid === x.qid).sort((a, b) => a.order - b.order);
    optionOrder[x.id] = (e.shuffleOptions && os.length > 2 ? shuffled(os, rng) : os).map((o) => o.id);
  }
  try {
    const [a] = await db.insert(schema.examinationAttempts).values({ organizationId: ctx.orgId, examId, learnerId: ctx.userId, attemptNumber, deadlineAt: deadline, questionOrder: order, optionOrder, events: [{ t: now.toISOString(), e: "started" }] }).returning({ id: schema.examinationAttempts.id });
    await audit({ id: ctx.userId, label: ctx.userName }, "exam.attempt_started", { type: "attempt", id: a.id }, { examId, attemptNumber }, { orgId: ctx.orgId });
    return { ok: true as const, attemptId: a.id, resumed: false };
  } catch {
    // A concurrent request created the attempt first (unique constraint): return that one.
    const [again] = await db.select().from(schema.examinationAttempts).where(and(eq(schema.examinationAttempts.examId, examId), eq(schema.examinationAttempts.learnerId, ctx.userId), eq(schema.examinationAttempts.organizationId, ctx.orgId), eq(schema.examinationAttempts.status, "in_progress")));
    if (again) return { ok: true as const, attemptId: again.id, resumed: true };
    return { ok: false as const, error: "Could not start the examination. Please try again." };
  }
}

async function loadMyAttempt(ctx: OrgCtx, attemptId: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.examinationAttempts).where(and(eq(schema.examinationAttempts.id, attemptId), eq(schema.examinationAttempts.organizationId, ctx.orgId), eq(schema.examinationAttempts.learnerId, ctx.userId)));
  if (!a) throw new NotFoundError("Attempt not found.");
  return a;
}

/** Everything the exam screen needs. Contains NO answer keys, explanations or rubrics. */
export async function attemptState(ctx: OrgCtx, attemptId: string) {
  let a = await loadMyAttempt(ctx, attemptId);
  if (a.status === "in_progress" && Date.now() > a.deadlineAt.getTime() + NETWORK_GRACE_MS) { await submitAttempt(ctx, attemptId, "auto_deadline"); a = await loadMyAttempt(ctx, attemptId); }
  const db = await getDb();
  const [e] = await db.select().from(schema.examinations).where(eq(schema.examinations.id, a.examId));
  if (a.status === "submitted") return { submitted: true as const, examTitle: e.title, attemptId: a.id, examId: a.examId };
  const rows = await db.select({ eqId: schema.examinationQuestions.id, marks: schema.examinationQuestions.marks, q: { id: schema.questions.id, type: schema.questions.type, text: schema.questions.text, scriptureRef: schema.questions.scriptureRef } })
    .from(schema.examinationQuestions).innerJoin(schema.questions, eq(schema.questions.id, schema.examinationQuestions.questionId)).where(eq(schema.examinationQuestions.examId, a.examId));
  const opts = await db.select({ id: schema.questionOptions.id, qid: schema.questionOptions.questionId, text: schema.questionOptions.text }).from(schema.questionOptions).where(inArray(schema.questionOptions.questionId, rows.map((r) => r.q.id)));
  const byEq = new Map(rows.map((r) => [r.eqId, r]));
  const answers = await db.select().from(schema.attemptAnswers).where(and(eq(schema.attemptAnswers.attemptId, attemptId), eq(schema.attemptAnswers.organizationId, ctx.orgId)));
  const ans = new Map(answers.map((x) => [x.examQuestionId, x]));
  const questions = a.questionOrder.map((id, i) => {
    const r = byEq.get(id)!;
    const os = (a.optionOrder[id] ?? []).map((oid) => opts.find((o) => o.id === oid)).filter(Boolean).map((o) => ({ id: o!.id, text: o!.text }));
    return { eqId: id, number: i + 1, type: r.q.type as QuestionType, text: r.q.text, scriptureRef: r.q.scriptureRef, marks: r.marks, options: r.q.type === "tf" ? [] : os, answer: ans.get(id)?.answer ?? null, flagged: ans.get(id)?.flagged ?? false };
  });
  return { submitted: false as const, attemptId: a.id, examId: a.examId, examTitle: e.title, instructions: e.instructions, attemptNumber: a.attemptNumber, serverNow: Date.now(), deadlineAt: a.deadlineAt.getTime(), questions };
}

const MAX_TEXT = 8000;
function shapeOk(type: QuestionType, answer: unknown, optionIds: Set<string>): boolean {
  if (answer === null) return true;
  switch (type) {
    case "mcq": case "scripture_ref": return typeof answer === "string" && optionIds.has(answer);
    case "multi": return Array.isArray(answer) && answer.every((x) => typeof x === "string" && optionIds.has(x)) && answer.length <= optionIds.size;
    case "tf": return typeof answer === "boolean";
    default: return typeof answer === "string" && answer.length <= MAX_TEXT;
  }
}

/** Autosave. The server clock decides whether the attempt is still open; the browser's clock is never trusted. */
export async function saveAnswer(ctx: OrgCtx, attemptId: string, examQuestionId: string, answer: unknown, flagged?: boolean) {
  const a = await loadMyAttempt(ctx, attemptId);
  if (a.status !== "in_progress") return { ok: false as const, error: "This attempt has already been submitted.", code: "submitted" as const };
  if (Date.now() > a.deadlineAt.getTime() + NETWORK_GRACE_MS) { await submitAttempt(ctx, attemptId, "auto_deadline"); return { ok: false as const, error: "Time is up. Your attempt was submitted.", code: "expired" as const }; }
  if (!a.questionOrder.includes(examQuestionId)) throw new NotFoundError("Question not found in this attempt.");
  const db = await getDb();
  const [row] = await db.select({ type: schema.questions.type, qid: schema.questions.id }).from(schema.examinationQuestions).innerJoin(schema.questions, eq(schema.questions.id, schema.examinationQuestions.questionId)).where(and(eq(schema.examinationQuestions.id, examQuestionId), eq(schema.examinationQuestions.organizationId, ctx.orgId)));
  const allowed = new Set(a.optionOrder[examQuestionId] ?? []);
  if (!shapeOk(row.type, answer, allowed)) return { ok: false as const, error: "That answer is not valid for this question.", code: "invalid" as const };
  await db.insert(schema.attemptAnswers).values({ organizationId: ctx.orgId, attemptId, examQuestionId, answer: answer as never, flagged: flagged ?? false, reviewStatus: "pending" })
    .onConflictDoUpdate({ target: [schema.attemptAnswers.attemptId, schema.attemptAnswers.examQuestionId], set: { answer: answer as never, ...(flagged !== undefined ? { flagged } : {}), updatedAt: new Date() } });
  return { ok: true as const, savedAt: Date.now() };
}
export async function setFlag(ctx: OrgCtx, attemptId: string, examQuestionId: string, flagged: boolean) {
  const a = await loadMyAttempt(ctx, attemptId);
  if (a.status !== "in_progress") return { ok: false as const };
  const db = await getDb();
  await db.insert(schema.attemptAnswers).values({ organizationId: ctx.orgId, attemptId, examQuestionId, answer: null, flagged, reviewStatus: "pending" }).onConflictDoUpdate({ target: [schema.attemptAnswers.attemptId, schema.attemptAnswers.examQuestionId], set: { flagged, updatedAt: new Date() } });
  return { ok: true as const };
}
export async function recordEvent(ctx: OrgCtx, attemptId: string, event: string) {
  const a = await loadMyAttempt(ctx, attemptId);
  if (a.status !== "in_progress" || !/^[a-z_]{3,30}$/.test(event)) return;
  const db = await getDb();
  await db.update(schema.examinationAttempts).set({ events: [...a.events.slice(-80), { t: new Date().toISOString(), e: event }] }).where(eq(schema.examinationAttempts.id, a.id));
}

async function finalizeExpired(ctx: OrgCtx, examId: string) {
  const db = await getDb();
  const stale = await db.select({ id: schema.examinationAttempts.id }).from(schema.examinationAttempts).where(and(eq(schema.examinationAttempts.examId, examId), eq(schema.examinationAttempts.learnerId, ctx.userId), eq(schema.examinationAttempts.organizationId, ctx.orgId), eq(schema.examinationAttempts.status, "in_progress"), sql`${schema.examinationAttempts.deadlineAt} < now() - interval '5 seconds'`));
  for (const s of stale) await submitAttempt(ctx, s.id, "auto_deadline");
}

/** Idempotent submission: the attempt row is locked, so a double click or retry returns the first result and never scores twice. */
export async function submitAttempt(ctx: OrgCtx, attemptId: string, method: "learner" | "auto_deadline" = "learner") {
  const db = await getDb();
  const gs = await scale(ctx); // read settings BEFORE the transaction so no query is issued on another connection while it is open
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(schema.examinationAttempts).where(and(eq(schema.examinationAttempts.id, attemptId), eq(schema.examinationAttempts.organizationId, ctx.orgId), eq(schema.examinationAttempts.learnerId, ctx.userId))).for("update");
    if (!a) throw new NotFoundError("Attempt not found.");
    if (a.status === "submitted") return { ok: true as const, already: true, attemptId };
    const now = new Date();
    const late = now.getTime() > a.deadlineAt.getTime() + NETWORK_GRACE_MS;
    const submittedAt = late ? a.deadlineAt : now;
    await tx.update(schema.examinationAttempts).set({ status: "submitted", submittedAt, submitMethod: late ? "auto_deadline" : method, events: [...a.events.slice(-80), { t: now.toISOString(), e: late ? "auto_submitted_at_deadline" : "submitted" }] }).where(eq(schema.examinationAttempts.id, attemptId));
    await gradeAttempt(tx, ctx, attemptId, gs);
    return { ok: true as const, already: false, attemptId };
  });
}

/** Objective questions are scored on the server; written answers wait for a teacher. */
async function gradeAttempt(tx: DB | Tx, ctx: Pick<OrgCtx, "orgId" | "orgSettings">, attemptId: string, gs: GradeScaleEntry[]) {
  const [a] = await tx.select().from(schema.examinationAttempts).where(eq(schema.examinationAttempts.id, attemptId));
  const [e] = await tx.select().from(schema.examinations).where(eq(schema.examinations.id, a.examId));
  const eqs = await tx.select({ eq: schema.examinationQuestions, q: schema.questions, key: schema.questionAnswerKeys }).from(schema.examinationQuestions).innerJoin(schema.questions, eq(schema.questions.id, schema.examinationQuestions.questionId)).innerJoin(schema.questionAnswerKeys, eq(schema.questionAnswerKeys.questionId, schema.questions.id)).where(eq(schema.examinationQuestions.examId, a.examId));
  const opts = await tx.select().from(schema.questionOptions).where(inArray(schema.questionOptions.questionId, eqs.map((x) => x.q.id)));
  const answers = await tx.select().from(schema.attemptAnswers).where(eq(schema.attemptAnswers.attemptId, attemptId));
  let score = 0, pending = false;
  for (const x of eqs) {
    const given = answers.find((r) => r.examQuestionId === x.eq.id);
    const sorted = opts.filter((o) => o.questionId === x.q.id).sort((p, q) => p.sortOrder - q.sortOrder);
    const idxOf = (id: unknown) => sorted.findIndex((o) => o.id === id);
    let raw: unknown = given?.answer ?? null;
    if (x.key.config.type === "mcq" || x.key.config.type === "scripture_ref") raw = raw === null ? null : idxOf(raw);
    if (x.key.config.type === "multi") raw = Array.isArray(raw) ? raw.map(idxOf) : [];
    const out = gradeAnswer(x.key.config as AnswerConfig, raw, x.eq.marks);
    const reviewed = given?.reviewStatus === "reviewed"; // a teacher's earlier decision is never overwritten by a re-grade
    const awarded = reviewed ? given!.awardedMarks : out.awarded;
    const status = reviewed ? "reviewed" : out.status === "auto" ? "auto" : "pending";
    if (awarded === null) pending = true; else score += awarded;
    await tx.insert(schema.attemptAnswers).values({ organizationId: a.organizationId, attemptId, examQuestionId: x.eq.id, answer: (given?.answer ?? null) as never, awardedMarks: awarded, reviewStatus: status })
      .onConflictDoUpdate({ target: [schema.attemptAnswers.attemptId, schema.attemptAnswers.examQuestionId], set: { awardedMarks: awarded, reviewStatus: status } });
  }
  await writeResult(tx, a.id, e, score, pending, gs);
}

async function writeResult(tx: DB | Tx, attemptId: string, e: Exam, score: number, pending: boolean, gs: GradeScaleEntry[]) {
  const total = e.totalMarks;
  const sc = round2(score), pc = percent(sc, total);
  const grade = gradeFor(pc, gs);
  const pass = pc >= e.passPercent ? "pass" : "fail";
  const [a] = await tx.select().from(schema.examinationAttempts).where(eq(schema.examinationAttempts.id, attemptId));
  await tx.update(schema.examinationAttempts).set({ score: sc, totalMarks: total, percentage: pc, gradingStatus: pending ? "pending_review" : "graded" }).where(eq(schema.examinationAttempts.id, attemptId));
  const publish = e.resultPolicy === "immediate" && !pending;
  const [existing] = await tx.select().from(schema.assessmentResults).where(eq(schema.assessmentResults.attemptId, attemptId));
  if (existing) {
    await tx.update(schema.assessmentResults).set({ awardedMarks: sc, totalMarks: total, percentage: pc, grade, passStatus: pass }).where(eq(schema.assessmentResults.id, existing.id));
  } else {
    await tx.insert(schema.assessmentResults).values({ organizationId: a.organizationId, examId: e.id, learnerId: a.learnerId, attemptId, awardedMarks: sc, totalMarks: total, percentage: pc, grade, passStatus: pass, publicationStatus: publish ? "published" : "unpublished", publishedAt: publish ? new Date() : null });
  }
}

/* ============================ MARKING ============================ */
async function visibleLearnerIds(ctx: OrgCtx): Promise<string[] | "all"> {
  const allowed = await teacherClassIds(ctx);
  if (allowed === "all") return "all";
  if (!allowed.length) return [];
  const db = await getDb();
  const r = await db.selectDistinct({ id: schema.classMemberships.userId }).from(schema.classMemberships).where(and(eq(schema.classMemberships.organizationId, ctx.orgId), inArray(schema.classMemberships.classId, allowed)));
  return r.map((x) => x.id);
}

export async function markingQueue(ctx: OrgCtx) {
  assertCan(ctx, "grading.mark");
  const db = await getDb();
  const vis = await visibleLearnerIds(ctx);
  if (vis !== "all" && !vis.length) return [];
  return db.select({ attemptId: schema.examinationAttempts.id, exam: schema.examinations.title, learner: schema.users.fullName, submittedAt: schema.examinationAttempts.submittedAt,
    pending: sql<number>`(select count(*)::int from attempt_answers aa where aa.attempt_id = ${schema.examinationAttempts.id} and aa.review_status = 'pending' and aa.awarded_marks is null)` })
    .from(schema.examinationAttempts).innerJoin(schema.examinations, eq(schema.examinations.id, schema.examinationAttempts.examId)).innerJoin(schema.users, eq(schema.users.id, schema.examinationAttempts.learnerId))
    .where(and(eq(schema.examinationAttempts.organizationId, ctx.orgId), eq(schema.examinationAttempts.gradingStatus, "pending_review"), vis === "all" ? undefined : inArray(schema.examinationAttempts.learnerId, vis))).orderBy(asc(schema.examinationAttempts.submittedAt));
}

export async function attemptForMarking(ctx: OrgCtx, attemptId: string) {
  assertCan(ctx, "grading.mark");
  const db = await getDb();
  const [a] = await db.select({ a: schema.examinationAttempts, learner: schema.users.fullName, exam: schema.examinations }).from(schema.examinationAttempts).innerJoin(schema.users, eq(schema.users.id, schema.examinationAttempts.learnerId)).innerJoin(schema.examinations, eq(schema.examinations.id, schema.examinationAttempts.examId))
    .where(and(eq(schema.examinationAttempts.id, attemptId), eq(schema.examinationAttempts.organizationId, ctx.orgId)));
  if (!a) throw new NotFoundError("Attempt not found.");
  const vis = await visibleLearnerIds(ctx);
  if (vis !== "all" && !vis.includes(a.a.learnerId)) throw new AccessError("That learner is not in one of your classes.");
  const rows = await db.select({ ans: schema.attemptAnswers, eq: schema.examinationQuestions, q: schema.questions, key: schema.questionAnswerKeys }).from(schema.examinationQuestions)
    .innerJoin(schema.questions, eq(schema.questions.id, schema.examinationQuestions.questionId)).innerJoin(schema.questionAnswerKeys, eq(schema.questionAnswerKeys.questionId, schema.questions.id))
    .leftJoin(schema.attemptAnswers, and(eq(schema.attemptAnswers.examQuestionId, schema.examinationQuestions.id), eq(schema.attemptAnswers.attemptId, attemptId)))
    .where(eq(schema.examinationQuestions.examId, a.a.examId)).orderBy(asc(schema.examinationQuestions.sortOrder));
  const opts = await db.select().from(schema.questionOptions).where(inArray(schema.questionOptions.questionId, rows.map((r) => r.q.id)));
  const items = rows.map((r) => {
    const o = opts.filter((x) => x.questionId === r.q.id).sort((p, q) => p.sortOrder - q.sortOrder);
    const given = r.ans?.answer;
    const display = r.q.type === "mcq" || r.q.type === "scripture_ref" ? o.find((x) => x.id === given)?.text ?? null : r.q.type === "multi" ? (Array.isArray(given) ? given.map((id) => o.find((x) => x.id === id)?.text).filter(Boolean).join("; ") : null) : given === null || given === undefined ? null : String(given);
    const out = r.key.config.type === "short" && typeof given === "string" ? gradeAnswer(r.key.config, given, r.eq.marks) : null;
    return { answerId: r.ans?.id ?? null, eqId: r.eq.id, text: r.q.text, type: r.q.type, marks: r.eq.marks, given: display, awarded: r.ans?.awardedMarks ?? null, reviewStatus: r.ans?.reviewStatus ?? "pending", feedback: r.ans?.feedback ?? "", suggested: out?.suggested ?? null, rubric: "rubric" in r.key.config ? r.key.config.rubric : null, keyPoints: "keyPoints" in r.key.config ? r.key.config.keyPoints : "keywords" in r.key.config ? r.key.config.keywords : "accepted" in r.key.config ? r.key.config.accepted : null, explanation: r.key.explanation };
  });
  return { attempt: a.a, learner: a.learner, exam: a.exam, items };
}

export async function markAnswer(ctx: OrgCtx, attemptId: string, examQuestionId: string, marks: number, feedback: string) {
  assertCan(ctx, "grading.mark");
  const data = await attemptForMarking(ctx, attemptId); // authorisation: church, class and role
  const item = data.items.find((i) => i.eqId === examQuestionId);
  if (!item) throw new NotFoundError("Question not found.");
  if (!Number.isFinite(marks) || marks < 0 || marks > item.marks) return { ok: false as const, error: `Marks must be between 0 and ${item.marks}.` };
  const db = await getDb();
  const gs = await scale(ctx);
  await db.transaction(async (tx) => {
    await tx.insert(schema.attemptAnswers).values({ organizationId: ctx.orgId, attemptId, examQuestionId, answer: null, awardedMarks: round2(marks), reviewStatus: "reviewed", feedback: feedback.trim().slice(0, 1500) || null })
      .onConflictDoUpdate({ target: [schema.attemptAnswers.attemptId, schema.attemptAnswers.examQuestionId], set: { awardedMarks: round2(marks), reviewStatus: "reviewed", feedback: feedback.trim().slice(0, 1500) || null } });
    const all = await tx.select().from(schema.attemptAnswers).where(eq(schema.attemptAnswers.attemptId, attemptId));
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.examinationQuestions).where(eq(schema.examinationQuestions.examId, data.attempt.examId));
    const score = all.reduce((s, r) => s + (r.awardedMarks ?? 0), 0);
    const pending = all.some((r) => r.awardedMarks === null) || all.length < n;
    await writeResult(tx, attemptId, data.exam, score, pending, gs);
    await audit({ id: ctx.userId, label: ctx.userName }, "exam.answer_marked", { type: "attempt", id: attemptId }, { examQuestionId }, { orgId: ctx.orgId, db: tx });
  });
  return { ok: true as const };
}

/* ============================ RESULTS ============================ */
export async function publishResults(ctx: OrgCtx, examId: string) {
  assertCan(ctx, "results.publish");
  const e = await loadExam(ctx, examId);
  if (ctx.role === "teacher" && !orgSettings(ctx).teachersPublishResults) throw new AccessError("Your church requires an administrator to publish results.");
  const db = await getDb();
  const vis = await visibleLearnerIds(ctx);
  const pending = await db.select({ id: schema.examinationAttempts.id }).from(schema.examinationAttempts).where(and(eq(schema.examinationAttempts.examId, examId), eq(schema.examinationAttempts.organizationId, ctx.orgId), eq(schema.examinationAttempts.gradingStatus, "pending_review"), vis === "all" ? undefined : inArray(schema.examinationAttempts.learnerId, vis)));
  const rows = await db.select().from(schema.assessmentResults).where(and(eq(schema.assessmentResults.examId, examId), eq(schema.assessmentResults.organizationId, ctx.orgId), eq(schema.assessmentResults.publicationStatus, "unpublished"), vis === "all" ? undefined : inArray(schema.assessmentResults.learnerId, vis)));
  const pendingIds = new Set(pending.map((p) => p.id));
  const ready = rows.filter((r) => !pendingIds.has(r.attemptId));
  for (const r of ready) {
    await db.update(schema.assessmentResults).set({ publicationStatus: "published", publishedAt: new Date(), publishedBy: ctx.userId }).where(eq(schema.assessmentResults.id, r.id));
    await notify(r.learnerId, { type: "result", title: `Your result: ${e.title}`, href: `/learn/results`, orgId: ctx.orgId, dedupeKey: `result:${r.id}` });
  }
  await audit({ id: ctx.userId, label: ctx.userName }, "exam.results_published", { type: "exam", id: examId }, { count: ready.length, withheld: rows.length - ready.length }, { orgId: ctx.orgId });
  return { published: ready.length, withheld: rows.length - ready.length };
}

export function answersReleased(e: Pick<Exam, "reviewPolicy" | "status" | "closesAt">, resultPublished: boolean, now = new Date()) {
  if (e.reviewPolicy === "never") return false;
  if (e.reviewPolicy === "after_publish") return resultPublished;
  return e.status === "closed" || (!!e.closesAt && now > e.closesAt);
}

export async function myResults(ctx: OrgCtx) {
  assertCan(ctx, "learn");
  const db = await getDb();
  return db.select({ r: schema.assessmentResults, exam: schema.examinations.title, kind: schema.examinations.kind, passPercent: schema.examinations.passPercent, attemptNumber: schema.examinationAttempts.attemptNumber, submittedAt: schema.examinationAttempts.submittedAt })
    .from(schema.assessmentResults).innerJoin(schema.examinations, eq(schema.examinations.id, schema.assessmentResults.examId)).innerJoin(schema.examinationAttempts, eq(schema.examinationAttempts.id, schema.assessmentResults.attemptId))
    .where(and(eq(schema.assessmentResults.organizationId, ctx.orgId), eq(schema.assessmentResults.learnerId, ctx.userId), eq(schema.assessmentResults.publicationStatus, "published"))).orderBy(desc(schema.examinationAttempts.submittedAt));
}

/** A learner's published result. Per-question answers and explanations appear only once the review policy releases them. */
export async function myResultDetail(ctx: OrgCtx, attemptId: string) {
  assertCan(ctx, "learn");
  const db = await getDb();
  const [r] = await db.select({ r: schema.assessmentResults, e: schema.examinations, a: schema.examinationAttempts }).from(schema.assessmentResults).innerJoin(schema.examinations, eq(schema.examinations.id, schema.assessmentResults.examId)).innerJoin(schema.examinationAttempts, eq(schema.examinationAttempts.id, schema.assessmentResults.attemptId))
    .where(and(eq(schema.assessmentResults.attemptId, attemptId), eq(schema.assessmentResults.organizationId, ctx.orgId), eq(schema.assessmentResults.learnerId, ctx.userId), eq(schema.assessmentResults.publicationStatus, "published")));
  if (!r) throw new NotFoundError("Result not found or not yet published.");
  const released = answersReleased(r.e, true);
  const rows = await db.select({ ans: schema.attemptAnswers, eq: schema.examinationQuestions, q: schema.questions, key: schema.questionAnswerKeys }).from(schema.examinationQuestions)
    .innerJoin(schema.questions, eq(schema.questions.id, schema.examinationQuestions.questionId)).innerJoin(schema.questionAnswerKeys, eq(schema.questionAnswerKeys.questionId, schema.questions.id))
    .leftJoin(schema.attemptAnswers, and(eq(schema.attemptAnswers.examQuestionId, schema.examinationQuestions.id), eq(schema.attemptAnswers.attemptId, attemptId))).where(eq(schema.examinationQuestions.examId, r.e.id)).orderBy(asc(schema.examinationQuestions.sortOrder));
  const opts = await db.select().from(schema.questionOptions).where(inArray(schema.questionOptions.questionId, rows.map((x) => x.q.id)));
  const topics = new Map<string, { got: number; of: number }>();
  const items = rows.map((x, i) => {
    for (const t of x.q.topicTags) { const c = topics.get(t) ?? { got: 0, of: 0 }; c.got += x.ans?.awardedMarks ?? 0; c.of += x.eq.marks; topics.set(t, c); }
    const o = opts.filter((p) => p.questionId === x.q.id).sort((p, q) => p.sortOrder - q.sortOrder);
    const base = { number: i + 1, text: x.q.text, type: x.q.type, marks: x.eq.marks, awarded: x.ans?.awardedMarks ?? 0, feedback: x.ans?.feedback ?? null };
    if (!released) return base;
    const cfg = x.key.config;
    const correct = cfg.type === "mcq" || cfg.type === "scripture_ref" ? o[cfg.correct]?.text : cfg.type === "multi" ? cfg.correct.map((c) => o[c]?.text).join("; ") : cfg.type === "tf" ? (cfg.correct ? "True" : "False") : cfg.type === "fill" ? cfg.accepted[0] : "rubric" in cfg ? cfg.rubric : "";
    const given = x.q.type === "mcq" || x.q.type === "scripture_ref" ? o.find((p) => p.id === x.ans?.answer)?.text : x.q.type === "multi" ? (Array.isArray(x.ans?.answer) ? (x.ans!.answer as string[]).map((id) => o.find((p) => p.id === id)?.text).join("; ") : "") : x.q.type === "tf" ? (x.ans?.answer === true ? "True" : x.ans?.answer === false ? "False" : "") : String(x.ans?.answer ?? "");
    return { ...base, given: given ?? "", correct, explanation: x.key.explanation };
  });
  const fb = await db.select().from(schema.resultFeedback).where(and(eq(schema.resultFeedback.resultId, r.r.id), eq(schema.resultFeedback.status, "published"), eq(schema.resultFeedback.organizationId, ctx.orgId)));
  return { result: r.r, exam: { title: r.e.title, passPercent: r.e.passPercent, kind: r.e.kind }, attempt: { number: r.a.attemptNumber, submittedAt: r.a.submittedAt, startedAt: r.a.startedAt }, released, items, topics: [...topics.entries()].map(([topic, v]) => ({ topic, percent: percent(v.got, v.of) })), feedback: fb.map((f) => f.content) };
}

export async function addResultFeedback(ctx: OrgCtx, resultId: string, content: string, publish: boolean) {
  assertCan(ctx, "grading.mark");
  const db = await getDb();
  const [r] = await db.select().from(schema.assessmentResults).where(and(eq(schema.assessmentResults.id, resultId), eq(schema.assessmentResults.organizationId, ctx.orgId)));
  if (!r) throw new NotFoundError();
  const vis = await visibleLearnerIds(ctx);
  if (vis !== "all" && !vis.includes(r.learnerId)) throw new AccessError();
  await db.insert(schema.resultFeedback).values({ organizationId: ctx.orgId, resultId, authorId: ctx.userId, content: content.trim().slice(0, 2000), status: publish ? "published" : "draft" });
}

/** Results of one examination for staff: per-learner rows and class statistics. */
export async function examResults(ctx: OrgCtx, examId: string) {
  assertCan(ctx, "classes.view");
  const e = await loadExam(ctx, examId);
  const db = await getDb();
  const vis = await visibleLearnerIds(ctx);
  if (vis !== "all" && !vis.length) return { exam: e, rows: [], stats: { count: 0, average: 0, passRate: 0, highest: 0, lowest: 0 } };
  const rows = await db.select({ r: schema.assessmentResults, name: schema.users.fullName, attemptNumber: schema.examinationAttempts.attemptNumber, grading: schema.examinationAttempts.gradingStatus, started: schema.examinationAttempts.startedAt, submitted: schema.examinationAttempts.submittedAt })
    .from(schema.assessmentResults).innerJoin(schema.users, eq(schema.users.id, schema.assessmentResults.learnerId)).innerJoin(schema.examinationAttempts, eq(schema.examinationAttempts.id, schema.assessmentResults.attemptId))
    .where(and(eq(schema.assessmentResults.examId, examId), eq(schema.assessmentResults.organizationId, ctx.orgId), vis === "all" ? undefined : inArray(schema.assessmentResults.learnerId, vis))).orderBy(asc(schema.users.fullName));
  const pcs = rows.map((x) => x.r.percentage);
  return { exam: e, rows, stats: { count: rows.length, average: pcs.length ? round2(pcs.reduce((a, b) => a + b, 0) / pcs.length) : 0, passRate: rows.length ? Math.round((rows.filter((x) => x.r.passStatus === "pass").length / rows.length) * 100) : 0, highest: pcs.length ? Math.max(...pcs) : 0, lowest: pcs.length ? Math.min(...pcs) : 0 } };
}

export { initialsName, isNull, can };
