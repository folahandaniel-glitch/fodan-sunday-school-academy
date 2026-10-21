import Link from "next/link";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { myExams } from "@/server/services/exams";
import { Empty, PageHeader, StatusBadge, Table } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "Tests and examinations" };
export const dynamic = "force-dynamic";

export default async function Exams() {
  const { ctx, user } = await requireOrg("learn");
  const rows = await myExams(ctx);
  return (
    <>
      <PageHeader title="Tests and examinations" sub="Timed computer-based tests. Your answers are saved to the server as you go." />
      {rows.length === 0 ? <Empty title="Nothing scheduled">Your mid-session test (week 13) and final examination (week 25) appear here once your teacher publishes them.</Empty> : (
        <Table caption="Tests"><thead><tr><th>Title</th><th>Opens</th><th>Closes</th><th>Duration</th><th>Attempts</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>
          {rows.map((r) => (<tr key={r.exam.id}><td className="font-semibold">{r.exam.title}</td><td>{r.exam.opensAt ? fmtDateTime(r.exam.opensAt, user.timezone) : "Now"}</td><td>{r.exam.closesAt ? fmtDateTime(r.exam.closesAt, user.timezone) : "No close time"}</td><td>{Math.round(r.exam.durationSeconds / 60)} min</td><td>{r.attemptsUsed} / {r.exam.attemptLimit}</td><td><StatusBadge status={r.inProgress ? "in_progress" : r.state} /></td><td><Link className="btn btn-light btn-sm" href={`/learn/exams/${r.exam.id}`}>{r.inProgress ? "Resume" : "Open"}</Link></td></tr>))}
        </tbody></Table>
      )}
    </>
  );
}
