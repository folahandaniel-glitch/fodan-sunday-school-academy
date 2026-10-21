import Link from "next/link";
import { ActionButton, ActionForm } from "@/components/forms";
import { createAssignmentAction, gradeSubmissionAction, publishAssignmentAction } from "@/app/actions/staff";
import { Card, Empty, PageHeader, StatusBadge, Table } from "@/components/ui";
import { listAssignments, submissionsFor } from "@/server/services/teaching";
import { listClasses } from "@/server/services/church";
import type { OrgCtx } from "@/server/org";
import { fmtDateTime } from "@/lib/text";

export async function AssignmentsIndex({ ctx, base }: { ctx: OrgCtx; base: string }) {
  const [rows, classes] = await Promise.all([listAssignments(ctx), listClasses(ctx)]);
  return (
    <>
      <PageHeader title="Assignments" sub="Set work for your classes and mark what learners submit." />
      {rows.length === 0 ? <Empty title="No assignments yet">Create one below, or from a lesson page.</Empty> : (
        <Table caption="Assignments"><thead><tr><th>Assignment</th><th>Class</th><th>Due</th><th>Status</th></tr></thead><tbody>
          {rows.map((r) => (<tr key={r.a.id}><td><Link className="font-semibold" href={`${base}/assignments/${r.a.id}`}>{r.a.title}</Link></td><td>{r.className}</td><td>{r.a.dueAt ? fmtDateTime(r.a.dueAt, ctx.timezone) : "None"}</td><td><StatusBadge status={r.a.status} /></td></tr>))}
        </tbody></Table>
      )}
      {classes.length > 0 && (
        <Card className="mt-6"><h2 className="text-lg">New assignment</h2>
          <ActionForm action={createAssignmentAction} submit="Create assignment" className="mt-2"><input type="hidden" name="base" value={base} />
            <div className="grid gap-3 sm:grid-cols-3"><div><label className="label" htmlFor="n-class">Class</label><select id="n-class" name="classId" className="input">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="sm:col-span-2"><label className="label" htmlFor="n-title">Title</label><input id="n-title" name="title" className="input" required minLength={3} /></div></div>
            <div><label className="label" htmlFor="n-ins">Instructions</label><textarea id="n-ins" name="instructions" className="input" rows={4} /></div>
            <div className="grid gap-3 sm:grid-cols-3"><div><label className="label" htmlFor="n-due">Due</label><input id="n-due" name="dueAt" type="datetime-local" className="input" /></div><div><label className="label" htmlFor="n-marks">Total marks</label><input id="n-marks" name="totalMarks" type="number" className="input" defaultValue={10} min={1} max={100} /></div><label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="publish" className="h-4 w-4" defaultChecked /> Publish now</label></div>
          </ActionForm></Card>
      )}
    </>
  );
}

export async function AssignmentDetail({ ctx, id, base }: { ctx: OrgCtx; id: string; base: string }) {
  const { assignment: a, submissions } = await submissionsFor(ctx, id);
  return (
    <>
      <PageHeader crumbs={[{ label: "Assignments", href: `${base}/assignments` }, { label: a.title }]} title={a.title} sub={`${a.totalMarks} marks${a.dueAt ? ` · due ${fmtDateTime(a.dueAt, ctx.timezone)}` : ""}`} actions={<><StatusBadge status={a.status} />{a.status === "draft" && <ActionButton action={publishAssignmentAction} fields={{ id: a.id }} label="Publish to class" tone="gold" />}</>} />
      <Card><h2 className="text-lg">Instructions</h2><p className="mt-2 whitespace-pre-line">{a.instructions}</p></Card>
      <h2 className="mb-2 mt-6 text-lg">Submissions ({submissions.length})</h2>
      {submissions.length === 0 && <Empty title="Nothing submitted yet" />}
      <div className="space-y-3">
        {submissions.map(({ s, name }) => (
          <Card key={s.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{name}</p><StatusBadge status={s.gradingStatus} /></div>
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-ivory p-3 text-sm">{s.content}</p>
            <ActionForm action={gradeSubmissionAction} submit={s.gradingStatus === "graded" ? "Update marks" : "Save marks"} className="mt-3"><input type="hidden" name="id" value={s.id} />
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr]"><div><label className="label" htmlFor={`m-${s.id}`}>Marks / {a.totalMarks}</label><input id={`m-${s.id}`} name="marks" type="number" min={0} max={a.totalMarks} step="1" className="input" required defaultValue={s.awardedMarks ?? ""} /></div><div><label className="label" htmlFor={`f-${s.id}`}>Feedback</label><input id={`f-${s.id}`} name="feedback" className="input" defaultValue={s.feedback ?? ""} maxLength={2000} /></div></div></ActionForm></Card>
        ))}
      </div>
    </>
  );
}
