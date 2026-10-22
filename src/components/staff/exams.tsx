import Link from "next/link";
import { ActionButton, ActionForm } from "@/components/forms";
import { addExamQuestionAction, closeExamAction, feedbackAction, generateExamAction, markAnswerAction, publishExamAction, publishResultsAction, removeExamQuestionAction, updateExamAction } from "@/app/actions/staff";
import { Alert, Badge, Card, Empty, PageHeader, Stat, StatusBadge, Table } from "@/components/ui";
import { attemptForMarking, examProblems, examQuestionsForStaff, examResults, listExams, markingQueue, poolFor } from "@/server/services/exams";
import { listProgrammes } from "@/server/services/schedule";
import { listClasses } from "@/server/services/church";
import { QUESTION_TYPE_LABELS } from "@/lib/lesson-types";
import { can, type OrgCtx } from "@/server/org";
import { fmtDateTime } from "@/lib/text";
import { getDb, schema } from "@/server/db";
import { eq, inArray } from "drizzle-orm";

const toLocal = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export async function ExamsIndex({ ctx, base }: { ctx: OrgCtx; base: string }) {
  const [rows, progs] = await Promise.all([listExams(ctx), listProgrammes(ctx)]);
  const active = progs.filter((p) => p.a.status === "active");
  return (
    <>
      <PageHeader title="Assessments" sub="Mid-session test (default week 13), final examination (default week 25) and revision quizzes. Generate a draft from the approved question bank, review it, then publish." />
      {rows.length === 0 ? <Empty title="No tests or examinations yet" action={<div className="flex flex-wrap justify-center gap-2"><Link className="btn btn-primary" href={`${base}/sessions`}>Open a programme</Link><Link className="btn btn-light" href={`${base}/library`}>Choose a curriculum</Link></div>}>Tests and examinations belong to a programme. Activate a programme first, then open it to draft the mid-session test (week 13) or the final examination (week 25) from the approved question bank.</Empty> : (
        <Table caption="Examinations"><thead><tr><th>Title</th><th>Programme</th><th>Type</th><th>Marks</th><th>Attempts</th><th>To mark</th><th>Status</th></tr></thead><tbody>
          {rows.map((r) => (<tr key={r.e.id}><td><Link className="font-semibold" href={`${base}/exams/${r.e.id}`}>{r.e.title}</Link></td><td>{r.programme}</td><td>{r.e.kind}</td><td>{r.e.totalMarks}</td><td>{r.attempts}</td><td>{r.pending ? <Badge tone="warn">{r.pending}</Badge> : "–"}</td><td><StatusBadge status={r.e.status} /></td></tr>))}
        </tbody></Table>
      )}
      {can(ctx, "exams.manage") && (
        <Card className="mt-6"><h2 className="text-lg">Draft a new test or examination</h2>
          {active.length === 0 ? <p className="mt-2 text-sm text-mist">Activate a programme first.</p> : (
            <ActionForm action={generateExamAction} submit="Generate draft" className="mt-2"><input type="hidden" name="base" value={base} />
              <div className="grid gap-3 sm:grid-cols-2"><div><label className="label" htmlFor="g-prog">Programme</label><select id="g-prog" name="assignmentId" className="input">{active.map((p) => <option key={p.a.id} value={p.a.id}>{p.title} · {p.s.name}</option>)}</select></div>
                <div><label className="label" htmlFor="g-kind">Type</label><select id="g-kind" name="kind" className="input"><option value="midtest">Mid-session test (weeks 1 to 12)</option><option value="final">Final examination (both halves)</option><option value="practice">Revision practice quiz</option></select></div></div>
              <p className="hint">Questions are drawn from the approved bank following the curriculum&apos;s blueprint. You can review and swap questions before publishing.</p></ActionForm>
        )}</Card>
      )}
    </>
  );
}

