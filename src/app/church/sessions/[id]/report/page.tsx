import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { sessionReport } from "@/server/services/reports";
import { getProgramme } from "@/server/services/schedule";
import { PrintButton } from "@/components/forms";
import { PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate } from "@/lib/text";
import { NotFoundError } from "@/server/org";

export const metadata: Metadata = { title: "Session report" };
export const dynamic = "force-dynamic";

export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireOrg("reports.view");
  const id = (await params).id;
  let p, r;
  try { p = await getProgramme(ctx, id); r = await sessionReport(ctx, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  return (
    <>
      <PageHeader title={`${p.title}: session report`} sub={`${ctx.orgName} · ${p.s.name} · curriculum version ${p.versionNumber}`} actions={<PrintButton />} />
      <h2 className="mb-2 text-lg">Lessons</h2>
      <table className="table"><thead><tr><th>Week</th><th>Lesson</th><th>Date</th><th>Type</th><th>Status</th></tr></thead><tbody>{r.lessons.map((l) => <tr key={l.week}><td>{l.week}</td><td>{l.title}</td><td>{fmtDate(l.date)}</td><td>{l.type}</td><td><StatusBadge status={l.status} /></td></tr>)}</tbody></table>
      <h2 className="mb-2 mt-6 text-lg">Assessments</h2>
      {r.exams.length === 0 ? <p className="text-sm text-mist">No assessments yet.</p> : <table className="table"><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Results</th><th>Average</th><th>Passed</th></tr></thead><tbody>{r.exams.map((e) => <tr key={e.title}><td>{e.title}</td><td>{e.kind}</td><td><StatusBadge status={e.status} /></td><td>{e.n}</td><td>{e.avg === null ? "–" : `${Math.round(e.avg)}%`}</td><td>{e.pass}</td></tr>)}</tbody></table>}
    </>
  );
}
