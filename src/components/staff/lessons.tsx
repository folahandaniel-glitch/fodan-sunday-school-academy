import Link from "next/link";
import { LessonBody } from "@/components/lesson-view";
import { ActionForm } from "@/components/forms";
import { attendanceAction, createAssignmentAction, deliveredAction, discussionAction, moderateResponseAction, releaseAction } from "@/app/actions/staff";
import { ActionButton, PrintButton } from "@/components/forms";
import { Badge, Card, Empty, PageHeader, StatusBadge } from "@/components/ui";
import { TranslationPicker } from "@/components/scripture";
import { attendanceSheet, deliveriesFor, discussionsFor, getLesson, lessonList, visibleAssignmentIds } from "@/server/services/teaching";
import { getProgramme } from "@/server/services/schedule";
import { getDb, schema } from "@/server/db";
import { and, eq, inArray } from "drizzle-orm";
import { can, teacherClassIds, type OrgCtx } from "@/server/org";
import { fmtDate } from "@/lib/text";
import { hasFeature } from "@/server/services/entitlements";
import type { TranslationId } from "@/lib/bible";

export async function LessonsIndex({ ctx, base }: { ctx: OrgCtx; base: string }) {
  const ids = await visibleAssignmentIds(ctx);
  const db = await getDb();
  const progs = ids.length ? await db.select({ id: schema.curriculumAssignments.id, title: schema.curricula.title, session: schema.academicSessions.name, status: schema.curriculumAssignments.status }).from(schema.curriculumAssignments)
    .innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumAssignments.curriculumId)).innerJoin(schema.academicSessions, eq(schema.academicSessions.id, schema.curriculumAssignments.sessionId))
    .where(and(eq(schema.curriculumAssignments.organizationId, ctx.orgId), inArray(schema.curriculumAssignments.id, ids), eq(schema.curriculumAssignments.status, "active"))) : [];
  const lists = await Promise.all(progs.map(async (p) => ({ p, lessons: await lessonList(ctx, p.id) })));
  return (
    <>
      <PageHeader title="Weekly lessons" sub="Open a lesson to read the teaching notes, record attendance, mark it delivered and run discussions." />
      {lists.length === 0 && <Empty title="No active programme yet" action={<div className="flex flex-wrap justify-center gap-2"><Link className="btn btn-primary" href={`${base}/library`}>Choose a curriculum</Link><Link className="btn btn-light" href={`${base}/sessions`}>Academic sessions</Link><Link className="btn btn-light" href={`${base}/classes`}>Classes</Link></div>}>Lessons appear here once a programme is active: 1) create a class and enrol learners, 2) choose a curriculum, 3) set the session dates and activate the programme. Its 26 weekly lessons, attendance sheets and discussions then open from this page.</Empty>}
      {lists.map(({ p, lessons }) => (
        <section key={p.id} className="mb-8"><h2 className="mb-2 text-xl">{p.title} <span className="text-sm font-normal text-mist">· {p.session}</span></h2>
          <ol className="divide-y divide-line rounded-xl border border-line bg-white">
            {lessons.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-sm text-gold" aria-hidden>{l.week}</span>
                <div className="min-w-0 flex-1"><Link className="font-semibold" href={`${base}/lessons/${l.id}`}>{l.title}</Link><p className="text-xs text-mist">{fmtDate(l.date)}{l.type !== "teaching" && ` · ${l.type === "midtest" ? "Mid-session test" : l.type === "final" ? "Final examination" : "Revision"}`}{l.combinedWithWeek && ` · shares a date with week ${l.combinedWithWeek}`}</p></div>
                <StatusBadge status={l.status} />
              </li>
            ))}
          </ol></section>
      ))}
    </>
  );
}