export async function ExamDetail({ ctx, id, base }: { ctx: OrgCtx; id: string; base: string }) {
  const db = await getDb();
  const [e] = await db.select().from(schema.examinations).where(eq(schema.examinations.id, id));
  const [qs, problems, res, classes] = await Promise.all([examQuestionsForStaff(ctx, id), examProblems(ctx, id), examResults(ctx, id), listClasses(ctx)]);
  const draft = e.status === "draft";
  const pool = draft ? await poolFor(ctx, e.assignmentId) : [];
  const inExam = new Set(qs.map((q) => q.q.id));
  const spare = pool.filter((p) => !inExam.has(p.id));
  const spareQs = spare.length ? await db.select({ id: schema.questions.id, text: schema.questions.text, week: schema.questions.weekNumber, type: schema.questions.type }).from(schema.questions).where(inArray(schema.questions.id, spare.slice(0, 80).map((s) => s.id))) : [];
  const byWeek = new Map<number, number>();
  for (const q of qs) byWeek.set(q.q.weekNumber ?? 0, (byWeek.get(q.q.weekNumber ?? 0) ?? 0) + 1);
  return (
    <>
      <PageHeader crumbs={[{ label: "Assessments", href: `${base}/exams` }, { label: e.title }]} title={e.title} sub={`${e.kind} · ${qs.length} questions · ${e.totalMarks} marks`} actions={<StatusBadge status={e.status} />} />
      <div className="grid gap-4 sm:grid-cols-4"><Stat label="Attempts submitted" value={res.stats.count} /><Stat label="Average" value={`${res.stats.average}%`} /><Stat label="Pass rate" value={`${res.stats.passRate}%`} /><Stat label="Highest / lowest" value={`${res.stats.highest} / ${res.stats.lowest}`} /></div>

      {draft && problems.length > 0 && <div className="mt-4"><Alert tone="warn"><strong>Before publishing:</strong> {problems.join(" ")}</Alert></div>}
      {can(ctx, "exams.manage") && (
        <Card className="mt-4"><h2 className="text-lg">Settings</h2>
          <ActionForm action={updateExamAction} submit="Save settings" className="mt-2"><input type="hidden" name="id" value={id} />
            <div className="grid gap-3 sm:grid-cols-2"><div><label className="label" htmlFor="x-title">Title</label><input id="x-title" name="title" className="input" defaultValue={e.title} required /></div>
              <div><label className="label" htmlFor="x-dur">Duration (minutes)</label><input id="x-dur" name="durationMinutes" type="number" min={1} max={360} className="input" defaultValue={Math.round(e.durationSeconds / 60)} /></div></div>
            <div><label className="label" htmlFor="x-ins">Instructions for learners</label><textarea id="x-ins" name="instructions" className="input" rows={3} defaultValue={e.instructions} /></div>
            <div className="grid gap-3 sm:grid-cols-4"><div><label className="label" htmlFor="x-pass">Pass mark %</label><input id="x-pass" name="passPercent" type="number" min={1} max={100} className="input" defaultValue={e.passPercent} /></div>
              <div><label className="label" htmlFor="x-att">Attempts</label><input id="x-att" name="attemptLimit" type="number" min={1} max={10} className="input" defaultValue={e.attemptLimit} /></div>
              <div><label className="label" htmlFor="x-open">Opens</label><input id="x-open" name="opensAt" type="datetime-local" className="input" defaultValue={toLocal(e.opensAt)} /></div>
              <div><label className="label" htmlFor="x-close">Closes</label><input id="x-close" name="closesAt" type="datetime-local" className="input" defaultValue={toLocal(e.closesAt)} /></div></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className="label" htmlFor="x-rp">Result release</label><select id="x-rp" name="resultPolicy" className="input" defaultValue={e.resultPolicy}><option value="immediate">Immediately (objective tests only)</option><option value="after_review">After written answers are marked</option><option value="manual">Only when I release them</option></select></div>
              <div><label className="label" htmlFor="x-rv">Show correct answers</label><select id="x-rv" name="reviewPolicy" className="input" defaultValue={e.reviewPolicy}><option value="never">Never</option><option value="after_publish">After the result is released</option><option value="after_close">After the examination closes</option></select></div>
              <div><label className="label" htmlFor="x-late">Late submissions</label><select id="x-late" name="latePolicy" className="input" defaultValue={e.latePolicy}><option value="reject">Submit at the deadline</option><option value="accept_flagged">Accept and flag</option></select></div></div>
            <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" name="shuffleQuestions" defaultChecked={e.shuffleQuestions} className="h-4 w-4" /> Shuffle question order</label><label className="flex items-center gap-2"><input type="checkbox" name="shuffleOptions" defaultChecked={e.shuffleOptions} className="h-4 w-4" /> Shuffle answer options</label></div>
            <fieldset><legend className="label">Eligible classes (none ticked = every class on the programme)</legend><div className="flex flex-wrap gap-3 text-sm">{classes.map((c) => <label key={c.id} className="flex items-center gap-2"><input type="checkbox" name="classIds" value={c.id} defaultChecked={e.classIds.includes(c.id)} className="h-4 w-4" /> {c.name}</label>)}</div></fieldset>
          </ActionForm>
          <div className="mt-4 flex flex-wrap gap-2">
            {draft && <ActionButton action={publishExamAction} fields={{ id }} label="Publish examination" tone="gold" confirm="Publish this examination to learners? Make sure you have reviewed the questions." />}
            {e.status === "published" && <ActionButton action={closeExamAction} fields={{ id }} label="Close examination" tone="danger" confirm="Close this examination now?" />}
          </div></Card>
      )}

      <Card className="mt-4"><h2 className="text-lg">Questions ({qs.length}) <span className="text-sm font-normal text-mist">· staff view with answer key</span></h2>
        <p className="text-xs text-mist">Coverage by lesson week: {[...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([w, c]) => `W${w}: ${c}`).join(", ")}</p>
        <ol className="mt-3 space-y-3">
          {qs.map((q, i) => (
            <li key={q.eqId} className="rounded-xl border border-line p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-mist"><strong className="text-navy">{i + 1}.</strong> Week {q.q.weekNumber} · {QUESTION_TYPE_LABELS[q.q.type]} · {q.q.difficulty} · {q.marks} {q.marks === 1 ? "mark" : "marks"}</p>{draft && can(ctx, "exams.manage") && <ActionButton action={removeExamQuestionAction} fields={{ id, eqId: q.eqId }} label="Remove" />}</div>
              <p className="mt-1 font-semibold text-navy">{q.q.text}</p>
              {q.key && <p className="mt-1 rounded-lg bg-gold-50 p-2 text-xs"><strong>Key:</strong> {JSON.stringify(q.key.config).slice(0, 300)} <br /><strong>Explanation / rubric:</strong> {q.key.explanation}</p>}</li>
          ))}
        </ol>
        {draft && spareQs.length > 0 && (
          <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-brand">Add a question from the approved bank ({spare.length} available)</summary>
            <ul className="mt-2 max-h-72 space-y-2 overflow-auto">{spareQs.map((q) => <li key={q.id} className="flex items-start justify-between gap-2 text-sm"><span>Week {q.week} · {q.text}</span><ActionButton action={addExamQuestionAction} fields={{ id, questionId: q.id }} label="Add" /></li>)}</ul></details>
        )}
      </Card>

      <Card className="mt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">Results</h2>{can(ctx, "results.publish") && <ActionButton action={publishResultsAction} fields={{ id }} label="Release results to learners" tone="gold" confirm="Release all marked results for this examination to learners?" />}</div>
        {res.rows.length === 0 ? <p className="mt-2 text-sm text-mist">No submissions yet.</p> : (
          <div className="mt-2 overflow-x-auto"><table className="table"><thead><tr><th>Learner</th><th>Attempt</th><th>Score</th><th>%</th><th>Grade</th><th>Outcome</th><th>Marking</th><th>Released</th></tr></thead><tbody>
            {res.rows.map((r) => (<tr key={r.r.id}><td className="font-semibold">{r.name}</td><td>{r.attemptNumber}</td><td>{r.r.awardedMarks}/{r.r.totalMarks}</td><td>{r.r.percentage.toFixed(1)}</td><td>{r.r.grade}</td><td><StatusBadge status={r.r.passStatus} /></td><td><StatusBadge status={r.grading} /></td><td><StatusBadge status={r.r.publicationStatus} /></td></tr>))}
          </tbody></table></div>
        )}</Card>
    </>
  );
}

