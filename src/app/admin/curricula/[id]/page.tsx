import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { getCurriculumAdmin, listCategories } from "@/server/services/curriculum";
import { ActionButton, ActionForm } from "@/components/forms";
import { archiveAction, duplicateAction, newDraftAction, updateMetaAction } from "@/app/actions/admin";
import { Badge, Card, PageHeader, StatusBadge, Table } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";
import { NotFoundError } from "@/server/org";

export const metadata: Metadata = { title: "Curriculum" };
export const dynamic = "force-dynamic";

export default async function CurriculumAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatform("curriculum.write");
  const id = (await params).id;
  let d;
  try { d = await getCurriculumAdmin(id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const cats = await listCategories();
  const c = d.curriculum;
  const latest = d.versions[0];
  const frozenLatest = latest && !["draft", "in_review", "rejected"].includes(latest.status);
  return (
    <>
      <PageHeader crumbs={[{ label: "Curriculum library", href: "/admin/curricula" }, { label: c.title }]} title={c.title} sub={`No. ${c.catalogNumber} · ${c.audience} · ${c.level}`} actions={<><StatusBadge status={c.status} /><ActionButton action={duplicateAction} fields={{ id }} label="Duplicate" /><ActionButton action={archiveAction} fields={{ id, archive: c.status === "archived" ? "0" : "1" }} label={c.status === "archived" ? "Restore" : "Archive"} tone={c.status === "archived" ? "light" : "danger"} confirm={c.status === "archived" ? undefined : "Archive this curriculum? Churches already using it are not affected, but new churches cannot select it."} /></>} />
      <Card>
        <h2 className="text-lg">Versions</h2>
        <p className="text-sm text-mist">Only <strong>published</strong> versions are offered to churches. Approved and published versions are frozen: to improve them, start a new draft version. Churches teaching an earlier version keep it until they choose to adopt the new one.</p>
        <Table caption="Versions"><thead><tr><th>Version</th><th>Status</th><th>Provenance</th><th>Summary</th><th>Updated</th><th /></tr></thead><tbody>
          {d.versions.map((v) => (<tr key={v.id}><td className="font-semibold">v{v.versionNumber} {c.currentVersionId === v.id && <Badge tone="ok">live</Badge>}</td><td><StatusBadge status={v.status} /></td><td className="text-xs">{v.provenance === "seed" ? "Drafted with AI assistance; needs human review" : v.provenance}</td><td className="max-w-xs text-xs text-mist">{v.changeSummary}</td><td className="text-xs">{fmtDateTime(v.updatedAt)}</td><td><Link className="btn btn-light btn-sm" href={`/admin/curricula/${id}/v/${v.id}`}>Open</Link></td></tr>))}
          {d.versions.length === 0 && <tr><td colSpan={6} className="text-mist">No version yet.</td></tr>}
        </tbody></Table>
        {frozenLatest && latest && (
          <ActionForm action={newDraftAction} submit="Start a new draft version" className="mt-3"><input type="hidden" name="id" value={id} /><input type="hidden" name="versionId" value={latest.id} /><div><label className="label" htmlFor="summary">What will you change? (shown to churches)</label><input id="summary" name="summary" className="input" placeholder="e.g. Clearer wording in weeks 2 and 5; new discussion questions" /></div></ActionForm>
        )}
      </Card>
      {d.reviews.length > 0 && (
        <Card className="mt-4"><h2 className="text-lg">Review and approval history</h2><ul className="mt-2 divide-y divide-line text-sm">{d.reviews.map(({ r, reviewer }) => <li key={r.id} className="py-2"><strong>{r.decision.replace("_", " ")}</strong> by {reviewer ?? "system"} <span className="text-xs text-mist">· {fmtDateTime(r.createdAt)}</span>{r.comments && <p className="text-mist">{r.comments}</p>}</li>)}</ul></Card>
      )}
      <Card className="mt-4"><h2 className="text-lg">Catalogue details</h2>
        <ActionForm action={updateMetaAction} submit="Save details" className="mt-3"><input type="hidden" name="id" value={id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label" htmlFor="title">Title</label><input id="title" name="title" className="input" defaultValue={c.title} required /></div>
            <div><label className="label" htmlFor="categoryId">Category</label><select id="categoryId" name="categoryId" className="input" defaultValue={c.categoryId ?? ""}><option value="">None</option>{cats.map(({ c: x }) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <div><label className="label" htmlFor="level">Level</label><select id="level" name="level" className="input" defaultValue={c.level}><option>Foundation</option><option>Intermediate</option><option>Advanced</option></select></div>
            <div><label className="label" htmlFor="audience">Target audience</label><input id="audience" name="audience" className="input" defaultValue={c.audience} /></div>
            <div><label className="label" htmlFor="durationLabel">Estimated duration</label><input id="durationLabel" name="durationLabel" className="input" defaultValue={c.durationLabel} /></div>
            <div><label className="label" htmlFor="accessTier">Access tier</label><select id="accessTier" name="accessTier" className="input" defaultValue={c.accessTier}><option value="free">Free</option><option value="standard">Standard plan</option><option value="premium">Premium plan</option></select></div>
            <div><label className="label" htmlFor="visibility">Visibility</label><select id="visibility" name="visibility" className="input" defaultValue={c.visibility}><option value="public">Public library and churches</option><option value="registered">Registered churches only</option><option value="private">Private (hidden)</option></select></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="shortDescription">Short description</label><textarea id="shortDescription" name="shortDescription" className="input" rows={2} defaultValue={c.shortDescription} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="fullDescription">Full description</label><textarea id="fullDescription" name="fullDescription" className="input" rows={4} defaultValue={c.fullDescription} /></div>
            <div><label className="label" htmlFor="themes">Main biblical themes (one per line)</label><textarea id="themes" name="themes" className="input" rows={4} defaultValue={c.themes.join("\n")} /></div>
            <div><label className="label" htmlFor="outcomes">Learning outcomes (one per line)</label><textarea id="outcomes" name="outcomes" className="input" rows={4} defaultValue={c.outcomes.join("\n")} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="doctrinalNotes">Doctrinal review notes</label><textarea id="doctrinalNotes" name="doctrinalNotes" className="input" rows={3} defaultValue={c.doctrinalNotes} /></div>
            <div><label className="label" htmlFor="author">Author or editor</label><input id="author" name="author" className="input" defaultValue={c.author} /></div>
            <div><label className="label" htmlFor="tags">Tags (comma separated)</label><input id="tags" name="tags" className="input" defaultValue={c.tags.join(", ")} /></div>
          </div></ActionForm></Card>
    </>
  );
}
