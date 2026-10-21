import Link from "next/link";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { churchOverview } from "@/server/services/reports";
import { listClasses, listAnnouncements } from "@/server/services/church";
import { markingQueue } from "@/server/services/exams";
import { Alert, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { fmtDate } from "@/lib/text";

export const metadata: Metadata = { title: "Teacher overview" };
export const dynamic = "force-dynamic";

export default async function TeachHome() {
  const { ctx } = await requireOrg("classes.view");
  const [o, classes, queue, notes] = await Promise.all([churchOverview(ctx), listClasses(ctx), markingQueue(ctx), listAnnouncements(ctx, 3)]);
  return (
    <>
      <PageHeader title={`Welcome, ${ctx.userName.split(" ")[0]}`} sub={ctx.orgName} />
      {notes.map((n) => <div key={n.id} className="mb-3"><Alert tone="info"><strong>{n.title}.</strong> {n.body}</Alert></div>)}
      <div className="grid gap-4 sm:grid-cols-4"><Stat label="My classes" value={classes.length} href="/teach/classes" /><Stat label="Learners" value={classes.reduce((n, c) => n + c.learners, 0)} /><Stat label="Answers to mark" value={queue.length} href="/teach/grading" /><Stat label="Attendance" value={o.attendancePercent === null ? "–" : `${o.attendancePercent}%`} /></div>
      <Card className="mt-6"><h2 className="text-lg">Upcoming lessons</h2>
        {o.upcoming.length === 0 ? <div className="mt-3"><Empty title="Nothing scheduled">When a programme is active for your class, upcoming lessons appear here.</Empty></div> : <ul className="mt-2 divide-y divide-line">{o.upcoming.map((u) => <li key={u.id} className="flex items-center justify-between gap-2 py-2"><span><strong>Week {u.week}:</strong> {u.title} <span className="text-xs text-mist">· {fmtDate(u.date)}</span></span><Link className="btn btn-light btn-sm" href={`/teach/lessons/${u.id}`}>Open</Link></li>)}</ul>}</Card>
    </>
  );
}