export async function GradingQueue({ ctx, base }: { ctx: OrgCtx; base: string }) {
  const rows = await markingQueue(ctx);
  return (
    <>
      <PageHeader title="Grading queue" sub="Written answers waiting for a teacher. Short answers show the key points to look for; a doctrinally careful answer that differs from the model answer is not wrong." />
      {rows.length === 0 ? <Empty title="Nothing waiting to be marked" action={<Link className="btn btn-light" href={`${base}/exams`}>Go to Assessments</Link>}>Written answers appear here after learners submit an examination that includes short-answer or essay questions. Objective questions are marked automatically.</Empty> : (
        <Table caption="Attempts to mark"><thead><tr><th>Learner</th><th>Examination</th><th>Submitted</th><th>Answers to mark</th><th /></tr></thead><tbody>
          {rows.map((r) => (<tr key={r.attemptId}><td className="font-semibold">{r.learner}</td><td>{r.exam}</td><td>{fmtDateTime(r.submittedAt, ctx.timezone)}</td><td>{r.pending}</td><td><Link className="btn btn-primary btn-sm" href={`${base}/grading/${r.attemptId}`}>Mark</Link></td></tr>))}
        </tbody></Table>
      )}
    </>
  );
}

export async function GradingAttempt({ ctx, attemptId, base }: { ctx: OrgCtx; attemptId: string; base: string }) {
  const d = await attemptForMarking(ctx, attemptId);
  const db = await getDb();
  const [r] = await db.select().from(schema.assessmentResults).where(eq(schema.assessmentResults.attemptId, attemptId));
  const written = d.items.filter((i) => !["mcq", "tf", "multi", "scripture_ref", "matching"].includes(i.type) || i.reviewStatus === "pending");
  return (
    <>
      <PageHeader crumbs={[{ label: "Grading queue", href: `${base}/grading` }, { label: d.learner }]} title={`${d.learner}: ${d.exam.title}`} sub={`Attempt ${d.attempt.attemptNumber} · score so far ${d.attempt.score ?? 0} / ${d.exam.totalMarks}`} actions={<StatusBadge status={d.attempt.gradingStatus} />} />
      <div className="space-y-4">
        {written.map((i) => (
          <Card key={i.eqId}><p className="text-xs text-mist">{QUESTION_TYPE_LABELS[i.type as keyof typeof QUESTION_TYPE_LABELS]} · {i.marks} marks</p><p className="mt-1 font-semibold text-navy">{i.text}</p>
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-ivory p-3 text-sm">{i.given ?? <em>No answer given</em>}</p>
            <div className="mt-2 rounded-lg bg-gold-50 p-3 text-xs"><strong>Marking guide:</strong> {i.rubric ?? i.explanation}{i.keyPoints && <><br /><strong>Look for:</strong> {i.keyPoints.join(", ")}</>}{i.suggested !== null && <><br /><strong>Keyword match suggests:</strong> {i.suggested} / {i.marks} (a suggestion only)</>}</div>
            <ActionForm action={markAnswerAction} submit={i.reviewStatus === "reviewed" ? "Update mark" : "Save mark"} className="mt-3"><input type="hidden" name="attemptId" value={attemptId} /><input type="hidden" name="eqId" value={i.eqId} />
              <div className="grid gap-3 sm:grid-cols-[9rem_1fr]"><div><label className="label" htmlFor={`m${i.eqId}`}>Marks / {i.marks}</label><input id={`m${i.eqId}`} name="marks" type="number" step="0.5" min={0} max={i.marks} className="input" required defaultValue={i.awarded ?? i.suggested ?? ""} /></div><div><label className="label" htmlFor={`f${i.eqId}`}>Feedback to the learner</label><input id={`f${i.eqId}`} name="feedback" className="input" maxLength={1500} defaultValue={i.feedback} /></div></div></ActionForm></Card>
        ))}
        {written.length === 0 && <Empty title="Everything on this attempt has been marked" />}
      </div>
      {r && (<Card className="mt-6"><h2 className="text-lg">Overall feedback</h2><ActionForm action={feedbackAction} submit="Save feedback" className="mt-2"><input type="hidden" name="resultId" value={r.id} /><textarea name="content" className="input" rows={3} required maxLength={2000} aria-label="Overall feedback" /><p className="hint">Shown to the learner once the result is released.</p></ActionForm></Card>)}
    </>
  );
}
