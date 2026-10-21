import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { getPageForEdit } from "@/server/services/cms";
import { ActionForm, ActionButton } from "@/components/forms";
import { publishPageAction, savePageAction } from "@/app/actions/admin";
import { SectionEditor } from "@/components/section-editor";
import { SiteSections } from "@/components/sections";
import { Alert, Card, PageHeader } from "@/components/ui";
import { NotFoundError } from "@/server/org";

export const metadata: Metadata = { title: "Edit page" };
export const dynamic = "force-dynamic";

export default async function EditPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  await requirePlatform("site.edit");
  const { slug } = await params;
  let p;
  try { p = await getPageForEdit(slug); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const sections = p.draftSections ?? p.sections;
  const preview = (await searchParams).preview === "1";
  return (
    <>
      <PageHeader crumbs={[{ label: "Website content", href: "/admin/site" }, { label: p.title }]} title={`Edit: ${p.title}`} actions={<><Link className="btn btn-light btn-sm" href={`/admin/site/${slug}?preview=${preview ? 0 : 1}`}>{preview ? "Back to editing" : "Preview draft"}</Link>{p.draftSections && <ActionButton action={publishPageAction} fields={{ slug }} label="Publish draft" tone="gold" />}</>} />
      {p.draftSections && <div className="mb-4"><Alert tone="warn">This page has unpublished changes. Visitors still see the published version.</Alert></div>}
      {preview ? <div className="rounded-2xl border border-line bg-white"><SiteSections sections={sections} /></div> : (
        <ActionForm action={savePageAction} submit="Save draft">
          <input type="hidden" name="slug" value={slug} />
          <Card><div className="grid gap-3 sm:grid-cols-3"><div><label className="label" htmlFor="title">Page title</label><input id="title" name="title" className="input" defaultValue={p.title} required /></div><div><label className="label" htmlFor="seoTitle">Search engine title</label><input id="seoTitle" name="seoTitle" className="input" defaultValue={p.seo.title ?? ""} /></div><div><label className="label" htmlFor="seoDescription">Search engine description</label><input id="seoDescription" name="seoDescription" className="input" defaultValue={p.seo.description ?? ""} /></div></div></Card>
          <SectionEditor initial={sections as never} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" className="h-4 w-4" /> Publish immediately after saving</label>
        </ActionForm>
      )}
    </>
  );
}
