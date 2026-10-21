import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { asLessonLike, EDITABLE, loadBundle, validateVersion } from "@/server/services/curriculum";
import { ActionForm, ActionButton } from "@/components/forms";
import { discardDraftAction, moveLessonAction, publishAction, reviewAction, submitReviewAction, validateAction } from "@/app/actions/admin";
import { Alert, Badge, Card, PageHeader, StatusBadge } from "@/components/ui";
import { VersionTabs } from "@/components/version-tabs";
import { lessonWords, validateLesson } from "@/lib/completeness";
import { NotFoundError } from "@/server/org";
import { getDb, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { platformCan } from "@/lib/permissions";

export const metadata: Metadata = { title: "Version" };
export const dynamic = "force-dynamic";

export default async function VersionPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const user = await requirePlatform("curriculum.write");
  const { id, versionId } = await params;
  let b, report;
  try { b = await loadBundle(versionId); report = await validateVersion(versionId); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  if (b.version.curriculumId !== id) notFound();
  const db = await getDb();
  const [c] = await db.select().from(schema.curricula).where(eq(schema.curricula.id, id));
  const v = b.version, editable = (EDITABLE as readonly string[]).includes(v.status);
  const canReview = platformCan(user.platformRole, "curriculum.review"), canPublish = platformCan(user.platformRole, "curriculum.publish");
  return (
    <>
      <PageHeader crumbs={[{ label: "Curriculum library", href: "/admin/curricula" }, { label: c.title, href: `/admin/curricula/${id}` }, { label: `Version ${v.versionNumber}` }]} title={`${c.title}: version ${v.versionNumber}`} sub={v.changeSummary || undefined} actions={<StatusBadge status={v.status} />} />
      {v.provenance === "seed" && <div className="mb-4"><Alert tone="warn"><strong>Drafted with AI assistance; not yet theologically reviewed.</strong> A qualified human reviewer must read it and approve it before churches can use it. Scripture is always read from the Bible text by reference.</Alert></div>}
      {!editable && <div className="mb-4"><Alert tone="info">This version is <strong>{v.status}</strong> and frozen. Its content (and the database) cannot be changed. To improve it, start a new draft version from the curriculum page.</Alert></div>}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg">Completeness</h2><p className="text-sm text-mist">{report.lessonsComplete} of 26 units complete · {report.words.toLocaleString()} words · {report.questions} questions · {report.ok ? <Badge tone="ok">passes every check</Badge> : <Badge tone="bad">{report.problems.length} problem(s)</Badge>}</p></div>
          <div className="flex flex-wrap gap-2">
            <ActionForm action={validateAction} submit="Re-run checks" className="!space-y-0" submitClass="btn-light btn-sm !text-brand"><input type="hidden" name="versionId" value={versionId} /></ActionForm>
            {editable && v.status !== "in_review" && <ActionForm action={submitReviewAction} submit="Submit for review" className="!space-y-0" submitClass="btn-sm btn-gold"><input type="hidden" name="versionId" value={versionId} /></ActionForm>}
            {editable && v.status === "draft" && c.currentVersionId !== versionId && <ActionForm action={discardDraftAction} submit="Discard draft" className="!space-y-0" submitClass="btn-sm btn-danger" confirm="Discard this draft version?"><input type="hidden" name="id" value={id} /><input type="hidden" name="versionId" value={versionId} /></ActionForm>}
            {v.status === "approved" && canPublish && <ActionForm action={publishAction} submit="Publish to churches" className="!space-y-0" submitClass="btn-sm btn-gold" confirm="Publish this version? Churches can then select it. Churches teaching an earlier version are not changed."><input type="hidden" name="versionId" value={versionId} /></ActionForm>}
          </div>
        </div>
        {report.problems.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-danger">{report.problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}</ul>}
      </Card>
      {v.status === "in_review" && canReview && (
        <Card className="mb-4 border-gold"><h2 className="text-lg">Reviewer decision</h2><p className="text-sm text-mist">Read the lessons, then record your decision. Approving freezes this version permanently.</p>
          <ActionForm action={reviewAction} submit="Record decision" className="mt-2"><input type="hidden" name="versionId" value={versionId} />
            <div className="grid gap-3 sm:grid-cols-[14rem_1fr]"><div><label className="label" htmlFor="decision">Decision</label><select id="decision" name="decision" className="input"><option value="approve">Approve</option><option value="request_changes">Request changes</option><option value="reject">Reject</option></select></div><div><label className="label" htmlFor="comments">Comments</label><input id="comments" name="comments" className="input" /></div></div></ActionForm></Card>
      )}
      <VersionTabs id={id} versionId={versionId} current="lessons" />
      <div className="overflow-x-auto"><table className="table"><caption className="sr-only">Lessons</caption><thead><tr><th>Week</th><th>Title</th><th>Kind</th><th>Words</th><th>Checks</th>{editable && <th>Move</th>}<th /></tr></thead><tbody>
        {b.lessons.map((l) => { const pr = validateLesson(asLessonLike(l)); return (
          <tr key={l.id}><td>{l.weekNumber}</td><td className="font-semibold">{l.title}</td><td className="text-xs">{l.unitKind}</td><td>{lessonWords(asLessonLike(l))}</td><td>{pr.length === 0 ? <Badge tone="ok">complete</Badge> : <span title={pr.join(" ")}><Badge tone="bad">{pr.length} to fix</Badge></span>}</td>
            {editable && <td>{l.unitKind === "teaching" ? <ActionForm action={moveLessonAction} submit="Go" className="!space-y-0 flex items-center gap-1" submitClass="btn-sm btn-light !text-brand"><input type="hidden" name="versionId" value={versionId} /><input type="hidden" name="from" value={l.weekNumber} /><input name="to" type="number" min={1} max={24} aria-label={`Move week ${l.weekNumber} to week`} className="input !min-h-8 !w-16 !py-0 text-xs" defaultValue={l.weekNumber} /></ActionForm> : <span className="text-xs text-mist">fixed</span>}</td>}
            <td><Link className="btn btn-light btn-sm" href={`/admin/curricula/${id}/v/${versionId}/lessons/${l.weekNumber}`}>{editable ? "Edit" : "View"}</Link></td></tr>); })}
      </tbody></table></div>
      <p className="mt-3 text-xs text-mist">Weeks 13 (mid-session test), 25 (final examination) and 26 (revision) are fixed units. Other lessons can be reordered while the version is a draft.</p>
      <ActionButton action={validateAction} fields={{ versionId }} label="Check Scripture references" />
    </>
  );
}