export async function LessonStaffPage({ ctx, id, base, tr = "bsb" }: { ctx: OrgCtx; id: string; base: string; tr?: TranslationId }) {
  const v = await getLesson(ctx, id);
  const allowed = await teacherClassIds(ctx);
  const db = await getDb();
  const classes = v.classIds.length ? await db.select({ id: schema.classes.id, name: schema.classes.name }).from(schema.classes).where(and(eq(schema.classes.organizationId, ctx.orgId), inArray(schema.classes.id, v.classIds))) : [];
  const mine = classes.filter((c) => allowed === "all" || allowed.includes(c.id));
  const [deliveries, discussions, canPrint] = await Promise.all([deliveriesFor(ctx, id), discussionsFor(ctx, id), hasFeature(ctx.orgId, "downloads")]);
  const sheets = await Promise.all(mine.map(async (c) => ({ c, sheet: await attendanceSheet(ctx, id, c.id).catch(() => []) })));
  const prog = await getProgramme(ctx, v.assignmentId).catch(() => null);
  const sl = prog?.lessons.find((l) => l.sl.id === id)?.sl;
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3"><Link href={`${base}/lessons`} className="text-sm">← All lessons</Link><div className="flex items-center gap-3"><TranslationPicker current={tr} base={`${base}/lessons/${id}`} />{canPrint && <PrintButton label="Print teacher guide" />}</div></div>
      <LessonBody v={v} tr={tr} />
      <div className="no-print mt-10 space-y-6">
        <Card>
          <h2 className="text-lg">Deliver this lesson</h2>
          {mine.length === 0 ? <p className="mt-2 text-sm text-mist">None of the classes on this programme is assigned to you.</p> : mine.map((c) => {
            const d = deliveries.find((x) => x.classId === c.id);
            return (
              <div key={c.id} className="mt-3 rounded-xl border border-line p-3">
                <p className="flex items-center gap-2 font-semibold">{c.name} {d?.status === "delivered" && <Badge tone="ok">delivered {fmtDate(d.deliveredAt)}</Badge>}</p>
                {can(ctx, "lessons.deliver") && (<ActionForm action={deliveredAction} submit={d?.status === "delivered" ? "Update delivery note" : "Mark as delivered"} className="mt-2"><input type="hidden" name="lessonId" value={id} /><input type="hidden" name="classId" value={c.id} /><input name="notes" className="input" placeholder="Optional note: what went well, what to revisit" defaultValue={d?.notes ?? ""} maxLength={1000} aria-label="Delivery note" /></ActionForm>)}
              </div>);
          })}
        </Card>

        {sheets.map(({ c, sheet }) => can(ctx, "attendance.record") && (
          <Card key={c.id}><h2 className="text-lg">Attendance: {c.name}</h2>
            {sheet.length === 0 ? <p className="mt-2 text-sm text-mist">No learners are enrolled in this class.</p> : (
              <ActionForm action={attendanceAction} submit="Save attendance" className="mt-2">
                <input type="hidden" name="lessonId" value={id} /><input type="hidden" name="classId" value={c.id} />
                <div className="overflow-x-auto"><table className="table"><thead><tr><th>Learner</th><th>Status</th><th>Remarks</th></tr></thead><tbody>
                  {sheet.map((l) => (<tr key={l.id}><td className="font-semibold">{l.name}</td><td><label className="sr-only" htmlFor={`st_${l.id}`}>Status for {l.name}</label><select id={`st_${l.id}`} name={`st_${l.id}`} className="input !min-h-9 !py-1" defaultValue={l.status ?? ""}><option value="" disabled>Not recorded</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="excused">Excused</option></select></td><td><input name={`rm_${l.id}`} className="input !min-h-9 !py-1" defaultValue={l.remarks} maxLength={200} aria-label={`Remarks for ${l.name}`} /></td></tr>))}
                </tbody></table></div>
              </ActionForm>)}
          </Card>
        ))}

        {mine.length > 0 && can(ctx, "lessons.deliver") && (
          <Card><h2 className="text-lg">Class discussion</h2>
            {discussions.map((d) => (<div key={d.id} className="mt-3 rounded-xl border border-line p-3"><p className="font-semibold text-navy">{d.prompt}</p>
              <ul className="mt-2 space-y-2">{d.responses.map((r) => (<li key={r.id} className={`rounded-lg p-3 text-sm ${r.hidden ? "bg-gray-100 opacity-70" : "bg-ivory"}`}><strong>{r.author}:</strong> {r.content}{r.reflection && <p className="mt-1 text-mist"><em>Reflection: {r.reflection}</em></p>}
                <div className="mt-2 flex flex-wrap items-center gap-2"><ActionButton action={moderateResponseAction} fields={{ id: r.id, action: r.hidden ? "show" : "hide" }} label={r.hidden ? "Show" : "Hide"} />
                  <details><summary className="cursor-pointer text-xs text-brand">Add reflection</summary><ActionForm action={moderateResponseAction} submit="Save" className="mt-1"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="reflect" /><input name="reflection" className="input" maxLength={1000} aria-label="Teacher reflection" /></ActionForm></details></div></li>))}
                {d.responses.length === 0 && <li className="text-sm text-mist">No responses yet.</li>}</ul></div>))}
            <ActionForm action={discussionAction} submit="Open a discussion" className="mt-3" resetOnSuccess>
              <input type="hidden" name="lessonId" value={id} />
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr]"><div><label className="label" htmlFor="d-class">Class</label><select id="d-class" name="classId" className="input">{mine.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="label" htmlFor="d-prompt">Prompt for learners</label><textarea id="d-prompt" name="prompt" className="input" rows={2} required minLength={8} maxLength={1000} defaultValue={v.content.discussion[0]?.q} /></div></div>
              <p className="hint">Suggested prompts from this lesson: {v.content.discussion.map((d, i) => `(${i + 1}) ${d.q}`).join("  ")}</p>
            </ActionForm></Card>
        )}

        {mine.length > 0 && can(ctx, "assignments.manage") && (
          <Card><h2 className="text-lg">Set an assignment from this lesson</h2>
            <ActionForm action={createAssignmentAction} submit="Create assignment" className="mt-2">
              <input type="hidden" name="lessonId" value={id} /><input type="hidden" name="base" value={base} />
              <div className="grid gap-3 sm:grid-cols-3"><div><label className="label" htmlFor="a-class">Class</label><select id="a-class" name="classId" className="input">{mine.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="sm:col-span-2"><label className="label" htmlFor="a-title">Title</label><input id="a-title" name="title" className="input" required defaultValue={`Week ${v.week}: take-home`} /></div></div>
              <div><label className="label" htmlFor="a-ins">Instructions</label><textarea id="a-ins" name="instructions" className="input" rows={3} defaultValue={v.content.takeHome} /></div>
              <div className="grid gap-3 sm:grid-cols-3"><div><label className="label" htmlFor="a-due">Due</label><input id="a-due" name="dueAt" type="datetime-local" className="input" /></div><div><label className="label" htmlFor="a-marks">Total marks</label><input id="a-marks" name="totalMarks" type="number" min={1} max={100} defaultValue={10} className="input" /></div><label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="publish" defaultChecked className="h-4 w-4" /> Publish to class now</label></div>
            </ActionForm></Card>
        )}

        {can(ctx, "sessions.manage") && sl && (
          <Card><h2 className="text-lg">Release control</h2><p className="text-sm text-mist">Normally this lesson opens {fmtDate(sl.scheduledDate)}. Override it for this lesson only.</p>
            <div className="mt-2 flex flex-wrap gap-2"><ActionButton action={releaseAction} fields={{ id, release: "open" }} label="Open now" /><ActionButton action={releaseAction} fields={{ id, release: "locked" }} label="Lock" /><ActionButton action={releaseAction} fields={{ id, release: "" }} label="Follow the schedule" /></div></Card>
        )}
      </div>
    </>
  );
}
