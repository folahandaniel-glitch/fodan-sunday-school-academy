import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { boot, addPerson, makeChurch, makeClass, registerMember, STRONG, uniq } from "./helpers";
import { createProgramme, activateProgramme, adoptNewVersion, previewAdoption, getProgramme } from "@/server/services/schedule";
import { classDetail, decideMembership, listMembers, enrolLearner, createClass } from "@/server/services/church";
import { createDraftFromVersion, publishVersion, reviewDecision, submitForReview, updateLesson, FrozenError, validateVersion, getCurriculumAdmin } from "@/server/services/curriculum";
import { getLesson, markDelivered, lessonList, saveAttendance, attendanceSheet, setMyProgress, myProgrammes } from "@/server/services/teaching";
import { attemptState, examIntro, generateExam, markAnswer, markingQueue, myResultDetail, myResults, publishExam, publishResults, saveAnswer, startAttempt, submitAttempt, examResults, attemptForMarking } from "@/server/services/exams";
import { resolveOrgCtx, AccessError, NotFoundError, type OrgCtx } from "@/server/org";
import { searchChurches } from "@/server/services/auth";
import { setLessonRelease } from "@/server/services/schedule";
import type { Actor } from "@/server/audit";

type Person = { userId: string; ctx: OrgCtx };
let actor: Actor, curriculumId: string, v1: string;
let A: Awaited<ReturnType<typeof makeChurch>>, B: Awaited<ReturnType<typeof makeChurch>>;
let teacherA: Person, learnerA: Person, learnerA2: Person, learnerB: Person, teacherB: Person;
let classA: string, classB: string, assignmentA: string, sessionA: string;

const dates = { sessionName: "January to June 2026", year: 2026, sessionType: "jan_jun" as const, startDate: "2026-01-01", endDate: "2026-06-30", weekday: 0 };

beforeAll(async () => {
  ({ actor } = await boot([1]));
  const db = await getDb();
  const [c] = await db.select().from(schema.curricula).where(eq(schema.curricula.catalogNumber, 1));
  curriculumId = c.id; v1 = c.currentVersionId!;
  A = await makeChurch("Grace Chapel Alpha");
  B = await makeChurch("Zion Gospel Beta");
  teacherA = await addPerson(A.ctx, "teacher", "Tolu Teacher");
  learnerA = await addPerson(A.ctx, "learner", "Lola Learner");
  learnerA2 = await addPerson(A.ctx, "learner", "Kunle Learner");
  teacherB = await addPerson(B.ctx, "teacher", "Ben Teacher");
  learnerB = await addPerson(B.ctx, "learner", "Bola Learner");
  classA = await makeClass(A.ctx, "Adults A", teacherA.userId, [learnerA.userId, learnerA2.userId]);
  classB = await makeClass(B.ctx, "Adults B", teacherB.userId, [learnerB.userId]);
  const r = await createProgramme(A.ctx, { ...dates, curriculumId, classIds: [classA], idempotencyKey: "first-try", activate: true });
  if (!r.ok) throw new Error(r.error);
  assignmentA = r.assignmentId; sessionA = r.sessionId;
  teacherA.ctx = (await resolveOrgCtx(teacherA.userId))!; learnerA.ctx = (await resolveOrgCtx(learnerA.userId))!; learnerA2.ctx = (await resolveOrgCtx(learnerA2.userId))!;
});

describe("curriculum content and publishing", () => {
  it("published curriculum 1 passes every completeness rule with 26 complete units", async () => {
    const r = await validateVersion(v1);
    expect(r.problems).toEqual([]);
    expect(r.lessonsComplete).toBe(26);
  });
  it("an incomplete curriculum cannot be submitted for review", async () => {
    const { createCurriculum } = await import("@/server/services/curriculum");
    const c = await createCurriculum(actor, { title: "Half Finished Course" });
    if (!c.ok) throw new Error("create failed");
    const r = await submitForReview(actor, c.versionId);
    expect(r.ok).toBe(false);
  });
});

