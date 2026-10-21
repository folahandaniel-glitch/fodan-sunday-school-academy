import Link from "next/link";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { churchOverview } from "@/server/services/reports";
import { getOrgProfile, listAnnouncements } from "@/server/services/church";
import { listProgrammes, programmesWithNewerVersion } from "@/server/services/schedule";
import { planStatusFor } from "@/server/services/entitlements";
import { Alert, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { fmtDate } from "@/lib/text";

export const metadata: Metadata = { title: "Church overview" };
export const dynamic = "force-dynamic";

export default async function ChurchHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { ctx } = await requireOrg("classes.view");
  const sp = await searchParams;
  const [o, org, progs, plan, updates] = await Promise.all([churchOverview(ctx), getOrgProfile(ctx), listProgrammes(ctx), planStatusFor(ctx.orgId), programmesWithNewerVersion(ctx)]);
  const active = progs.filter((p) => p.a.status === "active");
  return (
    <>
      <PageHeader title={ctx.orgName} sub={`${plan.plan.name} plan`} />
      {sp.welcome && <div className="mb-4"><Alert tone="ok"><strong>Your church is registered.</strong> Next steps: 1) invite teachers and learners (share your join code below) · 2) create classes · 3) choose a curriculum and a session.</Alert></div>}
      {org.joinCode && ctx.role === "church_admin" && <div className="mb-4"><Alert tone="info">Members join by choosing your church when they register. Your instant-approval join code: <strong className="font-mono text-base">{org.joinCode}</strong></Alert></div>}
      {o.pending > 0 && <div className="mb-4"><Alert tone="warn"><Link href="/church/members?status=pending" className="font-semibold">{o.pending} member(s) are waiting for your approval.</Link></Alert></div>}
      {updates.map((u) => <div key={u.id} className="mb-4"><Alert tone="info">A newer version of <strong>{u.title}</strong> is available. Your programme has not changed. <Link href={`/church/sessions/${u.id}`} className="font-semibold">Review what is new</Link></Alert></div>)}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Learners" value={o.learners} href="/church/members?role=learner" /><Stat label="Teachers" value={o.teachers} href="/church/members?role=teacher" /><Stat label="Classes" value={o.classes} href="/church/classes" /><Stat label="Active programmes" value={o.programmes} href="/church/sessions" />
        <Stat label="Average attendance" value={o.attendancePercent === null ? "–" : `${o.attendancePercent}%`} /><Stat label="Released results" value={o.resultsCount} /><Stat label="Average score" value={o.averageScore === null ? "–" : `${o.averageScore}%`} /><Stat label="Pass rate" value={o.passRate === null ? "–" : `${o.passRate}%`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card><h2 className="text-lg">Upcoming lessons</h2>{o.upcoming.length === 0 ? <div className="mt-3"><Empty title="No lessons scheduled" action={<Link className="btn btn-primary btn-sm" href="/church/library">Choose a curriculum</Link>}>Choose a curriculum and a session to build your six-month programme.</Empty></div> : <ul className="mt-2 divide-y divide-line">{o.upcoming.map((u) => <li key={u.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span><strong>Week {u.week}</strong> {u.title}<br /><span className="text-xs text-mist">{fmtDate(u.date)}</span></span><Link className="btn btn-light btn-sm" href={`/church/lessons/${u.id}`}>Open</Link></li>)}</ul>}</Card>
        <Card><h2 className="text-lg">Programmes</h2>{active.length === 0 ? <p className="mt-2 text-sm text-mist">No programme is active yet.</p> : <ul className="mt-2 divide-y divide-line">{active.map((p) => <li key={p.a.id} className="py-2 text-sm"><Link className="font-semibold" href={`/church/sessions/${p.a.id}`}>{p.title}</Link><br /><span className="text-xs text-mist">{p.s.name} · {p.delivered} of 26 delivered · curriculum v{p.versionNumber}</span></li>)}</ul>}<Link className="btn btn-light btn-sm mt-3" href="/church/sessions">All sessions</Link></Card>
      </div>
    </>
  );
}
