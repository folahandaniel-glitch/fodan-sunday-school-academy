import Link from "next/link";
import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { completenessReport } from "@/server/services/curriculum";
import { Badge, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { PrintButton } from "@/components/forms";

export const metadata: Metadata = { title: "Content completeness report" };
export const dynamic = "force-dynamic";

export default async function Completeness({ searchParams }: { searchParams: Promise<{ deep?: string }> }) {
  await requirePlatform("curriculum.write");
  const deep = (await searchParams).deep === "1";
  const { rows, totals } = await completenessReport({ deepScripture: deep });
  return (
    <>
      <PageHeader title="Content completeness report" sub="Is every lesson real teaching material? Each unit is checked for minimum size in every required section, valid Scripture references, placeholder text and repeated paragraphs." actions={<><Link className="btn btn-light btn-sm" href={deep ? "/admin/completeness" : "/admin/completeness?deep=1"}>{deep ? "Hide Scripture detail" : "Check every Scripture reference"}</Link><PrintButton /></>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Lesson units complete" value={`${totals.lessonsComplete.toLocaleString()} / ${totals.lessonsExpected.toLocaleString()}`} sub="50 curricula × 26 weeks" />
        <Stat label="Curricula with content" value={`${totals.withContent} / ${totals.curricula}`} /><Stat label="Pass every check" value={totals.passing} /><Stat label="Published to churches" value={totals.published} /><Stat label="Teaching words" value={totals.words.toLocaleString()} />
      </div>
      <p className="mt-4 text-sm text-mist">Passing the checks means the material is structurally complete. It is <strong>not</strong> a theological review: that is a separate human step in the Content review queue.</p>
      <div className="card mt-4 overflow-x-auto"><table className="table"><caption className="sr-only">Completeness by curriculum</caption><thead><tr><th>No.</th><th>Curriculum</th><th>Status</th><th>Units</th><th>Words</th><th>Questions</th><th>Weeks 1 to 26</th><th>Problems</th></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id}><td>{r.n}</td><td className="font-semibold"><Link href={r.versionId ? `/admin/curricula/${r.id}/v/${r.versionId}` : `/admin/curricula/${r.id}`}>{r.title}</Link></td><td><StatusBadge status={r.versionStatus ?? r.status} /></td><td>{r.lessonsComplete}/26</td><td>{r.words.toLocaleString()}</td><td>{r.questions}</td>
            <td><span className="flex gap-px" aria-label={`${r.lessonsComplete} of 26 weeks complete`}>{r.weekFlags.map((f, i) => <span key={i} title={`Week ${i + 1}`} className={`h-3 w-1.5 rounded-sm ${f === "ok" ? "bg-leaf" : "bg-gray-300"}`} />)}</span></td>
            <td className="max-w-sm text-xs">{r.ok ? <Badge tone="ok">none</Badge> : <ul className="list-disc pl-4 text-danger">{r.problems.slice(0, deep ? 12 : 2).map((p) => <li key={p}>{p}</li>)}</ul>}</td></tr>
        ))}
      </tbody></table></div>
    </>
  );
}