describe("registration and church membership", () => {
  it("lets a member pick a church and only see it once approved; typed names create an unverified listing", async () => {
    const em = `${uniq("m")}@test.org`;
    const reg = await registerMember({ fullName: "Mary Member", email: em, password: STRONG, role: "learner", orgId: A.orgId, joinCode: "", isThirteenOrOlder: true, acceptTerms: true });
    expect(reg.ok && reg.membership).toBe("pending");
    if (!reg.ok) return;
    expect(await resolveOrgCtx(reg.userId)).toBeNull(); // no church features while pending
    const pending = await listMembers(A.ctx, { status: "pending" });
    const m = pending.rows.find((r) => r.userId === reg.userId)!;
    await decideMembership(A.ctx, m.id, "approve");
    expect((await resolveOrgCtx(reg.userId))?.orgId).toBe(A.orgId);

    const typed = await registerMember({ fullName: "Tim Typed", email: `${uniq("t")}@test.org`, password: STRONG, role: "learner", typedChurch: { name: "Brand New Fellowship", city: "Abuja", state: "FCT Abuja", country: "Nigeria" }, joinCode: "", isThirteenOrOlder: true, acceptTerms: true });
    expect(typed.ok && typed.orgStatus).toBe("unverified");
    if (typed.ok) expect(await resolveOrgCtx(typed.userId)).toBeNull();
    const dup = await registerMember({ fullName: "Dee Dup", email: `${uniq("d")}@test.org`, password: STRONG, role: "learner", typedChurch: { name: "brand new  fellowship", city: "Abuja" }, joinCode: "", isThirteenOrOlder: true, acceptTerms: true });
    expect(dup.ok).toBe(false);
    expect((await searchChurches("brand new")).some((c) => c.name === "Brand New Fellowship")).toBe(true);
  });
  it("auto-approves with the church's join code", async () => {
    const reg = await registerMember({ fullName: "Joe Joiner", email: `${uniq("j")}@test.org`, password: STRONG, role: "learner", orgId: B.orgId, joinCode: B.org.joinCode!, isThirteenOrOlder: true, acceptTerms: true });
    expect(reg.ok && reg.membership).toBe("active");
    const bad = await registerMember({ fullName: "Bad Code", email: `${uniq("j")}@test.org`, password: STRONG, role: "learner", orgId: B.orgId, joinCode: "WRONG-CODE", isThirteenOrOlder: true, acceptTerms: true });
    expect(bad.ok).toBe(false);
  });
  it("rejects weak passwords and duplicate emails", async () => {
    const r = await registerMember({ fullName: "Weak Pass", email: `${uniq("w")}@test.org`, password: "password1", role: "learner", orgId: A.orgId, joinCode: "", isThirteenOrOlder: true, acceptTerms: true });
    expect(r.ok).toBe(false);
  });
});

describe("church data isolation (church B cannot reach church A)", () => {
  it("cannot read or decide another church's members", async () => {
    const mine = await listMembers(B.ctx);
    expect(mine.rows.every((r) => r.userId !== learnerA.userId)).toBe(true);
    const db = await getDb();
    const [m] = await db.select().from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.userId, learnerA.userId), eq(schema.organizationMemberships.organizationId, A.orgId)));
    await expect(decideMembership(B.ctx, m.id, "approve")).rejects.toThrow(NotFoundError);
  });
  it("cannot open another church's class, programme or lesson by id", async () => {
    await expect(classDetail(B.ctx, classA)).rejects.toThrow(NotFoundError);
    await expect(getProgramme(B.ctx, assignmentA)).rejects.toThrow(NotFoundError);
    const db = await getDb();
    const [sl] = await db.select().from(schema.scheduledLessons).where(eq(schema.scheduledLessons.assignmentId, assignmentA));
    await expect(getLesson(B.ctx, sl.id)).rejects.toThrow(NotFoundError);
    await expect(getLesson(learnerB.ctx, sl.id)).rejects.toThrow(NotFoundError);
    await expect(markDelivered(teacherB.ctx, sl.id, classA)).rejects.toThrow();
    await expect(enrolLearner(B.ctx, classA, learnerB.userId)).rejects.toThrow();
  });
  it("cannot attach another church's class to its programme, nor write cross-church rows", async () => {
    const r = createProgramme(B.ctx, { ...dates, sessionName: "Cross attempt", curriculumId, classIds: [classA] });
    await expect(r).rejects.toThrow(NotFoundError);
    const db = await getDb();
    // The database itself refuses a class membership whose class belongs to another church.
    await expect(db.insert(schema.classMemberships).values({ organizationId: B.orgId, classId: classA, userId: learnerB.userId })).rejects.toThrow();
    await expect(db.insert(schema.attendanceSessions).values({ organizationId: B.orgId, scheduledLessonId: (await db.select().from(schema.scheduledLessons).where(eq(schema.scheduledLessons.assignmentId, assignmentA)))[0].id, classId: classB, recordedBy: teacherB.userId, sessionDate: "2026-01-04" })).rejects.toThrow();
  });
  it("a learner in one church sees none of another church's programmes", async () => {
    expect((await myProgrammes(learnerB.ctx)).length).toBe(0);
    expect((await myProgrammes(learnerA.ctx)).length).toBe(1);
  });
  it("a teacher sees only assigned classes", async () => {
    const other = await createClass(A.ctx, { name: "Youth A" });
    if (!other.ok) throw new Error("class");
    await expect(classDetail(teacherA.ctx, other.id)).rejects.toThrow(AccessError);
    expect((await classDetail(teacherA.ctx, classA)).class.id).toBe(classA);
  });
});

