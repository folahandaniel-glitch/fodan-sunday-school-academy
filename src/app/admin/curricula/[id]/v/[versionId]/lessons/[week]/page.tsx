import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { eq, and } from "drizzle-orm";
import { requirePlatform } from "@/server/guards";
import { getDb, schema } from "@/server/db";
import { asLessonLike, EDITABLE } from "@/server/services/curriculum";
import { ActionForm } from "@/components/forms";
import { saveLessonAction } from "@/app/actions/admin";
import { Alert, Card, PageHeader } from "@/components/ui";
import { validateLesson } from "@/lib/completeness";
import { ScriptureBlock } from "@/components/scripture";
import { parseRange } from "@/lib/bible";

export const metadata: Metadata = { title: "Lesson editor" };
export const dynamic = "force-dynamic";

const T = ({ name, label, rows = 4, value, hint }: { name: string; label: string; rows?: number; value: string; hint?: string }) => (<div><label className="label" htmlFor={name}>{label}</label><textarea id={name} name={name} rows={rows} className="input" defaultValue={value} />{hint && <p className="hint">{hint}</p>}</div>);

export default async function LessonEditor({ params }: { params: Promise<{ id: string; versionId: string; week: string }> }) {
  await requirePlatform("curriculum.write");
  const { id, versionId, week } = await params;
  const db = await getDb();
  const [row] = await db.select({ l: schema.curriculumLessons, v: schema.curriculumVersions }).from(schema.curriculumLessons).innerJoin(schema.curriculumVersions, eq(schema.curriculumVersions.id, schema.curriculumLessons.versionId)).where(and(eq(schema.curriculumLessons.versionId, versionId), eq(schema.curriculumLessons.weekNumber, Number(week))));
  if (!row || row.v.curriculumId !== id) notFound();
  const { l, v } = row, c = l.content;
  const editable = (EDITABLE as readonly string[]).includes(v.status);
  const problems = validateLesson(asLessonLike(l));
  const rows = (arr: unknown[], extra: number) => Array.from({ length: Math.min(8, arr.length + extra) }, (_, i) => i);
  return (
    <>
      <PageHeader crumbs={[{ label: "Curriculum library", href: "/admin/curricula" }, { label: "Version", href: `/admin/curricula/${id}/v/${versionId}` }, { label: `Week ${l.weekNumber}` }]} title={`Week ${l.weekNumber}: ${l.title}`} sub={`Unit type: ${l.unitKind}`} />
      {!editable && <div className="mb-4"><Alert tone="info">This version is frozen. You are viewing the lesson; it cannot be edited.</Alert></div>}
      {problems.length > 0 && <div className="mb-4"><Alert tone="warn"><strong>To complete this lesson:</strong><ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul></Alert></div>}
      <ActionForm action={saveLessonAction} submit="Save lesson" hideSubmit={!editable}>
        <fieldset disabled={!editable} className="space-y-6">
          <input type="hidden" name="versionId" value={versionId} /><input type="hidden" name="week" value={l.weekNumber} />
          <Card><h2 className="text-lg">Lesson identity</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><label className="label" htmlFor="title">Title</label><input id="title" name="title" className="input" defaultValue={l.title} /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="theme">Central theme</label><input id="theme" name="theme" className="input" defaultValue={l.theme} /></div>
              <div className="sm:col-span-2"><T name="summary" label="Lesson summary" rows={3} value={l.summary} /></div>
              <div><T name="primaryScripture" label="Primary Scripture references (one per line)" rows={3} value={l.primaryScripture.join("\n")} hint="Example: John 3:1-17. References are checked against the Bible text." /></div>
              <div><T name="additionalScripture" label="Additional Scripture references" rows={3} value={l.additionalScripture.join("\n")} /></div>
              <div><label className="label" htmlFor="memoryVerse">Memory verse (reference only)</label><input id="memoryVerse" name="memoryVerse" className="input" defaultValue={l.memoryVerse} /><p className="hint">Do not type the verse. Its text is shown from the Bible.</p></div>
              <div><label className="label" htmlFor="durationMinutes">Estimated duration (minutes)</label><input id="durationMinutes" name="durationMinutes" type="number" min={20} max={120} className="input" defaultValue={l.durationMinutes} /></div></div></Card>
          <Card><h2 className="text-lg">Objectives and key terms</h2><div className="mt-3 space-y-3">
            <T name="objectives" label="Learning objectives (one per line, at least 3)" rows={4} value={l.objectives.join("\n")} />
            {rows(l.keyTerms, 2).map((i) => (<div key={i} className="grid gap-2 sm:grid-cols-[1fr_3fr]"><div><label className="label" htmlFor={`kt_t_${i}`}>Key term {i + 1}</label><input id={`kt_t_${i}`} name={`kt_t_${i}`} className="input" defaultValue={l.keyTerms[i]?.term ?? ""} /></div><div><label className="label" htmlFor={`kt_m_${i}`}>Meaning</label><input id={`kt_m_${i}`} name={`kt_m_${i}`} className="input" defaultValue={l.keyTerms[i]?.meaning ?? ""} /></div></div>))}</div></Card>
          <Card><h2 className="text-lg">Teaching notes</h2><div className="mt-3 space-y-3">
            <T name="introduction" label="Introduction" rows={5} value={c.introduction} /><T name="context" label="Biblical and historical context" rows={5} value={c.context} /><T name="observations" label="Exegetical observations" rows={5} value={c.observations} />
            {rows(c.teachingPoints, 2).map((i) => (<div key={i} className="rounded-xl border border-line p-3"><label className="label" htmlFor={`tp_h_${i}`}>Teaching point {i + 1}: heading</label><input id={`tp_h_${i}`} name={`tp_h_${i}`} className="input" defaultValue={c.teachingPoints[i]?.heading ?? ""} /><label className="label mt-2" htmlFor={`tp_b_${i}`}>Explanation</label><textarea id={`tp_b_${i}`} name={`tp_b_${i}`} rows={5} className="input" defaultValue={c.teachingPoints[i]?.body ?? ""} /></div>))}</div></Card>
          <Card><h2 className="text-lg">Discussion</h2><div className="mt-3 space-y-3">
            {rows(c.discussion, 2).map((i) => (<div key={i} className="rounded-xl border border-line p-3"><label className="label" htmlFor={`dq_q_${i}`}>Question {i + 1}</label><input id={`dq_q_${i}`} name={`dq_q_${i}`} className="input" defaultValue={c.discussion[i]?.q ?? ""} /><label className="label mt-2" htmlFor={`dq_g_${i}`}>Suggested answer or facilitator guidance (teachers only)</label><textarea id={`dq_g_${i}`} name={`dq_g_${i}`} rows={3} className="input" defaultValue={c.discussion[i]?.guidance ?? ""} /></div>))}</div></Card>
          <Card><h2 className="text-lg">Application, activity and assessment</h2><div className="mt-3 space-y-3">
            <T name="application" label="Practical application" rows={4} value={c.application} /><T name="activity" label="Group activity or reflection exercise" rows={4} value={c.activity} /><T name="takeHome" label="Take-home assignment" rows={3} value={c.takeHome} /><T name="prayer" label="Prayer or reflection points" rows={3} value={c.prayer} /><T name="teacherGuidance" label="Teacher guidance (teachers only)" rows={4} value={c.teacherGuidance} /><T name="assessmentNote" label="Weekly assessment blueprint (what the weekly check covers)" rows={2} value={c.assessmentNote} /><T name="supplementary" label="Recommended supplementary materials (one per line)" rows={3} value={c.supplementary.join("\n")} /></div></Card>
        </fieldset>
      </ActionForm>
      <h2 className="mb-2 mt-8 text-lg">Scripture preview</h2>
      <ScriptureBlock refs={[...l.primaryScripture.filter((r) => parseRange(r)), ...(l.memoryVerse && parseRange(l.memoryVerse) ? [l.memoryVerse] : [])]} compact />
    </>
  );
}
