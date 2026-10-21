import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { auditPage } from "@/server/services/admin";
import { PageHeader, Pagination, Table } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "Audit logs" };
export const dynamic = "force-dynamic";

export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requirePlatform("audit.view");
  const sp = await searchParams;
  const d = await auditPage({ q: sp.q?.slice(0, 60), page: Math.max(1, Number(sp.page) || 1) });
  return (
    <>
      <PageHeader title="Audit logs" sub="Privileged changes and security events. Secrets and answers are never recorded." />
      <form className="mb-4 flex gap-2" role="search"><label className="sr-only" htmlFor="q">Filter by action</label><input id="q" name="q" defaultValue={sp.q} className="input !w-72" placeholder="e.g. curriculum, billing, auth" /><button className="btn btn-light">Filter</button></form>
      <Table caption="Audit log"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th><th>IP</th></tr></thead><tbody>
        {d.rows.map((a) => <tr key={a.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(a.createdAt)}</td><td>{a.actorLabel ?? "system"}<br /><span className="text-xs text-mist">{a.actorRole}</span></td><td className="font-mono text-xs">{a.action}</td><td className="text-xs">{a.targetType} {a.targetId?.slice(0, 8)}</td><td className="max-w-xs break-words text-xs text-mist">{Object.keys(a.meta).length ? JSON.stringify(a.meta).slice(0, 160) : ""}</td><td className="text-xs">{a.ip}</td></tr>)}
      </tbody></Table>
      <Pagination page={d.page} pageSize={d.pageSize} total={d.total} base="/admin/audit" params={{ q: sp.q }} />
    </>
  );
}
