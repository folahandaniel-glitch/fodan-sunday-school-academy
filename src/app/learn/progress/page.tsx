import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { learnerSummary, myAttendance } from "@/server/services/teaching";
import { myResults } from "@/server/services/exams";
import { Card, Empty, PageHeader, Progress, Stat } from "@/components/ui";
import { pct } from "@/lib/text";

export const metadata: Metadata = { title: "My progress" };
export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const { ctx } = await requireOrg("learn");
  const [sum, att, res] = await Promise.all([learnerSummary(ctx), myAttendance(ctx), myResults(ctx)]);
  const avg = res.length ? Math.round(res.reduce((a, r) => a + r.r.percentage, 0) / res.length) : null;
  return (
    <>
      <PageHeader title="My progress" sub="How you are doing across your programme." />
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Lessons completed" value={sum.reduce((n, s) => n + s.completed, 0)} /><Stat label="Attendance" value={att.percent === null ? "–" : `${att.percent}%`} /><Stat label="Average test score" value={avg === null ? "–" : `${avg}%`} sub={`${res.length} released result(s)`} /></div>
      {sum.length === 0 ? <div className="mt-6"><Empty title="No programme yet" /></div> : sum.map((s) => (
        <Card key={s.programme.id} className="mt-6"><h2 className="text-lg">{s.programme.title}</h2><div className="mt-3"><Progress value={pct(s.completed, 26)} label="Lessons completed" /><p className="mt-1 text-xs text-mist">{s.completed} of 26 lessons completed</p></div>
          <ol className="mt-4 grid grid-cols-13 gap-1 sm:grid-cols-[repeat(13,minmax(0,1fr))]">{s.lessons.map((l) => <li key={l.id} title={`Week ${l.week}: ${l.title}`} className={`flex h-8 items-center justify-center rounded text-xs font-semibold ${l.myCompleted ? "bg-leaf text-white" : l.status === "available" || l.status === "in_progress" ? "bg-gold text-navy" : "bg-gray-100 text-mist"}`}>{l.week}</li>)}</ol>
          <p className="mt-2 text-xs text-mist">Green: completed. Gold: open now. Grey: not yet open.</p></Card>
      ))}
    </>
  );
}
