"use server";
import { redirect } from "next/navigation";
import { run, s, n, b, lines, type FormState } from "@/server/action-util";
import { requireOrg } from "@/server/guards";
import * as church from "@/server/services/church";
import * as teaching from "@/server/services/teaching";
import * as exams from "@/server/services/exams";
import * as sched from "@/server/services/schedule";
import * as cert from "@/server/services/certificates";
import * as billing from "@/server/services/billing";
import { audit } from "@/server/audit";
import type { OrgRole } from "@/server/db/schema";
import { toMinor } from "@/lib/money";

const fail = (error: string): FormState => ({ ok: false, error });

/* ---------- members ---------- */
export async function decideMemberAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("members.manage"); await church.decideMembership(ctx, s(fd, "id"), s(fd, "decision") === "reject" ? "reject" : "approve", (s(fd, "role") || undefined) as OrgRole | undefined); return { message: "Updated." }; });
}
export async function changeRoleAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("members.manage"); await church.changeMemberRole(ctx, s(fd, "id"), s(fd, "role") as OrgRole); return { message: "Role updated." }; });
}
export async function removeMemberAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("members.manage"); await church.removeMember(ctx, s(fd, "id")); return { message: "Member removed." }; });
}
export async function addMemberAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ctx } = await requireOrg("members.manage");
    const r = await church.addManagedMember(ctx, { fullName: s(fd, "fullName"), email: s(fd, "email"), username: s(fd, "username"), role: (s(fd, "role") || "learner") as "learner", isMinor: b(fd, "isMinor") });
    if (!r.ok) return fail(r.error);
    return { message: `Account created. Give this one-time temporary password to the person: ${r.temporaryPassword} (they must change it at first sign-in).` };
  });
}

/* ---------- classes ---------- */
export async function createClassAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("classes.manage"); const r = await church.createClass(ctx, { name: s(fd, "name"), description: s(fd, "description"), ageGroup: s(fd, "ageGroup") }); if (!r.ok) return fail(r.error); return { message: "Class created.", redirect: `/church/classes/${r.id}` }; });
}
export async function assignTeacherAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("classes.manage"); await church.assignTeacher(ctx, s(fd, "classId"), s(fd, "teacherId")); return { message: "Teacher assigned." }; });
}
export async function unassignTeacherAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("classes.manage"); await church.unassignTeacher(ctx, s(fd, "classId"), s(fd, "teacherId")); });
}
export async function enrolAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("classes.manage"); await church.enrolLearner(ctx, s(fd, "classId"), s(fd, "learnerId")); return { message: "Learner enrolled." }; });
}
export async function unenrolAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("classes.manage"); await church.unenrolLearner(ctx, s(fd, "classId"), s(fd, "learnerId")); });
}

/* ---------- church profile and settings ---------- */
export async function profileOrgAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ctx } = await requireOrg("org.profile.edit");
    await church.updateOrgProfile(ctx, { name: s(fd, "name"), type: s(fd, "type"), denomination: s(fd, "denomination"), country: s(fd, "country"), state: s(fd, "state"), city: s(fd, "city"), address: s(fd, "address"), contactEmail: s(fd, "contactEmail"), phone: s(fd, "phone"), timezone: s(fd, "timezone"), currency: s(fd, "currency") });
    return { message: "Church profile saved." };
  });
}
export async function settingsOrgAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ctx } = await requireOrg("org.settings");
    await church.updateOrgSettings(ctx, {
      teachingWeekday: n(fd, "teachingWeekday"), lessonOpenDaysBefore: Math.max(0, Math.min(7, n(fd, "lessonOpenDaysBefore", 1))), resultVisibility: s(fd, "resultVisibility") === "immediate" ? "immediate" : "after_publish",
      teachersPublishResults: b(fd, "teachersPublishResults"),
      certificate: { minAttendancePercent: n(fd, "minAttendance", 60), minLessonCompletionPercent: n(fd, "minCompletion", 70), requireFinalExam: b(fd, "requireFinalExam"), minScorePercent: n(fd, "minScore", 50) },
    });
    await church.setAutoApprove(ctx, b(fd, "autoApprove"));
    return { message: "Settings saved." };
  });
}
export async function newJoinCodeAction(_: FormState | null): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("org.settings"); const code = await church.regenerateJoinCode(ctx); return { message: `New join code: ${code}` }; });
}
export async function announceAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("announcements.manage"); const r = await church.createAnnouncement(ctx, s(fd, "title"), s(fd, "body")); if (!r.ok) return fail(r.error); return { message: "Announcement sent to every member." }; });
}

