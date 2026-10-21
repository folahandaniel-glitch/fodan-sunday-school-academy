import Link from "next/link";
import { Alert, Card, Empty, PageHeader, Progress, Stat, Table } from "@/components/ui";
import { churchReport } from "@/server/services/reports";
import { listClasses } from "@/server/services/church";
import type { OrgCtx } from "@/server/org";
import { fmtDate } from "@/lib/text";

export async function ReportsView({ ctx, base, sp }: { ctx: OrgCtx; base: string; sp: { classId?: string; from?: string; to?: string } }) {
  const [rep, classes] = await Promise.all([churchReport(ctx, sp), listClasses(ctx)]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader title="Reports" sub="Attendance, lesson completion, assignments and assessment results for your learners." actions={<Link className="btn btn-light btn-sm" href={`/api/export/report?${qs}`}>Download CSV</Link>} />
      <form className="card card-pad mb-6 grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto]" role="search" aria-label="Report filters">
        <div><label className="label" htmlFor="classId">Class</label><select id="classId" name="classId" className="input" defaultValue={sp.classId ?? ""}><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" className="input" defaultValue={sp.from} /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" className="input" defaultValue={sp.to} /></div>
        <div className="flex items-end"><button className="btn btn-primary w-full">Apply</button></div>
      </form>
      <div className="grid gap-4 sm:grid-cols-4"><Stat label="Learners" value={rep.learners.length} /><Stat label="Learners needing support" value={rep.support.length} /><Stat label="Average exam score" value={rep.averageScore === null ? "–" : `${rep.averageScore}%`} /><Stat label="Pass rate" value={rep.passRate === null ? "–" : `${rep.passRate}%`} /></div>
      {rep.learners.length === 0 ? <div className="mt-6"><Empty title="No learners in scope">Enrol learners in a class to see their records here.</Empty></div> : (
        <>
          {rep.support.length > 0 && <div className="mt-6"><Alert tone="warn"><strong>May need extra support:</strong> {rep.support.map((l) => l.name).join(", ")}. Flagged for low attendance (under 50%), low exam average (under 40%) or low lesson completion.</Alert></div>}
          <h2 className="mb-2 mt-6 text-lg">Learner records</h2>
          <Table caption="Learner records"><thead><tr><th>Learner</th><th>Class</th><th>Attendance</th><th>Lessons</th><th>Assignments</th><th>Exams</th></tr></thead><tbody>
            {rep.learners.map((l) => (<tr key={l.id}><td className="font-semibold">{l.name}{l.support && <span className="badge badge-warn ml-2">support</span>}</td><td>{l.classes}</td><td>{l.attendance === null ? "–" : `${l.attendance}%`} <span className="text-xs text-mist">({l.sessions})</span></td><td>{l.lessonsCompleted}/{l.lessonsTaught}</td><td>{l.assignmentsDone}/{l.assignmentsTotal}</td><td>{l.examAverage === null ? "–" : `${l.examAverage}%`} <span className="text-xs text-mist">({l.examsTaken})</span></td></tr>))}
          </tbody></Table>
          <Card className="mt-6"><h2 className="text-lg">Attendance by date</h2>
            {rep.attendanceByDate.length === 0 ? <p className="mt-2 text-sm text-mist">No attendance recorded in this period.</p> : <ul className="mt-3 space-y-2">{rep.attendanceByDate.map((d) => <li key={d.date}><div className="flex justify-between text-sm"><span>{fmtDate(d.date)}</span><span>{d.present} of {d.total} ({d.percent}%)</span></div><Progress value={d.percent} label={`Attendance on ${d.date}`} /></li>)}</ul>}</Card>
          {!rep.advanced && <p className="mt-4 text-xs text-mist">Advanced reports (topic-level analysis and trends) are included in higher plans.</p>}
        </>
      )}
      <p className="mt-2 text-xs text-mist"><Link href={base}>Back</Link></p>
    </>
  );
}
