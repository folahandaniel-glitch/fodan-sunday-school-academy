import Link from "next/link";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { listCatalog, listCategories } from "@/server/services/curriculum";
import { curriculumTierAllowed } from "@/server/services/entitlements";
import { Badge, Empty, PageHeader, Pagination } from "@/components/ui";

export const metadata: Metadata = { title: "Curriculum library" };
export const dynamic = "force-dynamic";

export default async function ChurchLibrary({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await requireOrg("classes.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total, pageSize }, cats] = await Promise.all([listCatalog({ q: sp.q?.slice(0, 80), category: sp.category, page, pageSize: 12 }), listCategories()]);
  const allowed = await Promise.all(rows.map(({ c }) => curriculumTierAllowed(ctx.orgId, c.accessTier)));
  return (
    <>
      <PageHeader title="Curriculum library" sub="Published curricula your church can use. Each runs for 26 weeks." />
      <form className="card card-pad mb-6 grid gap-3 sm:grid-cols-[2fr_1.5fr_auto]" role="search"><div><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q} className="input" /></div><div><label className="label" htmlFor="category">Category</label><select id="category" name="category" className="input" defaultValue={sp.category ?? ""}><option value="">All</option>{cats.map(({ c }) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div><div className="flex items-end"><button className="btn btn-primary w-full">Filter</button></div></form>
      {rows.length === 0 ? <Empty title="No published curricula match">Curricula appear here after they pass completeness checks and are reviewed and published by the Academy.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ c, cat }, i) => (
            <Link key={c.id} href={`/church/library/${c.slug}`} className="card card-pad card-hover flex flex-col no-underline"><span className="text-xs font-semibold uppercase tracking-wide text-gold-700">{cat} · No. {c.catalogNumber}</span><h2 className="mt-1 text-lg">{c.title}</h2><p className="mt-2 flex-1 text-sm text-mist">{c.shortDescription}</p><p className="mt-3 flex flex-wrap gap-1 text-xs"><Badge tone="info">{c.level}</Badge>{!allowed[i] && <Badge tone="warn">Needs {c.accessTier} plan</Badge>}</p></Link>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} base="/church/library" params={{ q: sp.q, category: sp.category }} />
    </>
  );
}
