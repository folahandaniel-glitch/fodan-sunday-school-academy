import Link from "next/link";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { learnerSummary } from "@/server/services/teaching";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate } from "@/lib/text";

export const metadata: Metadata = { title: "Weekly lessons" };
export const dynamic = "force-dynamic";

export default async function Lessons({ searchParams }: { searchParams: Promise<{ programme?: string }> }) {
  const { ctx } = await requireOrg("learn");
  const sp = await searchParams;
  const all = await learnerSummary(ctx);
  const list = sp.programme ? all.filter((s) => s.programme.id === sp.programme) : all;
  return (
    <>
      <PageHeader title="Weekly lessons" sub="Lessons open on their teaching date (a day early, so you can prepare)." />
      {list.length === 0 && <Empty title="No lessons yet">Lessons appear when your church activates a programme for your class.</Empty>}
      {list.map((s) => (
        <section key={s.programme.id} className="mb-8"><h2 className="mb-2 text-xl">{s.programme.title}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {s.lessons.filter((l) => l.status !== "scheduled" && l.status !== "locked").map((l) => (
              <Link key={l.id} href={`/learn/lessons/${l.id}`} className="card card-pad card-hover no-underline"><div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-gold-700">Week {l.week} · {fmtDate(l.date)}</span><StatusBadge status={l.myCompleted ? "completed" : l.status} /></div><h3 className="mt-1 text-lg">{l.title}</h3><p className="text-sm text-mist">{l.scripture.join("; ")}</p></Link>
            ))}
          </div>
          {s.lessons.every((l) => l.status === "scheduled" || l.status === "locked") && <p className="text-sm text-mist">The first lesson opens on {fmtDate(s.lessons[0]?.date)}.</p>}
        </section>
      ))}
    </>
  );
}