/* ---------- scheduling wizard ---------- */
export async function previewAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ctx } = await requireOrg("sessions.manage");
    const holidays = lines(fd, "holidays").map((l) => { const [date, ...d] = l.split(/[\s,]+/); return { date, description: d.join(" ") }; });
    const { proposal } = await sched.previewSchedule(ctx, {
      sessionName: s(fd, "sessionName") || "Session", year: n(fd, "year"), sessionType: s(fd, "sessionType") as "jan_jun", startDate: s(fd, "startDate"), endDate: s(fd, "endDate"), weekday: n(fd, "weekday"), curriculumId: s(fd, "curriculumId"),
      midtestWeek: n(fd, "midtestWeek", 13), finalWeek: n(fd, "finalWeek", 25), revisionWeek: n(fd, "revisionWeek", 26), shortfallPolicy: (s(fd, "shortfallPolicy") || "extend") as "extend", holidays,
    });
    return { data: { proposal } };
  });
}
export async function createProgrammeAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ctx } = await requireOrg("sessions.manage");
    const holidays = lines(fd, "holidays").map((l) => { const [date, ...d] = l.split(/[\s,]+/); return { date, description: d.join(" ") }; });
    const overrides: Record<number, string> = {};
    for (const [k, v] of fd.entries()) { const m = /^date_(\d+)$/.exec(k); if (m && typeof v === "string" && v) overrides[Number(m[1])] = v; }
    const r = await sched.createProgramme(ctx, {
      sessionName: s(fd, "sessionName"), year: n(fd, "year"), sessionType: s(fd, "sessionType") as "jan_jun", startDate: s(fd, "startDate"), endDate: s(fd, "endDate"), weekday: n(fd, "weekday"), curriculumId: s(fd, "curriculumId"),
      midtestWeek: n(fd, "midtestWeek", 13), finalWeek: n(fd, "finalWeek", 25), revisionWeek: n(fd, "revisionWeek", 26), shortfallPolicy: (s(fd, "shortfallPolicy") || "extend") as "extend", holidays,
      classIds: fd.getAll("classIds").map(String), dateOverrides: overrides, idempotencyKey: s(fd, "key") || undefined, activate: b(fd, "activate"),
    });
    if (!r.ok) return fail(r.error);
    return { message: "Programme created.", redirect: `/church/sessions/${r.assignmentId}` };
  });
}
export async function activateAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("sessions.manage"); await sched.activateProgramme(ctx, s(fd, "id")); return { message: "Programme activated. Learners and teachers have been notified." }; });
}
export async function rescheduleAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("sessions.manage"); const r = await sched.rescheduleLessons(ctx, s(fd, "id"), { fromSlot: n(fd, "slot"), anchorDate: s(fd, "date"), shiftFollowing: b(fd, "shift"), addExceptionDates: lines(fd, "skip"), reason: s(fd, "reason") }); if (!r.ok) return fail(r.error); return { message: `${r.moved} lesson date(s) updated. No lesson was removed.` }; });
}
export async function weeksAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("sessions.manage"); const r = await sched.updateAssessmentWeeks(ctx, s(fd, "id"), { midtestWeek: n(fd, "midtestWeek"), finalWeek: n(fd, "finalWeek"), revisionWeek: n(fd, "revisionWeek") }); if (!r.ok) return fail(r.error); return { message: "Assessment weeks updated." + (r.warnings.length ? " " + r.warnings.join(" ") : "") }; });
}
export async function releaseAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("sessions.manage"); const v = s(fd, "release"); await sched.setLessonRelease(ctx, s(fd, "id"), v === "open" || v === "locked" ? v : null); });
}
export async function adoptAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("sessions.manage"); const r = await sched.adoptNewVersion(ctx, s(fd, "id"), s(fd, "notes")); if (!r.ok) return fail(r.error); return { message: `Moved ${r.weeksMoved} upcoming lesson(s) to the newer version. Lessons already taught were not changed.` }; });
}
export async function cancelProgrammeAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("sessions.manage"); await sched.cancelProgramme(ctx, s(fd, "id")); return { redirect: "/church/sessions" }; });
}

/* ---------- teaching ---------- */
export async function deliveredAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("lessons.deliver"); await teaching.markDelivered(ctx, s(fd, "lessonId"), s(fd, "classId"), s(fd, "notes")); return { message: "Marked as delivered." }; });
}
export async function attendanceAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ctx } = await requireOrg("attendance.record");
    const recs = [...fd.entries()].filter(([k]) => k.startsWith("st_")).map(([k, v]) => ({ learnerId: k.slice(3), status: String(v) as "present", remarks: s(fd, `rm_${k.slice(3)}`) })).filter((r) => ["present", "absent", "late", "excused"].includes(r.status));
    const r = await teaching.saveAttendance(ctx, s(fd, "lessonId"), s(fd, "classId"), recs);
    return { message: `Attendance saved for ${r.saved} learner(s).` };
  });
}
export async function discussionAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("lessons.deliver"); const r = await teaching.startDiscussion(ctx, s(fd, "lessonId"), s(fd, "classId"), s(fd, "prompt")); if (!r.ok) return fail(r.error); return { message: "Discussion opened for the class." }; });
}
export async function moderateResponseAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("lessons.deliver"); await teaching.moderateResponse(ctx, s(fd, "id"), s(fd, "action") as "hide", s(fd, "reflection")); });
}
export async function createAssignmentAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ctx } = await requireOrg("assignments.manage");
    const r = await teaching.createAssignment(ctx, { classId: s(fd, "classId"), scheduledLessonId: s(fd, "lessonId") || undefined, title: s(fd, "title"), instructions: s(fd, "instructions"), dueAt: s(fd, "dueAt") || undefined, totalMarks: n(fd, "totalMarks", 10), publish: b(fd, "publish") });
    if (!r.ok) return fail(r.error);
    return { message: "Assignment saved.", redirect: `${s(fd, "base")}/assignments/${r.id}` };
  });
}
export async function publishAssignmentAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("assignments.manage"); await teaching.publishAssignment(ctx, s(fd, "id")); return { message: "Published to the class." }; });
}
export async function gradeSubmissionAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("grading.mark"); const r = await teaching.gradeSubmission(ctx, s(fd, "id"), n(fd, "marks"), s(fd, "feedback")); if (!r.ok) return fail(r.error); return { message: "Marked." }; });
}

