import Link from "next/link";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { listAssignments } from "@/server/services/teaching";
import { Empty, PageHeader, StatusBadge, Table } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "Assignments" };
export const dynamic = "force-dynamic";

export default async function Assignments() {
  const { ctx, user } = await requireOrg("learn");
  const rows = await listAssignments(ctx);
  return (
    <>
      <PageHeader title="Assignments" sub="Work set by your teachers." />
      {rows.length === 0 ? <Empty title="No assignments yet">When your teacher sets work it appears here.</Empty> : (
        <Table caption="Assignments"><thead><tr><th>Assignment</th><th>Class</th><th>Due</th><th>Status</th><th>Marks</th></tr></thead><tbody>
          {rows.map((r) => (<tr key={r.a.id}><td><Link href={`/learn/assignments/${r.a.id}`} className="font-semibold">{r.a.title}</Link></td><td>{r.className}</td><td>{r.a.dueAt ? fmtDateTime(r.a.dueAt, user.timezone) : "No due date"}</td>
            <td><StatusBadge status={r.sub ? (r.sub.gradingStatus === "graded" ? "graded" : "submitted") : "pending"} /></td><td>{r.sub?.gradingStatus === "graded" ? `${r.sub.awardedMarks} / ${r.a.totalMarks}` : "–"}</td></tr>))}
        </tbody></Table>
      )}
    </>
  );
}
