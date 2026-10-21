import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { getPublicCurriculum } from "@/server/services/curriculum";
import { curriculumTierAllowed } from "@/server/services/entitlements";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { can } from "@/server/org";

export const metadata: Metadata = { title: "Curriculum" };
export const dynamic = "force-dynamic";

export default async function ChurchCurriculum({ params }: { params: Promise<{ slug: string }> }) {
  const { ctx } = await requireOrg("classes.view");
  const d = await getPublicCurriculum((await params).slug);
  if (!d) notFound();
  const ok = await curriculumTierAllowed(ctx.orgId, d.curriculum.accessTier);
  const c = d.curriculum;
  return (
    <>
      <PageHeader crumbs={[{ label: "Curriculum library", href: "/church/library" }, { label: c.title }]} title={c.title} sub={c.shortDescription} actions={can(ctx, "sessions.manage") ? (ok ? <Link className="btn btn-gold" href={`/church/sessions/new?curriculum=${c.id}`}>Start a programme with this curriculum</Link> : <Badge tone="warn">Needs the {c.accessTier} plan</Badge>) : undefined} />
      {!ok && <div className="mb-4"><Alert tone="warn">This curriculum is not included in your current plan. <Link href="/church/billing">See plans</Link></Alert></div>}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card><h2 className="text-lg">26-week outline (version {d.version.versionNumber})</h2>
          <ol className="mt-3 divide-y divide-line">{d.lessons.map((l) => <li key={l.week} className="flex gap-3 py-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-sm text-gold" aria-hidden>{l.week}</span><div><p className="font-semibold text-navy">{l.title}</p><p className="text-sm text-mist">{l.summary}</p><p className="text-xs text-mist">{l.scripture.join("; ")} · {l.minutes} min</p></div></li>)}</ol></Card>
        <div className="space-y-4">
          <Card><h2 className="text-lg">Outcomes</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{c.outcomes.map((o) => <li key={o}>{o}</li>)}</ul></Card>
          <Card><h2 className="text-lg">Assessments</h2><ul className="mt-2 space-y-1 text-sm">{d.blueprints.map((b) => <li key={b.kind}><strong>{b.kind === "midtest" ? "Mid-session test" : "Final examination"}:</strong> {b.config.totalMarks} marks, {b.config.durationMinutes} min, pass {b.config.passPercent}%</li>)}</ul></Card>
          {c.doctrinalNotes && <Card><h2 className="text-lg">Doctrinal note</h2><p className="mt-1 text-sm text-mist">{c.doctrinalNotes}</p></Card>}
        </div>
      </div>
    </>
  );
}
