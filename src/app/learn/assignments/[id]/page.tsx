import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { getAssignmentForLearner } from "@/server/services/teaching";
import { NotFoundError } from "@/server/org";
import { ActionForm } from "@/components/forms";
import { submitAssignmentAction } from "@/app/actions/learn";
import { Alert, Card, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "Assignment" };
export const dynamic = "force-dynamic";

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx, user } = await requireOrg("learn");
  let d;
  try { d = await getAssignmentForLearner(ctx, (await params).id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const { assignment: a, submission: s } = d;
  const locked = s?.gradingStatus === "graded";
  return (
    <>
      <PageHeader crumbs={[{ label: "Assignments", href: "/learn/assignments" }, { label: a.title }]} title={a.title} sub={`${a.totalMarks} marks${a.dueAt ? ` · due ${fmtDateTime(a.dueAt, user.timezone)}` : ""}`} />
      <Card><h2 className="text-lg">Instructions</h2><p className="mt-2 whitespace-pre-line">{a.instructions || "No further instructions."}</p></Card>
      {locked && <div className="mt-4"><Alert tone="ok"><strong>Marked: {s!.awardedMarks} / {a.totalMarks}.</strong> {s!.feedback}</Alert></div>}
      <Card className="mt-4"><h2 className="text-lg">Your answer</h2>
        {locked ? <p className="mt-2 whitespace-pre-line">{s!.content}</p> : (
          <ActionForm action={submitAssignmentAction} submit={s ? "Update my answer" : "Submit"} className="mt-2">
            <input type="hidden" name="assignmentId" value={a.id} />
            <textarea name="content" className="input" rows={10} required minLength={5} maxLength={10000} defaultValue={s?.content ?? ""} aria-label="Your answer" />
            {s && <p className="hint">Submitted {fmtDateTime(s.submittedAt, user.timezone)}. You can update it until your teacher marks it.</p>}
          </ActionForm>
        )}
      </Card>
    </>
  );
}
