import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { getProgramme, previewAdoption } from "@/server/services/schedule";
import { ActionButton, ActionForm } from "@/components/forms";
import { activateAction, adoptAction, cancelProgrammeAction, issueCertificatesAction, rescheduleAction, weeksAction } from "@/app/actions/staff";
import { Alert, Badge, Card, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate } from "@/lib/text";
import { can, NotFoundError } from "@/server/org";
import { hasFeature } from "@/server/services/entitlements";

export const metadata: Metadata = { title: "Programme" };
export const dynamic = "force-dynamic";
const TYPE: Record<string, string> = { teaching: "Teaching", midtest: "Mid-session test", final: "Final examination", revision: "Revision" };

export default async function ProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireOrg("classes.view");
  const id = (await params).id;
  let p;
  try { p = await getProgramme(ctx, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const manage = can(ctx, "sessions.manage");
  const [adopt, certs] = await Promise.all([manage ? previewAdoption(ctx, id) : Promise.resolve({ available: false as const }), hasFeature(ctx.orgId, "certificates")]);
  const a = p.a, delivered = p.lessons.filter((l) => l.sl.status === "completed").length;
  const cfg = p.s.config;
  const undated = p.lessons.filter((l) => !l.sl.scheduledDate).length;
  return (
    <>
      <PageHeader crumbs={[{ label: "Academic sessions", href: "/church/sessions" }, { label: p.title }]} title={p.title} sub={`${p.s.name} · curriculum version ${p.versionNumber} · ${delivered} of 26 delivered`} actions={<StatusBadge status={a.status} />} />
      {a.status === "draft" && manage && (
        <div className="mb-4"><Alert tone="warn"><div className="flex flex-wrap items-center justify-between gap-3"><span>This programme is a draft. Learners cannot see it yet.{undated > 0 && ` ${undated} lesson(s) still need a date.`}</span><span className="flex gap-2"><ActionButton action={activateAction} fields={{ id }} label="Activate programme" tone="gold" confirm="Activate this programme and notify learners and teachers?" /><ActionButton action={cancelProgrammeAction} fields={{ id }} label="Discard draft" tone="danger" confirm="Discard this draft programme?" /></span></div></Alert></div>
      )}
      {adopt.available && (
        <Card className="mb-4 border-gold">
          <h2 className="text-lg">A newer version of this curriculum is available</h2>
          <p className="mt-1 text-sm text-mist">Your programme is still on <strong>version {adopt.from.versionNumber}</strong> and has <strong>not</strong> been changed. Version {adopt.to.versionNumber}{adopt.summary ? `: ${adopt.summary}` : ""} Adopting it moves only the {adopt.movable} lessons not yet taught; lessons already taught stay as they were.</p>
          <ul className="mt-2 text-sm">{adopt.changes.filter((c) => c.changed).map((c) => <li key={c.unitWeek}>Lesson {c.unitWeek}: {c.newTitle}{c.alreadyDelivered ? " (already taught, will not change)" : " (changed)"}</li>)}{adopt.changes.every((c) => !c.changed) && <li>Wording and structure are unchanged; only supporting details differ.</li>}</ul>
          <ActionForm action={adoptAction} submit="Adopt the newer version for upcoming lessons" className="mt-3" confirm="Move the lessons not yet taught to the newer version? This is recorded and cannot be undone."><input type="hidden" name="id" value={id} /><input name="notes" className="input" placeholder="Optional note for your records" maxLength={300} aria-label="Note" /></ActionForm>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card><h2 className="text-lg">Calendar</h2>
          <div className="mt-2 overflow-x-auto"><table className="table"><thead><tr><th>Week</th><th>Lesson</th><th>Type</th><th>Date</th><th>Status</th></tr></thead><tbody>
            {p.lessons.map((l) => (<tr key={l.sl.id}><td>{l.sl.weekNumber}</td><td><Link className="font-semibold" href={`/church/lessons/${l.sl.id}`}>{l.title}</Link><br /><span className="text-xs text-mist">{l.versionId === a.versionId ? "" : "taught from an earlier version"}</span></td><td>{TYPE[l.sl.lessonType]}{l.sl.combinedWithWeek && <Badge>shares a date</Badge>}</td><td>{l.sl.scheduledDate ? fmtDate(l.sl.scheduledDate) : <Badge tone="warn">no date</Badge>}</td><td><StatusBadge status={l.sl.status} />{l.sl.releaseOverride && <Badge tone="info">{l.sl.releaseOverride}</Badge>}</td></tr>))}
          </tbody></table></div></Card>
        <div className="space-y-4">
          <Card><h2 className="text-lg">Classes</h2>{p.classes.length === 0 ? <p className="mt-1 text-sm text-mist">No class is following this programme.</p> : <ul className="mt-1 text-sm">{p.classes.map((c) => <li key={c.id}><Link href={`/church/classes/${c.id}`}>{c.name}</Link></li>)}</ul>}</Card>
          {p.exceptions.length > 0 && <Card><h2 className="text-lg">Skipped dates</h2><ul className="mt-1 text-sm">{p.exceptions.map((e) => <li key={e.id}>{fmtDate(e.exceptionDate)} {e.description && `· ${e.description}`}</li>)}</ul></Card>}
          {manage && a.status !== "cancelled" && (
            <>
              <Card><h2 className="text-lg">Reschedule</h2><p className="text-sm text-mist">Move one lesson, or every lesson from a week onwards. Nothing is dropped.</p>
                <ActionForm action={rescheduleAction} submit="Update dates" className="mt-2"><input type="hidden" name="id" value={id} />
                  <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="slot">From week</label><input id="slot" name="slot" type="number" min={1} max={26} className="input" defaultValue={Math.min(26, delivered + 1)} /></div><div><label className="label" htmlFor="date">New date</label><input id="date" name="date" type="date" className="input" required /></div></div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shift" defaultChecked className="h-4 w-4" /> Move all later lessons too (weekly)</label>
                  <div><label className="label" htmlFor="skip">Also skip these dates (one per line)</label><textarea id="skip" name="skip" className="input" rows={2} /></div>
                  <div><label className="label" htmlFor="reason">Reason</label><input id="reason" name="reason" className="input" placeholder="e.g. Church convention" /></div></ActionForm></Card>
              {delivered === 0 && (
                <Card><h2 className="text-lg">Test, examination and revision weeks</h2><p className="text-sm text-mist">Defaults: 13, 25 and 26. Changing them re-orders lessons but keeps all 26.</p>
                  <ActionForm action={weeksAction} submit="Update weeks" className="mt-2"><input type="hidden" name="id" value={id} /><div className="grid grid-cols-3 gap-2"><div><label className="label" htmlFor="mw">Test</label><input id="mw" name="midtestWeek" type="number" min={1} max={26} className="input" defaultValue={cfg.midtestWeek} /></div><div><label className="label" htmlFor="fw">Exam</label><input id="fw" name="finalWeek" type="number" min={1} max={26} className="input" defaultValue={cfg.finalWeek} /></div><div><label className="label" htmlFor="rw">Revision</label><input id="rw" name="revisionWeek" type="number" min={1} max={26} className="input" defaultValue={cfg.revisionWeek} /></div></div></ActionForm></Card>
              )}
            </>
          )}
          <Card><h2 className="text-lg">Reports and certificates</h2><div className="mt-2 flex flex-wrap gap-2"><Link className="btn btn-light btn-sm" href={`/church/sessions/${id}/report`}>Session report</Link><Link className="btn btn-light btn-sm" href="/church/exams">Assessments</Link></div>
            {can(ctx, "certificates.issue") && (certs ? <ActionButton action={issueCertificatesAction} fields={{ id }} label="Issue certificates to eligible learners" tone="gold" confirm="Issue certificates to every learner who meets your completion requirements?" /> : <p className="mt-2 text-xs text-mist">Certificates are included in higher plans.</p>)}</Card>
        </div>
      </div>
    </>
  );
}
