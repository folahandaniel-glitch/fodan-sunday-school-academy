import Link from "next/link";
import type { Metadata } from "next";
import { listCatalog, listCategories } from "@/server/services/curriculum";
import { Empty, Pagination } from "@/components/ui";

export const metadata: Metadata = { title: "Curriculum library", description: "Fifty Bible teaching curricula in five categories, each planned as 26 weekly lessons." };
export const dynamic = "force-dynamic";

export default async function Library({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total, pageSize }, cats] = await Promise.all([
    listCatalog({ q: sp.q?.slice(0, 80), category: sp.category, level: sp.level, tier: sp.tier, sort: sp.sort as "title" | "number" | undefined, page, pageSize: 12 }),
    listCategories(),
  ]);
  const totalCurricula = cats.reduce((n, c) => n + c.total, 0);
  const published = cats.reduce((n, c) => n + c.published, 0);
  return (
    <div className="container-page py-10">
      <h1 className="text-3xl sm:text-4xl">Curriculum library</h1>
      <p className="mt-2 max-w-3xl text-mist">{totalCurricula} Bible teaching curricula in five categories. Each runs for 26 weeks with a mid-session test, a final examination and a revision week. {published} {published === 1 ? "is" : "are"} published and ready for churches to select; the rest are being prepared and reviewed.</p>
      <form className="card card-pad mt-6 grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr_auto]" role="search">
        <div><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q} className="input" placeholder="e.g. prayer, marriage, Holy Spirit" /></div>
        <div><label className="label" htmlFor="category">Category</label>
          <select id="category" name="category" className="input" defaultValue={sp.category ?? ""}><option value="">All categories</option>{cats.map(({ c }) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div>
        <div><label className="label" htmlFor="level">Level</label>
          <select id="level" name="level" className="input" defaultValue={sp.level ?? ""}><option value="">Any</option><option>Foundation</option><option>Intermediate</option><option>Advanced</option></select></div>
        <div className="flex items-end"><button className="btn btn-primary w-full">Filter</button></div>
      </form>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ c, cat }) => (
          <Link key={c.id} href={`/library/${c.slug}`} className="card card-pad card-hover flex flex-col no-underline">
            <span className="text-xs font-semibold uppercase tracking-wide text-gold-700">{cat} · No. {c.catalogNumber}</span>
            <h2 className="mt-1 text-lg">{c.title}</h2>
            <p className="mt-2 flex-1 text-sm text-mist">{c.shortDescription}</p>
            <p className="mt-3 text-xs text-mist">{c.level} · {c.audience} · 26 weeks</p>
          </Link>
        ))}
      </div>
      {rows.length === 0 && <div className="mt-6"><Empty title="No curricula to show yet">{published === 0 ? "Curricula are published after they pass completeness checks and a human review. Please check back soon." : "Try a different search or category."}</Empty></div>}
      <Pagination page={page} pageSize={pageSize} total={total} base="/library" params={{ q: sp.q, category: sp.category, level: sp.level }} />
    </div>
  );
}
