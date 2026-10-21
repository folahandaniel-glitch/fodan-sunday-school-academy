import Link from "next/link";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { listProgrammes } from "@/server/services/schedule";
import { Empty, PageHeader, StatusBadge, Table } from "@/components/ui";
import { fmtDate } from "@/lib/text";
import { can } from "@/server/org";

export const metadata: Metadata = { title: "Academic sessions" };
export const dynamic = "force-dynamic";

export default async function Sessions() {
  const { ctx } = await requireOrg("classes.view");
  const rows = await listProgrammes(ctx);
  return (
    <>
      <PageHeader title="Academic sessions" sub="Each programme is one curriculum in one session (January to June or July to December), with its own schedule, attendance and results." actions={can(ctx, "sessions.manage") ? <Link className="btn btn-gold" href="/church/sessions/new">New programme</Link> : undefined} />
      {rows.length === 0 ? <Empty title="No programmes yet" action={<Link className="btn btn-primary" href="/church/library">Choose a curriculum</Link>}>Pick a curriculum from the library and the Academy will propose all 26 weekly dates.</Empty> : (
        <Table caption="Programmes"><thead><tr><th>Curriculum</th><th>Session</th><th>Dates</th><th>Version</th><th>Progress</th><th>Status</th></tr></thead><tbody>
          {rows.map((r) => (<tr key={r.a.id}><td><Link className="font-semibold" href={`/church/sessions/${r.a.id}`}>{r.title}</Link></td><td>{r.s.name}</td><td>{fmtDate(r.s.startDate)} – {fmtDate(r.s.endDate)}</td><td>v{r.versionNumber}{r.currentVersionId && r.currentVersionId !== r.a.versionId && r.a.status !== "cancelled" && <span className="badge badge-info ml-1">newer available</span>}</td><td>{r.delivered} / 26 delivered</td><td><StatusBadge status={r.a.status} /></td></tr>))}
        </tbody></Table>
      )}
    </>
  );
}