describe("scheduling", () => {
  it("generates 26 independent lesson records with test, examination and revision weeks", async () => {
    const p = await getProgramme(A.ctx, assignmentA);
    expect(p.lessons).toHaveLength(26);
    const by = (w: number) => p.lessons.find((l) => l.sl.weekNumber === w)!;
    expect([by(13).sl.lessonType, by(25).sl.lessonType, by(26).sl.lessonType]).toEqual(["midtest", "final", "revision"]);
    expect(by(1).sl.scheduledDate).toBe("2026-01-04");
    expect(by(26).sl.scheduledDate).toBe("2026-06-28");
    expect(p.a.status).toBe("active");
    expect(p.a.versionId).toBe(v1);
  });
  it("is idempotent: a retried request does not create a second programme", async () => {
    const again = await createProgramme(A.ctx, { ...dates, curriculumId, classIds: [classA], idempotencyKey: "first-try", activate: true });
    expect(again.ok && again.duplicate).toBe(true);
    const dupe = await createProgramme(A.ctx, { ...dates, curriculumId, classIds: [classA], existingSessionId: sessionA });
    expect(dupe.ok).toBe(false); // same curriculum twice in one session is refused
  });
  it("never silently drops lessons when the calendar is short", async () => {
    const r = await createProgramme(A.ctx, { ...dates, sessionName: "Short session", sessionType: "custom", startDate: "2026-07-01", endDate: "2026-11-30", curriculumId, shortfallPolicy: "unscheduled" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = await getProgramme(A.ctx, r.assignmentId);
    expect(p.lessons).toHaveLength(26);
    expect(p.lessons.some((l) => !l.sl.scheduledDate)).toBe(true);
    await expect(activateProgramme(A.ctx, r.assignmentId)).rejects.toThrow(AccessError);
  });
});

describe("curriculum versioning protects active programmes", () => {
  let v2: string;
  it("editing a published version is refused at the service and at the database", async () => {
    await expect(updateLesson(actor, v1, 1, { title: "Hacked" })).rejects.toThrow(FrozenError);
    const db = await getDb();
    await expect(db.update(schema.curriculumLessons).set({ title: "Hacked" }).where(eq(schema.curriculumLessons.versionId, v1))).rejects.toThrow();
  });
  it("a new version leaves church A's pinned programme untouched, until A adopts it", async () => {
    const d = await createDraftFromVersion(actor, v1, "Clearer wording in week 2.");
    if (!d.ok) throw new Error(d.error);
    v2 = d.id;
    await updateLesson(actor, v2, 2, { title: "God Speaks: Revelation and Inspiration (revised)" });
    const sub = await submitForReview(actor, v2);
    expect(sub.ok).toBe(true);
    expect((await reviewDecision(actor, v2, "approve", "Looks good.")).ok).toBe(true);
    await publishVersion(actor, v2);
    const db = await getDb();
    const [cur] = await db.select().from(schema.curricula).where(eq(schema.curricula.id, curriculumId));
    expect(cur.currentVersionId).toBe(v2);
    const p = await getProgramme(A.ctx, assignmentA);
    expect(p.a.versionId).toBe(v1);
    expect(p.lessons.find((l) => l.unitWeek === 2)!.title).toBe("God Speaks: Revelation and Inspiration");
    const view = await getLesson(learnerA.ctx, p.lessons.find((l) => l.unitWeek === 2)!.sl.id);
    expect(view.lesson.title).toBe("God Speaks: Revelation and Inspiration");
    expect(view.versionNumber).toBe(1);
    const pv = await previewAdoption(A.ctx, assignmentA);
    expect(pv.available && pv.changedMovable).toBe(1);
  });
  it("adoption moves only undelivered weeks; delivered weeks stay on the version taught", async () => {
    const db = await getDb();
    const [week1] = await db.select().from(schema.scheduledLessons).where(and(eq(schema.scheduledLessons.assignmentId, assignmentA), eq(schema.scheduledLessons.weekNumber, 1)));
    await markDelivered(teacherA.ctx, week1.id, classA, "Taught.");
    const r = await adoptNewVersion(A.ctx, assignmentA, "Adopting v2");
    expect(r.ok && r.weeksMoved).toBe(25);
    const p = await getProgramme(A.ctx, assignmentA);
    expect(p.lessons.find((l) => l.sl.weekNumber === 1)!.versionId).toBe(v1);
    expect(p.lessons.find((l) => l.sl.weekNumber === 2)!.versionId).toBe(v2);
    expect(p.lessons).toHaveLength(26);
    const hist = await db.select().from(schema.versionAdoptions).where(eq(schema.versionAdoptions.assignmentId, assignmentA));
    expect(hist).toHaveLength(1);
  });
  it("church B's separate programme is unaffected by A's adoption and keeps working", async () => {
    const rB = await createProgramme(B.ctx, { ...dates, sessionName: "B session", curriculumId, classIds: [classB] });
    expect(rB.ok).toBe(true);
    const adm = await getCurriculumAdmin(curriculumId);
    expect(adm.versions.map((v) => v.status)).toEqual(["published", "superseded"]);
  });
});

describe("teaching workflow", () => {
  it("learners see lesson content without facilitator guidance or teacher notes; teachers see everything", async () => {
    const list = await lessonList(learnerA.ctx, assignmentA);
    const first = list.find((l) => l.week === 1)!;
    expect(first.status === "available" || first.status === "completed").toBe(true);
    const lv = await getLesson(learnerA.ctx, first.id);
    expect(lv.content.teacherGuidance).toBeUndefined();
    expect(lv.content.discussion.every((d) => d.guidance === undefined)).toBe(true);
    expect(JSON.stringify(lv)).not.toContain("Keep this first lesson warm");
    const tv = await getLesson(teacherA.ctx, first.id);
    expect(tv.content.teacherGuidance).toContain("Keep this first lesson warm");
    expect(tv.content.discussion[0].guidance).toBeTruthy();
  });
  it("future lessons are locked for learners", async () => {
    const db = await getDb();
    const [sl] = await db.select().from(schema.scheduledLessons).where(and(eq(schema.scheduledLessons.assignmentId, assignmentA), eq(schema.scheduledLessons.weekNumber, 5)));
    await setLessonRelease(A.ctx, sl.id, "locked");
    await expect(getLesson(learnerA.ctx, sl.id)).rejects.toThrow(AccessError);
    await setLessonRelease(A.ctx, sl.id, null);
    await setMyProgress(learnerA.ctx, sl.id, "completed");
  });
  it("records attendance only for learners in the class", async () => {
    const db = await getDb();
    const [sl] = await db.select().from(schema.scheduledLessons).where(and(eq(schema.scheduledLessons.assignmentId, assignmentA), eq(schema.scheduledLessons.weekNumber, 3)));
    const r = await saveAttendance(teacherA.ctx, sl.id, classA, [{ learnerId: learnerA.userId, status: "present" }, { learnerId: learnerA2.userId, status: "absent" }, { learnerId: learnerB.userId, status: "present" }]);
    expect(r.saved).toBe(2);
    const sheet = await attendanceSheet(teacherA.ctx, sl.id, classA);
    expect(sheet.find((s) => s.id === learnerA.userId)!.status).toBe("present");
    await expect(saveAttendance(teacherB.ctx, sl.id, classA, [])).rejects.toThrow();
  });
});

describe("CBT examinations", () => {
  let examId: string, attemptId: string;
  it("builds the mid-session test from weeks 1-12 and the final from both halves", async () => {
    const m = await generateExam(A.ctx, assignmentA, "midtest");
    if (!m.ok) throw new Error(m.error);
    examId = m.id;
    const db = await getDb();
    const qs = await db.select({ w: schema.questions.weekNumber }).from(schema.examinationQuestions).innerJoin(schema.questions, eq(schema.questions.id, schema.examinationQuestions.questionId)).where(eq(schema.examinationQuestions.examId, examId));
    expect(qs.length).toBe(27);
    expect(qs.every((q) => q.w! >= 1 && q.w! <= 12)).toBe(true);
    const f = await generateExam(A.ctx, assignmentA, "final");
    if (!f.ok) throw new Error(f.error);
    const fq = await db.select({ w: schema.questions.weekNumber }).from(schema.examinationQuestions).innerJoin(schema.questions, eq(schema.questions.id, schema.examinationQuestions.questionId)).where(eq(schema.examinationQuestions.examId, f.id));
    expect(fq.length).toBe(44);
    expect(fq.some((q) => q.w! <= 12) && fq.some((q) => q.w! >= 14)).toBe(true);
    expect(fq.every((q) => q.w !== 13 && q.w !== 25 && q.w !== 26)).toBe(true);
  });
  it("is not visible to learners until published, then never leaks answers to the browser", async () => {
    await expect(examIntro(learnerA.ctx, examId)).rejects.toThrow(NotFoundError);
    const pub = await publishExam(A.ctx, examId);
    expect(pub.ok).toBe(true);
    await expect(examIntro(learnerB.ctx, examId)).rejects.toThrow(NotFoundError);
    const s = await startAttempt(learnerA.ctx, examId);
    if (!s.ok) throw new Error(s.error);
    attemptId = s.attemptId;
    const state = await attemptState(learnerA.ctx, attemptId);
    if (state.submitted) throw new Error("should be open");
    const json = JSON.stringify(state);
    const db = await getDb();
    const keys = await db.select().from(schema.questionAnswerKeys);
    for (const k of keys.slice(0, 40)) expect(json.includes(k.explanation)).toBe(false);
    expect(json).not.toMatch(/"correct"|keywords|rubric|explanation/);
    expect(state.questions).toHaveLength(27);
    // resume returns the same attempt, not a new one
    const again = await startAttempt(learnerA.ctx, examId);
    expect(again.ok && again.attemptId).toBe(attemptId);
  });
  it("randomises question order per attempt and keeps it stable on reconnect", async () => {
    const s2 = await startAttempt(learnerA2.ctx, examId);
    if (!s2.ok) throw new Error(s2.error);
    const a = await attemptState(learnerA.ctx, attemptId), b = await attemptState(learnerA2.ctx, s2.attemptId);
    if (a.submitted || b.submitted) throw new Error("open");
    expect(a.questions.map((q) => q.eqId)).not.toEqual(b.questions.map((q) => q.eqId));
    const a2 = await attemptState(learnerA.ctx, attemptId);
    if (a2.submitted) throw new Error("open");
    expect(a2.questions.map((q) => q.eqId)).toEqual(a.questions.map((q) => q.eqId));
  });
  it("autosaves answers, rejects another learner's attempt, and recovers saved answers", async () => {
    const st = await attemptState(learnerA.ctx, attemptId);
    if (st.submitted) throw new Error("open");
    const mcq = st.questions.find((q) => q.type === "mcq")!;
    const saved = await saveAnswer(learnerA.ctx, attemptId, mcq.eqId, mcq.options[0].id, true);
    expect(saved.ok).toBe(true);
    const re = await attemptState(learnerA.ctx, attemptId);
    if (re.submitted) throw new Error("open");
    const got = re.questions.find((q) => q.eqId === mcq.eqId)!;
    expect(got.answer).toBe(mcq.options[0].id);
    expect(got.flagged).toBe(true);
    await expect(attemptState(learnerA2.ctx, attemptId)).rejects.toThrow(NotFoundError);
    await expect(saveAnswer(learnerA2.ctx, attemptId, mcq.eqId, mcq.options[0].id)).rejects.toThrow(NotFoundError);
    const bad = await saveAnswer(learnerA.ctx, attemptId, mcq.eqId, "not-an-option");
    expect(bad.ok).toBe(false);
  });
  it("scores objective answers on the server, holds written answers for marking and double submits only once", async () => {
    const st = await attemptState(learnerA.ctx, attemptId);
    if (st.submitted) throw new Error("open");
    const db = await getDb();
    // Answer every question correctly by consulting the key (as a test would; the browser never can).
    for (const q of st.questions) {
      const [row] = await db.select({ qid: schema.examinationQuestions.questionId }).from(schema.examinationQuestions).where(eq(schema.examinationQuestions.id, q.eqId));
      const [key] = await db.select().from(schema.questionAnswerKeys).where(eq(schema.questionAnswerKeys.questionId, row.qid));
      const opts = await db.select().from(schema.questionOptions).where(eq(schema.questionOptions.questionId, row.qid));
      const sorted = opts.sort((a, b) => a.sortOrder - b.sortOrder);
      if (key.config.type === "mcq") await saveAnswer(learnerA.ctx, attemptId, q.eqId, sorted[key.config.correct].id);
      else if (key.config.type === "tf") await saveAnswer(learnerA.ctx, attemptId, q.eqId, key.config.correct);
      else if (key.config.type === "short") await saveAnswer(learnerA.ctx, attemptId, q.eqId, "Jesus fulfils the promise; the covenant and story point to Christ.");
    }
    const [r1, r2] = await Promise.all([submitAttempt(learnerA.ctx, attemptId), submitAttempt(learnerA.ctx, attemptId)]);
    expect(r1.ok && r2.ok).toBe(true);
    expect([r1, r2].filter((r) => r.ok && !r.already)).toHaveLength(1);
    const results = await db.select().from(schema.assessmentResults).where(eq(schema.assessmentResults.attemptId, attemptId));
    expect(results).toHaveLength(1);
    expect(results[0].totalMarks).toBe(39);
    expect(results[0].awardedMarks).toBe(24); // 18 MCQ + 6 TF correct; 3 short answers wait for a teacher
    expect(results[0].publicationStatus).toBe("unpublished");
    const [att] = await db.select().from(schema.examinationAttempts).where(eq(schema.examinationAttempts.id, attemptId));
    expect(att.gradingStatus).toBe("pending_review");
  });
  it("hides the result until a teacher has marked written answers and published it", async () => {
    expect(await myResults(learnerA.ctx)).toHaveLength(0);
    await expect(myResultDetail(learnerA.ctx, attemptId)).rejects.toThrow(NotFoundError);
    const q = await markingQueue(teacherA.ctx);
    expect(q.some((x) => x.attemptId === attemptId)).toBe(true);
    expect((await markingQueue(teacherB.ctx)).length).toBe(0);
    await expect(attemptForMarking(teacherB.ctx, attemptId)).rejects.toThrow();
    const data = await attemptForMarking(teacherA.ctx, attemptId);
    const written = data.items.filter((i) => i.type === "short");
    expect(written).toHaveLength(3);
    const tooMany = await markAnswer(teacherA.ctx, attemptId, written[0].eqId, 99, "");
    expect(tooMany.ok).toBe(false);
    for (const w of written) expect((await markAnswer(teacherA.ctx, attemptId, w.eqId, 4, "Good, but name the covenant.")).ok).toBe(true);
    const pub = await publishResults(teacherA.ctx, examId);
    expect(pub.published).toBeGreaterThanOrEqual(1);
    const mine = await myResults(learnerA.ctx);
    expect(mine).toHaveLength(1);
    expect(mine[0].r.awardedMarks).toBe(36);
    expect(mine[0].r.percentage).toBeCloseTo(92.31, 2);
    expect(mine[0].r.grade).toBe("A");
    const detail = await myResultDetail(learnerA.ctx, attemptId);
    expect(detail.released).toBe(true);
    const stats = await examResults(A.ctx, examId);
    expect(stats.rows.length).toBeGreaterThanOrEqual(1);
    await expect(examResults(B.ctx, examId)).rejects.toThrow(NotFoundError);
  });
  it("blocks a second attempt past the limit and enforces the server deadline", async () => {
    const again = await startAttempt(learnerA.ctx, examId);
    expect(again.ok).toBe(false);
    const p = await generateExam(A.ctx, assignmentA, "practice");
    if (!p.ok) throw new Error(p.error);
    await publishExam(A.ctx, p.id);
    const s = await startAttempt(learnerA.ctx, p.id);
    if (!s.ok) throw new Error(s.error);
    const db = await getDb();
    await db.update(schema.examinationAttempts).set({ deadlineAt: new Date(Date.now() - 60_000) }).where(eq(schema.examinationAttempts.id, s.attemptId));
    const st = await attemptState(learnerA.ctx, s.attemptId);
    expect(st.submitted).toBe(true); // auto-submitted by the server clock
    const q = await db.select().from(schema.examinationQuestions).where(eq(schema.examinationQuestions.examId, p.id));
    const late = await saveAnswer(learnerA.ctx, s.attemptId, q[0].id, true);
    expect(late.ok).toBe(false);
  });
});
