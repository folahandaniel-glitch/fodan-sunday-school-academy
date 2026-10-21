import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { churchDetail, listChurches } from "@/server/services/admin";
import { allPlans } from "@/server/services/billing";
import { ActionForm } from "@/components/forms";
import { churchStatusAction, grantPlanAction, mergeChurchAction } from "@/app/actions/admin";
import { Card, PageHeader, StatusBadge, Table } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/text";
import { NotFoundError } from "@/server/org";
import { platformCan } from "@/lib/permissions";

export const metadata: Metadata = { title: "Church" };
export const dynamic = "force-dynamic";

export default async function ChurchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatform("churches.view");
  let d;
  try { d = await churchDetail((await params).id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const o = d.org;
  const manage = platformCan(user.platformRole, "churches.manage");
  const [plans, others] = manage ? await Promise.all([allPlans(), listChurches({ status: "active", pageSize: 100 })]) : [[], { rows: [] }];
  const n = (role: string, status = "active") => d.counts.find((c) => c.role === role && c.status === status)?.n ?? 0;
  return (
    <>
      <PageHeader crumbs={[{ label: "Churches", href: "/admin/churches" }, { label: o.name }]} title={o.name} sub={[o.type, o.denomination, o.city, o.state, o.country].filter(Boolean).join(" · ")} actions={<StatusBadge status={o.status} />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card><h2 className="text-lg">Overview</h2><dl className="mt-2 space-y-1 text-sm"><div className="flex justify-between"><dt className="text-mist">Learners</dt><dd>{n("learner")}</dd></div><div className="flex justify-between"><dt className="text-mist">Teachers</dt><dd>{n("teacher")}</dd></div><div className="flex justify-between"><dt className="text-mist">Waiting for approval</dt><dd>{d.counts.filter((c) => c.status === "pending").reduce((a, c) => a + c.n, 0)}</dd></div><div className="flex justify-between"><dt className="text-mist">Classes</dt><dd>{d.classes}</dd></div><div className="flex justify-between"><dt className="text-mist">Plan</dt><dd>{d.plan.name}</dd></div><div className="flex justify-between"><dt className="text-mist">Registered</dt><dd>{fmtDate(o.createdAt)}</dd></div><div className="flex justify-between"><dt className="text-mist">Contact</dt><dd>{o.contactEmail ?? "–"}</dd></div></dl>{o.suspendedReason && <p className="mt-2 text-sm text-danger">Suspended: {o.suspendedReason}</p>}</Card>
        <Card><h2 className="text-lg">Administrators</h2>{d.admins.length === 0 ? <p className="mt-2 text-sm text-mist">No administrator yet. Members listed this church; a pastor can register and claim it.</p> : <ul className="mt-2 text-sm">{d.admins.map((a) => <li key={a.id}>{a.name} <span className="text-xs text-mist">· {a.email} · {a.role.replace("_", " ")} · {a.status}</span></li>)}</ul>}</Card>
        {manage && (
          <Card><h2 className="text-lg">Status</h2>
            {o.status === "suspended" ? (
              <ActionForm action={churchStatusAction} submit="Restore this church" className="mt-2"><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="active" /></ActionForm>
            ) : (
              <>
                {(o.status === "pending" || o.status === "unverified") && <ActionForm action={churchStatusAction} submit={o.status === "pending" ? "Approve this church" : "Mark as verified"} className="mt-2" submitClass="btn-gold"><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="active" /></ActionForm>}
                <ActionForm action={churchStatusAction} submit="Suspend this church" className="mt-3" submitClass="btn-danger" confirm="Suspend this church? Its members lose access to the church workspace until it is restored."><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="suspended" /><div><label className="label" htmlFor="reason">Reason (recorded in the audit log)</label><input id="reason" name="reason" className="input" required minLength={5} /></div></ActionForm>
              </>
            )}
          </Card>
        )}
      </div>
      {manage && o.status === "unverified" && (
        <Card className="mt-4"><h2 className="text-lg">Merge into an existing church</h2><p className="text-sm text-mist">If members typed the name of a church that is already registered, merge this listing into it. Members move across as <em>pending</em>, so the real church&apos;s administrator still decides.</p>
          <ActionForm action={mergeChurchAction} submit="Merge" className="mt-2" confirm="Merge this listing into the selected church? This cannot be undone."><input type="hidden" name="from" value={o.id} /><select name="into" className="input" required aria-label="Church to merge into">{others.rows.filter((r) => r.o.id !== o.id).map((r) => <option key={r.o.id} value={r.o.id}>{r.o.name} ({r.o.city})</option>)}</select></ActionForm></Card>
      )}
      {manage && platformCan(user.platformRole, "plans.manage") && (
        <Card className="mt-4"><h2 className="text-lg">Grant a plan</h2><p className="text-sm text-mist">For scholarships or payments received outside the app. Audited.</p>
          <ActionForm action={grantPlanAction} submit="Grant plan" className="mt-2"><input type="hidden" name="orgId" value={o.id} /><div className="grid gap-3 sm:grid-cols-3"><div><label className="label" htmlFor="planId">Plan</label><select id="planId" name="planId" className="input">{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div><label className="label" htmlFor="days">Days</label><input id="days" name="days" type="number" min={1} defaultValue={365} className="input" /></div><div><label className="label" htmlFor="source">Reason</label><select id="source" name="source" className="input"><option value="admin_grant">Manual payment or grant</option><option value="scholarship">Scholarship</option></select></div></div></ActionForm></Card>
      )}
      <h2 className="mb-2 mt-6 text-lg">Programmes</h2>
      <Table caption="Programmes"><thead><tr><th>Curriculum</th><th>Session</th><th>Status</th></tr></thead><tbody>{d.programmes.map((p) => <tr key={p.a.id}><td>{p.title}</td><td>{p.session}</td><td><StatusBadge status={p.a.status} /></td></tr>)}{d.programmes.length === 0 && <tr><td colSpan={3} className="text-mist">None yet.</td></tr>}</tbody></Table>
      <h2 className="mb-2 mt-6 text-lg">Recent audit history</h2>
      <Table caption="Audit"><thead><tr><th>When</th><th>Who</th><th>Action</th></tr></thead><tbody>{d.audits.map((a) => <tr key={a.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(a.createdAt)}</td><td>{a.actorLabel ?? "system"}</td><td className="font-mono text-xs">{a.action}</td></tr>)}{d.audits.length === 0 && <tr><td colSpan={3} className="text-mist">No records.</td></tr>}</tbody></Table>
    </>
  );
}
