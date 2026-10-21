import Link from "next/link";
import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { adminListCurricula, listCategories } from "@/server/services/curriculum";
import { Badge, Empty, PageHeader, Pagination, StatusBadge, Table } from "@/components/ui";

export const metadata: Metadata = { title: "Curriculum library" };
export const dynamic = "force-dynamic";

export default async function Curricula({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; category?: string; page?: string }> }) {
  await requirePlatform("curriculum.write");
  const sp = await searchParams;
  const [d, cats] = await Promise.all([adminListCurricula({ q: sp.q?.slice(0, 80), status: sp.status, category: sp.category, page: Math.max(1, Number(sp.page) || 1), pageSize: 50 }), listCategories()]);
  return (
    <>
      <PageHeader title="Curriculum library" sub="All curricula, their latest version and validation state." actions={<><Link className="btn btn-light btn-sm" href="/admin/completeness">Completeness report</Link><Link className="btn btn-gold btn-sm" href="/admin/curricula/new">New curriculum</Link></>} />
      <form className="card card-pad mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]" role="search"><div><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q} className="input" /></div><div><label className="label" htmlFor="category">Category</label><select id="category" name="category" defaultValue={sp.category ?? ""} className="input"><option value="">All</option>{cats.map(({ c }) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div><div><label className="label" htmlFor="status">Status</label><select id="status" name="status" defaultValue={sp.status ?? ""} className="input"><option value="">Any</option><option value="draft">Draft</option><option value="in_review">In review</option><option value="published">Published</option><option value="archived">Archived</option></select></div><div className="flex items-end"><button className="btn btn-primary w-full">Filter</button></div></form>
      {d.rows.length === 0 ? <Empty title="No curricula match" /> : (
        <Table caption="Curricula"><thead><tr><th>No.</th><th>Title</th><th>Category</th><th>Status</th><th>Latest version</th><th>Lessons</th><th>Checks</th></tr></thead><tbody>
          {d.rows.map((r) => (<tr key={r.c.id}><td>{r.c.catalogNumber}</td><td><Link className="font-semibold" href={`/admin/curricula/${r.c.id}`}>{r.c.title}</Link></td><td className="text-xs">{r.cat}</td><td><StatusBadge status={r.c.status} /></td><td>{r.latestNumber ? <>v{r.latestNumber} <StatusBadge status={r.latestStatus!} /></> : <span className="text-mist">No content yet</span>}</td><td>{r.lessonCount}/26</td><td>{r.latestValid === true ? <Badge tone="ok">passes</Badge> : r.latestValid === false ? <Badge tone="bad">needs work</Badge> : <span className="text-xs text-mist">not run</span>}</td></tr>))}
        </tbody></Table>
      )}
      <Pagination page={d.page} pageSize={d.pageSize} total={d.total} base="/admin/curricula" params={{ q: sp.q, status: sp.status, category: sp.category }} />
    </>
  );
}
