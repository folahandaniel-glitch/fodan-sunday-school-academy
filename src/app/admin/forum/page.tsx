import Link from "next/link";
import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { openReports } from "@/server/services/forum";
import { ActionButton } from "@/components/forms";
import { resolveReportAction } from "@/app/actions/forum";
import { Empty, PageHeader, Table } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "Forum moderation" };
export const dynamic = "force-dynamic";

export default async function ForumAdmin() {
  const user = await requirePlatform("forum.moderate");
  const rows = await openReports(user);
  return (
    <>
      <PageHeader title="Forum moderation" sub="Reported posts. Hide content from the thread page, then mark the report handled." />
      {rows.length === 0 ? <Empty title="No open reports" /> : (
        <Table caption="Reports"><thead><tr><th>When</th><th>Reporter</th><th>Reason</th><th>Content</th><th /></tr></thead><tbody>
          {rows.map(({ r, reporter }) => (<tr key={r.id}><td className="text-xs">{fmtDateTime(r.createdAt)}</td><td>{reporter}</td><td>{r.reason}</td><td>{r.threadId ? <Link href={`/forum/thread/${r.threadId}`}>Open thread</Link> : <span className="text-xs text-mist">post {r.postId?.slice(0, 8)}</span>}</td><td className="flex gap-1"><ActionButton action={resolveReportAction} fields={{ id: r.id, status: "actioned" }} label="Handled" /><ActionButton action={resolveReportAction} fields={{ id: r.id, status: "dismissed" }} label="Dismiss" /></td></tr>))}
        </tbody></Table>
      )}
    </>
  );
}
