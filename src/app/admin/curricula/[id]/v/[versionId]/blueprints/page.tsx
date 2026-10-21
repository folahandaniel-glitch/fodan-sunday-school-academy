import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { requirePlatform } from "@/server/guards";
import { getDb, schema } from "@/server/db";
import { EDITABLE } from "@/server/services/curriculum";
import { ActionForm } from "@/components/forms";
import { saveBlueprintAction } from "@/app/actions/admin";
import { Badge, Card, PageHeader } from "@/components/ui";
import { VersionTabs } from "@/components/version-tabs";

export const metadata: Metadata = { title: "Assessment blueprints" };
export const dynamic = "force-dynamic";

export default async function Blueprints({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  await requirePlatform("curriculum.write");
  const { id, versionId } = await params;
  const db = await getDb();
  const [v] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, versionId));
  if (!v || v.curriculumId !== id) notFound();
  const bps = await db.select().from(schema.assessmentBlueprints).where(eq(schema.assessmentBlueprints.versionId, versionId));
  const editable = (EDITABLE as readonly string[]).includes(v.status);
  return (
    <>
      <PageHeader crumbs={[{ label: "Curriculum", href: `/admin/curricula/${id}` }, { label: `Version ${v.versionNumber}`, href: `/admin/curricula/${id}/v/${versionId}` }, { label: "Blueprints" }]} title="Assessment blueprints" sub="The default mid-session test (weeks 1 to 12) and final examination (both halves). Churches can adjust dates, durations and pass marks locally." />
      <VersionTabs id={id} versionId={versionId} current="blueprints" />
      <div className="grid gap-4 lg:grid-cols-2">
        {(["midtest", "final"] as const).map((kind) => {
          const bp = bps.find((b) => b.kind === kind); const cfg = bp?.config;
          const n = (t: string) => cfg?.types.find((x) => x.type === t);
          return (
            <Card key={kind}><h2 className="text-lg">{kind === "midtest" ? "Mid-session test (week 13)" : "Final examination (week 25)"} {bp && <Badge tone={bp.reviewStatus === "reviewed" ? "ok" : "warn"}>{bp.reviewStatus}</Badge>}</h2>
              <p className="text-xs text-mist">Covers weeks {kind === "midtest" ? "1 to 12" : "1 to 12 and 14 to 24"}.</p>
              <fieldset disabled={!editable}>
                <ActionForm action={saveBlueprintAction} submit="Save blueprint" hideSubmit={!editable} className="mt-3"><input type="hidden" name="versionId" value={versionId} /><input type="hidden" name="kind" value={kind} />
                  <div className="grid grid-cols-3 gap-3"><div><label className="label" htmlFor={`${kind}mcq`}>Multiple choice</label><input id={`${kind}mcq`} name="mcq" type="number" min={0} className="input" defaultValue={n("mcq")?.count ?? 0} /></div><div><label className="label" htmlFor={`${kind}tf`}>True/false</label><input id={`${kind}tf`} name="tf" type="number" min={0} className="input" defaultValue={n("tf")?.count ?? 0} /></div><div><label className="label" htmlFor={`${kind}short`}>Short answer</label><input id={`${kind}short`} name="short" type="number" min={0} className="input" defaultValue={n("short")?.count ?? 0} /></div></div>
                  <div className="grid grid-cols-4 gap-3"><div><label className="label" htmlFor={`${kind}sm`}>Marks per short</label><input id={`${kind}sm`} name="shortMarks" type="number" min={1} className="input" defaultValue={n("short")?.marksEach ?? 5} /></div><div><label className="label" htmlFor={`${kind}d`}>Minutes</label><input id={`${kind}d`} name="duration" type="number" min={5} className="input" defaultValue={cfg?.durationMinutes ?? 45} /></div><div><label className="label" htmlFor={`${kind}p`}>Pass %</label><input id={`${kind}p`} name="pass" type="number" min={1} max={100} className="input" defaultValue={cfg?.passPercent ?? 50} /></div><div><span className="label">Total marks</span><p className="input !flex items-center bg-gray-50">{cfg?.totalMarks ?? 0}</p></div></div>
                  <div className="grid grid-cols-3 gap-3"><div><label className="label" htmlFor={`${kind}e`}>Easy %</label><input id={`${kind}e`} name="easy" type="number" className="input" defaultValue={cfg?.difficulty.easy ?? 30} /></div><div><label className="label" htmlFor={`${kind}m`}>Medium %</label><input id={`${kind}m`} name="medium" type="number" className="input" defaultValue={cfg?.difficulty.medium ?? 50} /></div><div><label className="label" htmlFor={`${kind}h`}>Hard %</label><input id={`${kind}h`} name="hard" type="number" className="input" defaultValue={cfg?.difficulty.hard ?? 20} /></div></div>
                  <div><label className="label" htmlFor={`${kind}o`}>Learning outcomes assessed (one per line)</label><textarea id={`${kind}o`} name="outcomes" className="input" rows={3} defaultValue={cfg?.outcomes.join("\n")} /></div>
                  <div><label className="label" htmlFor={`${kind}t`}>Topics covered (one per line)</label><textarea id={`${kind}t`} name="topics" className="input" rows={4} defaultValue={cfg?.topics.join("\n")} /></div>
                </ActionForm></fieldset></Card>);
        })}
      </div>
    </>
  );
}
