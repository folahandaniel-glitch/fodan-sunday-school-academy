import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { getImport } from "@/server/services/import";
import { ActionForm } from "@/components/forms";
import { importPreviewAction, importSaveAction } from "@/app/actions/admin";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { NotFoundError } from "@/server/org";

export const metadata: Metadata = { title: "Import and export" };
export const dynamic = "force-dynamic";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  await requirePlatform("curriculum.write");
  const sp = await searchParams;
  let imp = null;
  if (sp.preview) { try { imp = await getImport(sp.preview); } catch (e) { if (!(e instanceof NotFoundError)) throw e; } }
  return (
    <>
      <PageHeader title="Import and export" sub="Bring in existing teaching material as a DRAFT. Imported text is never published automatically and every import is previewed first." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="text-lg">Import a curriculum document</h2>
          <p className="mt-1 text-sm text-mist">Word (.docx), PDF with selectable text, or plain text. Put each lesson under a heading like <code>Week 1: Title</code> or <code>Lesson 1: Title</code>. Scanned PDFs need OCR first and are reported clearly if they cannot be read. Maximum 8 MB.</p>
          <ActionForm action={importPreviewAction} submit="Upload and preview" className="mt-3"><input type="file" name="file" accept=".docx,.pdf,.txt,.md" className="input" required aria-label="Document to import" /></ActionForm></Card>
        <Card><h2 className="text-lg">Export</h2><p className="mt-1 text-sm text-mist">Open a curriculum version and use the <strong>Preview and export</strong> tab to download the teacher&apos;s guide or student notes (.docx), or print any lesson to PDF. Question banks can be imported from CSV on the version&apos;s <strong>Question bank</strong> tab.</p></Card>
      </div>
      {imp && (
        <Card className="mt-6"><h2 className="text-lg">Preview: {imp.filename}</h2>
          <p className="text-sm text-mist">{imp.preview.characters.toLocaleString()} characters read from a {imp.preview.format} file. {imp.preview.weeks.length} lesson heading(s) found.</p>
          {imp.warnings.map((w) => <div key={w} className="mt-2"><Alert tone="warn">{w}</Alert></div>)}
          <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-line"><table className="table"><thead><tr><th>Week</th><th>Title</th><th>Characters</th><th>Scripture found</th><th>Notes</th></tr></thead><tbody>
            {imp.preview.weeks.map((w, i) => <tr key={i}><td>{w.week}</td><td>{w.title}</td><td>{w.text.length.toLocaleString()}</td><td className="text-xs">{w.scripture.join("; ") || "–"}</td><td className="text-xs text-danger">{w.flags.join(" ")}</td></tr>)}
          </tbody></table></div>
          {imp.status === "saved_as_draft" ? <div className="mt-3"><Badge tone="ok">Already saved as a draft</Badge></div> : imp.preview.weeks.length > 0 && (
            <ActionForm action={importSaveAction} submit="Save as a draft curriculum" className="mt-3"><input type="hidden" name="importId" value={imp.id} /><div><label className="label" htmlFor="title">Curriculum title</label><input id="title" name="title" className="input" defaultValue={imp.preview.title} /></div><p className="hint">The text is filed under each lesson&apos;s introduction for you to restructure into teaching points, discussion questions and so on. It must pass the completeness checks and be reviewed before it can be published.</p></ActionForm>
          )}
        </Card>
      )}
    </>
  );
}
