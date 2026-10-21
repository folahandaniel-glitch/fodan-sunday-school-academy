import Link from "next/link";
import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { listChurches } from "@/server/services/admin";
import { Empty, PageHeader, Pagination, StatusBadge, Table, Tabs } from "@/components/ui";
import { fmtDate } from "@/lib/text";

export const metadata: Metadata = { title: "Churches" };
export const dynamic = "force-dynamic";

export default async function Churches({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requirePlatform("churches.view");
  const sp = await searchParams;
  const d = await listChurches({ q: sp.q?.slice(0, 80), status: sp.status, page: Math.max(1, Number(sp.page) || 1) });
  const cur = sp.status ?? "all";
  return (
    <>
      <PageHeader title="Church management" sub="Every church works in its own private workspace." />
      <Tabs current={cur} items={[{ key: "all", label: "All", href: "/admin/churches" }, { key: "active", label: "Active", href: "/admin/churches?status=active" }, { key: "pending", label: "Awaiting approval", href: "/admin/churches?status=pending" }, { key: "unverified", label: "Unverified (typed by members)", href: "/admin/churches?status=unverified" }, { key: "suspended", label: "Suspended", href: "/admin/churches?status=suspended" }]} />
      <form className="mb-4 flex gap-2" role="search"><input type="hidden" name="status" value={sp.status ?? ""} /><label className="sr-only" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q} className="input !w-72" placeholder="Search name, town or email" /><button className="btn btn-light">Search</button></form>
      {d.rows.length === 0 ? <Empty title="No churches match" /> : (
        <Table caption="Churches"><thead><tr><th>Church</th><th>Location</th><th>Members</th><th>Plan</th><th>Registered</th><th>Status</th></tr></thead><tbody>
          {d.rows.map(({ o, members, pending, plan }) => (<tr key={o.id}><td><Link className="font-semibold" href={`/admin/churches/${o.id}`}>{o.name}</Link></td><td>{[o.city, o.state, o.country].filter(Boolean).join(", ")}</td><td>{members}{pending > 0 && <span className="badge badge-warn ml-1">{pending} pending</span>}</td><td>{plan ?? "Free"}</td><td>{fmtDate(o.createdAt)}</td><td><StatusBadge status={o.status} /></td></tr>))}
        </tbody></Table>
      )}
      <Pagination page={d.page} pageSize={d.pageSize} total={d.total} base="/admin/churches" params={{ q: sp.q, status: sp.status }} />
    </>
  );
}
