"use server";
import { redirect } from "next/navigation";
import { run, s, type FormState } from "@/server/action-util";
import { requireOrg } from "@/server/guards";
import { respondToDiscussion, setMyProgress, submitAssignment } from "@/server/services/teaching";
import { startAttempt } from "@/server/services/exams";

export async function progressAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ctx } = await requireOrg("learn");
    await setMyProgress(ctx, s(fd, "lessonId"), s(fd, "status") === "in_progress" ? "in_progress" : "completed");
    return { message: "Saved. Well done!" };
  });
}
export async function respondAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ctx } = await requireOrg("learn");
    const r = await respondToDiscussion(ctx, s(fd, "discussionId"), s(fd, "content"));
    if (!r.ok) return { ok: false, error: r.error } as FormState;
    return { message: "Your response was posted." };
  });
}
export async function submitAssignmentAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ctx } = await requireOrg("learn");
    const r = await submitAssignment(ctx, s(fd, "assignmentId"), s(fd, "content"));
    if (!r.ok) return { ok: false, error: r.error } as FormState;
    return { message: "Your work was submitted." };
  });
}
export async function startExamAction(fd: FormData) {
  const { ctx } = await requireOrg("learn");
  const r = await startAttempt(ctx, String(fd.get("examId") ?? ""));
  if (!r.ok) redirect(`/learn/exams/${String(fd.get("examId"))}?error=${encodeURIComponent(r.error)}`);
  redirect(`/learn/exams/attempt/${r.attemptId}`);
}
