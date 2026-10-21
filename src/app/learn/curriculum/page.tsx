import Link from "next/link";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { learnerSummary } from "@/server/services/teaching";
import { Card, Empty, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate } from "@/lib/text";

export const metadata: Metadata = { title: "My curriculum" };
export const dynamic = "force-dynamic";

export default async function MyCurriculum() {
  const { ctx } = await requireOrg("learn");
  const summary = await learnerSummary(ctx);
  return (
    <>
      <PageHeader title="My curriculum" sub="Your class's 26-week programme." />
      {summary.length === 0 && <Empty title="No active programme yet">When your church starts a programme for your class, it appears here.</Empty>}
      {summary.map((s) => (
        <Card key={s.programme.id} className="mb-6">
          <h2 className="text-xl">{s.programme.title}</h2><p className="text-sm text-mist">{s.programme.session}</p>
          <ol className="mt-4 divide-y divide-line">
            {s.lessons.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-sm text-gold" aria-hidden>{l.week}</span>
                <div className="min-w-0 flex-1"><p className="font-semibold text-navy">{l.status === "available" || l.status === "in_progress" || l.status === "completed" ? <Link href={`/learn/lessons/${l.id}`}>{l.title}</Link> : l.title}</p><p className="text-xs text-mist">{l.date ? fmtDate(l.date) : "Date to be set"}{l.type !== "teaching" && ` · ${l.type === "midtest" ? "Mid-session test week" : l.type === "final" ? "Final examination week" : "Revision week"}`}</p></div>
                <StatusBadge status={l.myCompleted ? "completed" : l.status} />
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </>
  );
}
