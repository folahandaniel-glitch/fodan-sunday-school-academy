import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requirePlatform } from "@/server/guards";
import { getDb, schema } from "@/server/db";
import { EDITABLE } from "@/server/services/curriculum";
import { ActionButton, ActionForm } from "@/components/forms";
import { deleteQuestionAction, importQuestionsAction, saveQuestionAction } from "@/app/actions/admin";
import { Badge, Card, Empty, PageHeader, Pagination } from "@/components/ui";
import { VersionTabs } from "@/components/version-tabs";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@/lib/lesson-types";

export const metadata: Metadata = { title: "Question bank" };
export const dynamic = "force-dynamic";

export default async function Questions({ params, searchParams }: { params: Promise<{ id: string; versionId: string }>; searchParams: Promise<{ week?: string; page?: string }> }) {
  await requirePlatform("curriculum.write");
  const { id, versionId } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const [v] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, versionId));
  if (!v || v.curriculumId !== id) notFound();
  const editable = (EDITABLE as readonly string[]).includes(v.status);
  const week = sp.week ? Number(sp.week) : undefined, page = Math.max(1, Number(sp.page) || 1), ps = 30;
  const where = and(eq(schema.questions.versionId, versionId), week ? eq(schema.questions.weekNumber, week) : undefined);
  const all = await db.select().from(schema.questions).where(where).orderBy(asc(schema.questions.weekNumber), asc(schema.questions.createdAt));
  const rows = all.slice((page - 1) * ps, page * ps);
  const keys = rows.length ? await db.select().from(schema.questionAnswerKeys).where(inArray(schema.questionAnswerKeys.questionId, rows.map((r) => r.id))) : [];
  const opts = rows.length ? await db.select().from(schema.questionOptions).where(inArray(schema.questionOptions.questionId, rows.map((r) => r.id))) : [];
  return (
    <>
      <PageHeader crumbs={[{ label: "Curriculum", href: `/admin/curricula/${id}` }, { label: `Version ${v.versionNumber}`, href: `/admin/curricula/${id}/v/${versionId}` }, { label: "Questions" }]} title="Question bank" sub={`${all.length} question(s). Answer keys and explanations are kept separate from student-facing data and are never sent to learners before release.`} />
      <VersionTabs id={id} versionId={versionId} current="questions" />
      <form className="mb-4 flex items-end gap-2" role="search"><div><label className="label" htmlFor="week">Filter by lesson week</label><input id="week" name="week" type="number" min={1} max={26} defaultValue={sp.week} className="input !w-32" /></div><button className="btn btn-light">Filter</button></form>
      {rows.length === 0 ? <Empty title="No questions yet" /> : (
        <ul className="space-y-3">
          {rows.map((q) => { const k = keys.find((x) => x.questionId === q.id); const o = opts.filter((x) => x.questionId === q.id).sort((a, b) => a.sortOrder - b.sortOrder); return (
            <li key={q.id} className="card card-pad">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-mist">Week {q.weekNumber ?? "–"} · {QUESTION_TYPE_LABELS[q.type as QuestionType]} · {q.difficulty} · {q.marks} {q.marks === 1 ? "mark" : "marks"} <Badge tone={q.reviewStatus === "reviewed" ? "ok" : "warn"}>{q.reviewStatus}</Badge></p>{editable && <ActionButton action={deleteQuestionAction} fields={{ versionId, id: q.id }} label="Delete" tone="danger" confirm="Delete this question?" />}</div>
              <p className="mt-1 font-semibold text-navy">{q.text}</p>
              {o.length > 0 && q.type !== "tf" && <ol className="mt-1 list-[upper-alpha] pl-6 text-sm">{o.map((x, i) => <li key={x.id} className={k?.config && "correct" in k.config && (k.config.type === "mcq" || k.config.type === "scripture_ref") && k.config.correct === i ? "font-semibold text-leaf" : ""}>{x.text}</li>)}</ol>}
              {k && <p className="mt-1 rounded-lg bg-gold-50 p-2 text-xs"><strong>Key:</strong> {JSON.stringify(k.config)}<br /><strong>Explanation / rubric:</strong> {k.explanation}</p>}
            </li>); })}
        </ul>
      )}
      <Pagination page={page} pageSize={ps} total={all.length} base={`/admin/curricula/${id}/v/${versionId}/questions`} params={{ week: sp.week }} />
      {editable && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <Card><h2 className="text-lg">Add a question</h2>
            <ActionForm action={saveQuestionAction} submit="Save question" className="mt-3" resetOnSuccess><input type="hidden" name="versionId" value={versionId} />
              <div className="grid grid-cols-3 gap-3"><div><label className="label" htmlFor="type">Type</label><select id="type" name="type" className="input">{(["mcq", "tf", "multi", "fill", "short", "essay", "scenario", "scripture_ref"] as QuestionType[]).map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}</select></div><div><label className="label" htmlFor="week2">Lesson week</label><input id="week2" name="week" type="number" min={1} max={26} className="input" required /></div><div><label className="label" htmlFor="marks">Marks</label><input id="marks" name="marks" type="number" min={1} max={20} defaultValue={1} className="input" /></div></div>
              <div><label className="label" htmlFor="text">Question</label><textarea id="text" name="text" className="input" rows={2} required minLength={8} /></div>
              <div><label className="label" htmlFor="options">Options (one per line; multiple choice and multi-select)</label><textarea id="options" name="options" className="input" rows={4} /></div>
              <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="correct">Correct option number (multiple choice)</label><input id="correct" name="correct" type="number" min={1} max={8} className="input" /></div><div><label className="label" htmlFor="correctMulti">Correct numbers (multi-select, e.g. 1,3)</label><input id="correctMulti" name="correctMulti" className="input" /></div>
                <div><label className="label" htmlFor="tfCorrect">True or false answer</label><select id="tfCorrect" name="tfCorrect" className="input"><option value="true">True</option><option value="false">False</option></select></div><div><label className="label" htmlFor="difficulty">Difficulty</label><select id="difficulty" name="difficulty" className="input" defaultValue="medium"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div></div>
              <div><label className="label" htmlFor="accepted">Accepted answers (fill in the blank, one per line)</label><textarea id="accepted" name="accepted" className="input" rows={2} /></div>
              <div><label className="label" htmlFor="keywords">Key points or keywords (short answer and essay, one per line)</label><textarea id="keywords" name="keywords" className="input" rows={3} /></div>
              <div><label className="label" htmlFor="rubric">Marking rubric (written answers)</label><textarea id="rubric" name="rubric" className="input" rows={2} /></div>
              <div><label className="label" htmlFor="explanation">Explanation (shown after release)</label><textarea id="explanation" name="explanation" className="input" rows={2} /></div>
              <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="scriptureRef">Scripture reference</label><input id="scriptureRef" name="scriptureRef" className="input" /></div><div><label className="label" htmlFor="tags">Topic tags</label><input id="tags" name="tags" className="input" /></div></div>
            </ActionForm></Card>
          <Card><h2 className="text-lg">Import from CSV</h2><p className="text-sm text-mist">Columns: week, type (mcq, tf, fill, short), question, option1 to option4, correct, explanation, difficulty, marks, scripture, keywords. <a href="/api/export/question-template">Download the template</a>.</p>
            <ActionForm action={importQuestionsAction} submit="Import questions" className="mt-3"><input type="hidden" name="versionId" value={versionId} /><input type="file" name="file" accept=".csv,text/csv" className="input" required aria-label="CSV file" /></ActionForm></Card>
        </div>
      )}
    </>
  );
}
