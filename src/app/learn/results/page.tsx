import Link from "next/link";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { myResults } from "@/server/services/exams";
import { Badge, Empty, PageHeader, StatusBadge, Table } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "My results" };
export const dynamic = "force-dynamic";

export default async function Results() {
  const { ctx, user } = await requireOrg("learn");
  const rows = await myResults(ctx);
  return (
    <>
      <PageHeader title="My results" sub="Only results your teacher or church has released are shown here." />
      {rows.length === 0 ? <Empty title="No released results yet">Results appear after your teacher has marked written answers and released them.</Empty> : (
        <Table caption="Results"><thead><tr><th>Test</th><th>Attempt</th><th>Date</th><th>Score</th><th>Percentage</th><th>Grade</th><th>Outcome</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>
          {rows.map((r) => (<tr key={r.r.id}><td className="font-semibold">{r.exam}</td><td>{r.attemptNumber}</td><td>{fmtDateTime(r.submittedAt, user.timezone)}</td><td>{r.r.awardedMarks} / {r.r.totalMarks}</td><td>{r.r.percentage.toFixed(1)}%</td><td><Badge tone="info">{r.r.grade}</Badge></td><td><StatusBadge status={r.r.passStatus} /></td><td><Link href={`/learn/results/${r.r.attemptId}`} className="btn btn-light btn-sm">Details</Link></td></tr>))}
        </tbody></Table>
      )}
    </>
  );
}