/* ---------- examinations ---------- */
export async function generateExamAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ctx } = await requireOrg("exams.manage");
    const r = await exams.generateExam(ctx, s(fd, "assignmentId"), s(fd, "kind") as "midtest");
    if (!r.ok) return fail(r.error);
    return { message: r.selection.warnings.length ? r.selection.warnings.join(" ") : "Examination drafted from the approved question bank.", redirect: `${s(fd, "base")}/exams/${r.id}` };
  });
}
export async function updateExamAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ctx } = await requireOrg("exams.manage");
    const r = await exams.updateExam(ctx, s(fd, "id"), {
      title: s(fd, "title"), instructions: s(fd, "instructions"), durationMinutes: n(fd, "durationMinutes", 45), passPercent: n(fd, "passPercent", 50), attemptLimit: n(fd, "attemptLimit", 1),
      opensAt: s(fd, "opensAt") ? new Date(s(fd, "opensAt")).toISOString() : null, closesAt: s(fd, "closesAt") ? new Date(s(fd, "closesAt")).toISOString() : null,
      shuffleQuestions: b(fd, "shuffleQuestions"), shuffleOptions: b(fd, "shuffleOptions"), resultPolicy: s(fd, "resultPolicy") as "after_review", reviewPolicy: s(fd, "reviewPolicy") as "after_publish", latePolicy: s(fd, "latePolicy") as "reject", classIds: fd.getAll("classIds").map(String),
    });
    if (!r.ok) return fail(r.error);
    return { message: "Examination settings saved." };
  });
}
export async function publishExamAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("exams.manage"); const r = await exams.publishExam(ctx, s(fd, "id")); if (!r.ok) return fail(r.error); return { message: "Examination published. Learners have been notified." }; });
}
export async function closeExamAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("exams.manage"); await exams.closeExam(ctx, s(fd, "id")); return { message: "Examination closed." }; });
}
export async function removeExamQuestionAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("exams.manage"); const r = await exams.removeExamQuestion(ctx, s(fd, "id"), s(fd, "eqId")); if (!r.ok) return fail(r.error); });
}
export async function addExamQuestionAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("exams.manage"); const r = await exams.addExamQuestion(ctx, s(fd, "id"), s(fd, "questionId")); if (!r.ok) return fail(r.error); return { message: "Question added." }; });
}
export async function markAnswerAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("grading.mark"); const r = await exams.markAnswer(ctx, s(fd, "attemptId"), s(fd, "eqId"), n(fd, "marks"), s(fd, "feedback")); if (!r.ok) return fail(r.error); return { message: "Saved." }; });
}
export async function publishResultsAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("results.publish"); const r = await exams.publishResults(ctx, s(fd, "id")); return { message: `${r.published} result(s) released to learners.${r.withheld ? ` ${r.withheld} still waiting for written answers to be marked.` : ""}` }; });
}
export async function feedbackAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("grading.mark"); await exams.addResultFeedback(ctx, s(fd, "resultId"), s(fd, "content"), true); return { message: "Feedback saved and shown to the learner once the result is released." }; });
}

/* ---------- certificates ---------- */
export async function issueCertificatesAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("certificates.issue"); const r = await cert.issueAllEligible(ctx, s(fd, "id")); return { message: `${r.issued} certificate(s) issued. ${r.skipped} learner(s) do not yet meet the requirements or already have one.` }; });
}
export async function issueOneCertificateAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { ctx } = await requireOrg("certificates.issue"); const r = await cert.issueCertificate(ctx, s(fd, "id"), s(fd, "learnerId")); if (!r.ok) return fail(r.error); return { message: "Certificate issued." }; });
}

/* ---------- billing ---------- */
export async function checkoutAction(fd: FormData) {
  const { ctx, user } = await requireOrg("billing.manage");
  const r = await billing.startCheckout(ctx, String(fd.get("planId")), user.email ?? "billing@example.org");
  if (!r.ok) redirect(`/church/billing?error=${encodeURIComponent(r.error)}`);
  await audit({ id: user.id, label: user.fullName }, "billing.redirect_to_checkout", { type: "payment", id: r.reference }, {}, { orgId: ctx.orgId });
  redirect(r.url);
}
export { toMinor };
