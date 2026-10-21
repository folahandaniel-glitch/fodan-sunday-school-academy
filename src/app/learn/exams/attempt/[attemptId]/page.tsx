import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { attemptState } from "@/server/services/exams";
import { NotFoundError } from "@/server/org";
import { ExamRunner } from "@/components/exam-runner";

export const metadata: Metadata = { title: "Examination", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Attempt({ params }: { params: Promise<{ attemptId: string }> }) {
  const { ctx } = await requireOrg("learn");
  let s;
  try { s = await attemptState(ctx, (await params).attemptId); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  if (s.submitted) redirect(`/learn/exams/${s.examId}?submitted=1`);
  return <ExamRunner attemptId={s.attemptId} examId={s.examId} examTitle={s.examTitle} attemptNumber={s.attemptNumber} serverNow={s.serverNow} deadlineAt={s.deadlineAt} questions={s.questions} />;
}
