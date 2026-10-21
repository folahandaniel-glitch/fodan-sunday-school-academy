import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { examIntro } from "@/server/services/exams";
import { NotFoundError } from "@/server/org";
import { startExamAction } from "@/app/actions/learn";
import { SubmitButton } from "@/components/forms";
import { Alert, Card, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "Examination instructions" };
export const dynamic = "force-dynamic";

export default async function ExamIntro({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; submitted?: string }> }) {
  const { ctx, user } = await requireOrg("learn");
  const sp = await searchParams;
  let d;
  try { d = await examIntro(ctx, (await params).id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const e = d.exam;
  const open = d.attempts.find((a) => a.status === "in_progress");
  const used = d.attempts.length;
  const can = d.state === "open" && (open || used < e.attemptLimit);
  return (
    <>
      <PageHeader crumbs={[{ label: "Tests and examinations", href: "/learn/exams" }, { label: e.title }]} title={e.title} />
      {sp.submitted && <div className="mb-4"><Alert tone="ok">Your attempt was submitted. Your result will appear in My Results when your teacher releases it.</Alert></div>}
      {sp.error && <div className="mb-4"><Alert tone="error">{sp.error}</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card><h2 className="text-lg">Instructions</h2><p className="mt-2 whitespace-pre-line">{e.instructions}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm"><li>The timer is controlled by the server. If you lose your connection, reconnect and carry on: your saved answers and remaining time are restored.</li><li>Use <kbd>←</kbd> and <kbd>→</kbd> to move between questions, and <kbd>1</kbd> to <kbd>4</kbd> to choose an option.</li><li>Mark questions for review and return to them before you submit.</li><li>When time runs out your attempt is submitted automatically with the answers saved so far.</li></ul>
        </Card>
        <Card><h2 className="text-lg">Details</h2>
          <dl className="mt-2 space-y-2 text-sm"><div className="flex justify-between"><dt className="text-mist">Questions</dt><dd className="font-semibold">{d.questionCount}</dd></div><div className="flex justify-between"><dt className="text-mist">Total marks</dt><dd className="font-semibold">{e.totalMarks}</dd></div><div className="flex justify-between"><dt className="text-mist">Duration</dt><dd className="font-semibold">{Math.round(e.durationSeconds / 60)} minutes</dd></div><div className="flex justify-between"><dt className="text-mist">Pass mark</dt><dd className="font-semibold">{e.passPercent}%</dd></div><div className="flex justify-between"><dt className="text-mist">Attempts used</dt><dd className="font-semibold">{used} of {e.attemptLimit}</dd></div>
            {e.opensAt && <div className="flex justify-between"><dt className="text-mist">Opens</dt><dd>{fmtDateTime(e.opensAt, user.timezone)}</dd></div>}{e.closesAt && <div className="flex justify-between"><dt className="text-mist">Closes</dt><dd>{fmtDateTime(e.closesAt, user.timezone)}</dd></div>}</dl>
          <p className="mt-3"><StatusBadge status={d.state} /></p>
          {can ? <form action={startExamAction} className="mt-4"><input type="hidden" name="examId" value={e.id} /><SubmitButton className="w-full btn-gold">{open ? "Resume examination" : "Start examination"}</SubmitButton></form> : <p className="mt-4 text-sm text-mist">{d.state === "upcoming" ? "This examination has not opened yet." : d.state === "closed" ? "This examination is closed." : "You have used all your attempts."}</p>}
          {used > 0 && <p className="mt-3 text-sm"><Link href="/learn/results">See my results</Link></p>}
        </Card>
      </div>
    </>
  );
}
