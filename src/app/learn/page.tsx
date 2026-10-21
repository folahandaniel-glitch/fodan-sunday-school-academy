import Link from "next/link";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { learnerSummary, listAssignments, myAttendance } from "@/server/services/teaching";
import { myExams } from "@/server/services/exams";
import { listAnnouncements } from "@/server/services/church";
import { Alert, Badge, Card, Empty, PageHeader, Progress, Stat, StatusBadge } from "@/components/ui";
import { fmtDate } from "@/lib/text";
import { pct } from "@/lib/text";

export const metadata: Metadata = { title: "My dashboard" };
export const dynamic = "force-dynamic";

export default async function LearnHome() {
  const { ctx } = await requireOrg("learn");
  const [summary, exams, assignments, att, notes] = await Promise.all([learnerSummary(ctx), myExams(ctx), listAssignments(ctx), myAttendance(ctx), listAnnouncements(ctx, 3)]);
  const open = exams.filter((e) => e.state === "open" && (!e.result || e.exam.attemptLimit > e.attemptsUsed));
  const todo = assignments.filter((a) => !a.sub);
  return (
    <>
      <PageHeader title={`Welcome, ${ctx.userName.split(" ")[0]}`} sub={ctx.orgName} />
      {notes.map((n) => <div key={n.id} className="mb-3"><Alert tone="info"><strong>{n.title}.</strong> {n.body}</Alert></div>)}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Programmes" value={summary.length} href="/learn/curriculum" />
        <Stat label="Lessons completed" value={summary.reduce((n, s) => n + s.completed, 0)} href="/learn/progress" />
        <Stat label="Attendance" value={att.percent === null ? "–" : `${att.percent}%`} sub={att.total ? `${att.present} of ${att.total} sessions` : "No sessions recorded yet"} />
        <Stat label="Assignments to do" value={todo.length} href="/learn/assignments" />
      </div>
      {summary.length === 0 ? (
        <div className="mt-6"><Empty title="No active programme yet">Your church has not placed you in a class that is studying a curriculum. Ask your teacher or church administrator.</Empty></div>
      ) : summary.map((s) => (
        <Card key={s.programme.id} className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl">{s.programme.title}</h2><p className="text-sm text-mist">{s.programme.session} · {fmtDate(s.programme.start)} to {fmtDate(s.programme.end)}</p></div>
            <Link className="btn btn-light btn-sm" href={`/learn/lessons?programme=${s.programme.id}`}>All lessons</Link>
          </div>
          <div className="mt-3"><Progress value={pct(s.completed, 26)} label="Lessons completed" /><p className="mt-1 text-xs text-mist">{s.completed} of 26 lessons completed</p></div>
          {s.next && (
            <div className="mt-4 rounded-xl bg-ivory p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">{s.next.status === "scheduled" ? "Coming up" : "Next lesson"}</p>
              <p className="mt-1 font-display text-lg text-navy">Week {s.next.week}: {s.next.title}</p><p className="text-sm text-mist">{s.next.date ? fmtDate(s.next.date) : ""} <StatusBadge status={s.next.status} /></p>
              {s.next.status !== "scheduled" && <Link className="btn btn-primary btn-sm mt-3" href={`/learn/lessons/${s.next.id}`}>Open lesson</Link>}
            </div>
          )}
        </Card>
      ))}
      {open.length > 0 && (
        <Card className="mt-6"><h2 className="text-lg">Tests and examinations open now</h2>
          <ul className="mt-2 divide-y divide-line">{open.map((e) => <li key={e.exam.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><strong>{e.exam.title}</strong> <Badge tone="warn">{Math.round(e.exam.durationSeconds / 60)} min</Badge></span><Link className="btn btn-gold btn-sm" href={`/learn/exams/${e.exam.id}`}>{e.inProgress ? "Resume" : "View"}</Link></li>)}</ul></Card>
      )}
    </>
  );
}
