import Link from "next/link";
import { ActionButton, ActionForm } from "@/components/forms";
import { assignTeacherAction, createClassAction, enrolAction, unassignTeacherAction, unenrolAction } from "@/app/actions/staff";
import { Card, Empty, PageHeader, Table } from "@/components/ui";
import { classDetail, listClasses, peopleByRole, visibleLearners } from "@/server/services/church";
import { can, type OrgCtx } from "@/server/org";

export async function ClassesIndex({ ctx, base }: { ctx: OrgCtx; base: string }) {
  const rows = await listClasses(ctx);
  return (
    <>
      <PageHeader title={can(ctx, "classes.manage") ? "Classes" : "My classes"} sub={can(ctx, "classes.manage") ? "Create classes, assign teachers and enrol learners." : "The classes assigned to you."} />
      {rows.length === 0 ? <Empty title="No classes yet">{can(ctx, "classes.manage") ? "Create your first class below." : "Your church administrator will assign you to a class."}</Empty> : (
        <Table caption="Classes"><thead><tr><th>Class</th><th>Age group</th><th>Teachers</th><th>Learners</th></tr></thead><tbody>
          {rows.map((c) => (<tr key={c.id}><td><Link className="font-semibold" href={`${base}/classes/${c.id}`}>{c.name}</Link></td><td>{c.ageGroup ?? "–"}</td><td>{c.teachers.join(", ") || <span className="text-mist">None yet</span>}</td><td>{c.learners}</td></tr>))}
        </tbody></Table>
      )}
      {can(ctx, "classes.manage") && (
        <Card className="mt-6"><h2 className="text-lg">New class</h2>
          <ActionForm action={createClassAction} submit="Create class" className="mt-2"><div className="grid gap-3 sm:grid-cols-3"><div><label className="label" htmlFor="c-name">Name</label><input id="c-name" name="name" className="input" required minLength={2} placeholder="e.g. Adult Bible Class" /></div><div><label className="label" htmlFor="c-age">Age group (optional)</label><input id="c-age" name="ageGroup" className="input" placeholder="e.g. 13-17" /></div><div><label className="label" htmlFor="c-desc">Description (optional)</label><input id="c-desc" name="description" className="input" /></div></div></ActionForm></Card>
      )}
    </>
  );
}

export async function ClassPage({ ctx, id, base }: { ctx: OrgCtx; id: string; base: string }) {
  const d = await classDetail(ctx, id);
  const manage = can(ctx, "classes.manage");
  const [teachers, learners] = manage ? await Promise.all([peopleByRole(ctx, ["teacher", "assistant_admin", "church_admin"]), visibleLearners(ctx)]) : [[], []];
  const enrolled = new Set(d.learners.map((l) => l.userId));
  return (
    <>
      <PageHeader crumbs={[{ label: "Classes", href: `${base}/classes` }, { label: d.class.name }]} title={d.class.name} sub={d.class.description || undefined} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="text-lg">Teachers</h2>
          <ul className="mt-2 divide-y divide-line">{d.teachers.map((t) => <li key={t.userId} className="flex items-center justify-between py-2"><span>{t.name}</span>{manage && <ActionButton action={unassignTeacherAction} fields={{ classId: id, teacherId: t.userId }} label="Remove" confirm={`Remove ${t.name} from this class?`} />}</li>)}{d.teachers.length === 0 && <li className="py-2 text-sm text-mist">No teacher assigned.</li>}</ul>
          {manage && teachers.length > 0 && <ActionForm action={assignTeacherAction} submit="Assign" className="mt-3"><input type="hidden" name="classId" value={id} /><label className="label" htmlFor="t-pick">Assign a teacher</label><select id="t-pick" name="teacherId" className="input">{teachers.map((t) => <option key={t.userId} value={t.userId}>{t.name}</option>)}</select></ActionForm>}
          {manage && teachers.length === 0 && <p className="mt-3 text-sm text-mist">Approve a teacher under Members first.</p>}</Card>
        <Card><h2 className="text-lg">Learners ({d.learners.length})</h2>
          <ul className="mt-2 max-h-80 divide-y divide-line overflow-auto">{d.learners.map((l) => <li key={l.userId} className="flex items-center justify-between py-2"><span>{l.name}</span>{manage && <ActionButton action={unenrolAction} fields={{ classId: id, learnerId: l.userId }} label="Remove" />}</li>)}{d.learners.length === 0 && <li className="py-2 text-sm text-mist">No learners enrolled yet.</li>}</ul>
          {manage && <ActionForm action={enrolAction} submit="Enrol" className="mt-3"><input type="hidden" name="classId" value={id} /><label className="label" htmlFor="l-pick">Enrol a learner</label><select id="l-pick" name="learnerId" className="input" required>{learners.filter((l) => !enrolled.has(l.userId)).map((l) => <option key={l.userId} value={l.userId}>{l.name}</option>)}</select></ActionForm>}</Card>
      </div>
    </>
  );
}
