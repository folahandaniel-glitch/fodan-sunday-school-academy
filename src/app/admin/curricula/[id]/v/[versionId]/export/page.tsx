import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { eq, asc } from "drizzle-orm";
import { requirePlatform } from "@/server/guards";
import { getDb, schema } from "@/server/db";
import { previewLessonView } from "@/server/services/curriculum";
import { LessonBody } from "@/components/lesson-view";
import { Alert, Card, PageHeader } from "@/components/ui";
import { VersionTabs } from "@/components/version-tabs";
import { PrintButton } from "@/components/forms";

export const metadata: Metadata = { title: "Preview and export" };
export const dynamic = "force-dynamic";

export default async function ExportPage({ params, searchParams }: { params: Promise<{ id: string; versionId: string }>; searchParams: Promise<{ week?: string; as?: string }> }) {
  await requirePlatform("curriculum.write");
  const { id, versionId } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const [v] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, versionId));
  if (!v || v.curriculumId !== id) notFound();
  const lessons = await db.select({ w: schema.curriculumLessons.weekNumber, t: schema.curriculumLessons.title }).from(schema.curriculumLessons).where(eq(schema.curriculumLessons.versionId, versionId)).orderBy(asc(schema.curriculumLessons.weekNumber));
  const week = Number(sp.week) || 0, teacher = sp.as === "teacher";
  const view = week ? await previewLessonView(versionId, week, teacher) : null;
  const base = `/admin/curricula/${id}/v/${versionId}/export`;
  return (
    <>
      <PageHeader crumbs={[{ label: "Curriculum", href: `/admin/curricula/${id}` }, { label: `Version ${v.versionNumber}`, href: `/admin/curricula/${id}/v/${versionId}` }, { label: "Preview and export" }]} title="Preview and export" />
      <VersionTabs id={id} versionId={versionId} current="export" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="text-lg">Download</h2><p className="text-sm text-mist">Complete manuals as Word documents, with the Scripture text read from the Bible.</p>
          <div className="mt-3 flex flex-wrap gap-2"><Link className="btn btn-primary btn-sm" href={`/api/export/curriculum/${versionId}?mode=teacher`}>Teacher&apos;s guide (.docx)</Link><Link className="btn btn-light btn-sm" href={`/api/export/curriculum/${versionId}?mode=student`}>Student notes (.docx)</Link></div></Card>
        <Card><h2 className="text-lg">Preview a lesson</h2>
          <form className="mt-2 flex flex-wrap items-end gap-2" action={base}><div><label className="label" htmlFor="week">Week</label><select id="week" name="week" className="input" defaultValue={week || 1}>{lessons.map((l) => <option key={l.w} value={l.w}>{l.w}. {l.t}</option>)}</select></div><div><label className="label" htmlFor="as">View as</label><select id="as" name="as" className="input" defaultValue={sp.as ?? "learner"}><option value="learner">Learner</option><option value="teacher">Teacher</option></select></div><button className="btn btn-light">Preview</button></form></Card>
      </div>
      {view && (<div className="mt-8"><Alert tone="info">Preview as a {teacher ? "teacher (facilitator guidance and teacher notes visible)" : "learner (teacher-only material hidden)"}. <PrintButton label="Print this preview" /></Alert><div className="mt-6"><LessonBody v={view as never} /></div></div>)}
    </>
  );
}
