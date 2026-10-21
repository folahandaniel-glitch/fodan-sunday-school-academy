import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { listMembers } from "@/server/services/church";
import { ActionButton, ActionForm } from "@/components/forms";
import { addMemberAction, changeRoleAction, decideMemberAction, removeMemberAction } from "@/app/actions/staff";
import { Card, Empty, PageHeader, Pagination, StatusBadge, Table, Tabs } from "@/components/ui";
import { ORG_ROLE_LABELS } from "@/lib/permissions";
import { fmtDate } from "@/lib/text";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

export default async function Members({ searchParams }: { searchParams: Promise<{ status?: string; role?: string; q?: string; page?: string }> }) {
  const { ctx } = await requireOrg("members.manage");
  const sp = await searchParams;
  const status = sp.status ?? "active";
  const data = await listMembers(ctx, { status, role: sp.role, q: sp.q?.slice(0, 60), page: Math.max(1, Number(sp.page) || 1) });
  return (
    <>
      <PageHeader title="Members" sub="Only people you approve can see your church's classes, lessons and records." />
      <Tabs current={status} items={[{ key: "pending", label: "Waiting for approval", href: "/church/members?status=pending" }, { key: "active", label: "Active", href: "/church/members?status=active" }, { key: "rejected", label: "Declined", href: "/church/members?status=rejected" }, { key: "removed", label: "Removed", href: "/church/members?status=removed" }]} />
      <form className="mb-4 flex flex-wrap gap-2" role="search"><input type="hidden" name="status" value={status} /><label className="sr-only" htmlFor="q">Search members</label><input id="q" name="q" defaultValue={sp.q} className="input !w-64" placeholder="Search by name or email" />
        <label className="sr-only" htmlFor="role">Role</label><select id="role" name="role" className="input !w-auto" defaultValue={sp.role ?? ""}><option value="">Any role</option>{Object.entries(ORG_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="btn btn-light">Filter</button></form>
      {data.rows.length === 0 ? <Empty title="Nobody here">{status === "pending" ? "No one is waiting for approval." : "No members match."}</Empty> : (
        <Table caption="Members"><thead><tr><th>Name</th><th>Sign-in</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>
          {data.rows.map((m) => (
            <tr key={m.id}><td className="font-semibold">{m.name}{m.isMinor && <span className="badge ml-2">child</span>}</td><td className="text-xs">{m.email ?? m.username}</td><td>{ORG_ROLE_LABELS[m.role]}</td><td><StatusBadge status={m.status} /></td><td>{fmtDate(m.joinedAt ?? m.createdAt)}</td>
              <td><div className="flex flex-wrap gap-1">
                {m.status === "pending" && (<><ActionForm action={decideMemberAction} submit="Approve" className="!space-y-0 inline-flex items-center gap-1" submitClass="btn-sm"><input type="hidden" name="id" value={m.id} /><input type="hidden" name="decision" value="approve" /><select name="role" aria-label={`Role for ${m.name}`} className="input !min-h-8 !w-auto !py-0 text-xs" defaultValue={m.role === "church_admin" ? "learner" : m.role}><option value="learner">Learner</option><option value="teacher">Teacher</option></select></ActionForm><ActionButton action={decideMemberAction} fields={{ id: m.id, decision: "reject" }} label="Decline" tone="danger" /></>)}
                {m.status === "active" && m.userId !== ctx.userId && (<><ActionForm action={changeRoleAction} submit="Set role" className="!space-y-0 inline-flex items-center gap-1" submitClass="btn-sm btn-light !text-brand"><input type="hidden" name="id" value={m.id} /><select name="role" aria-label={`New role for ${m.name}`} className="input !min-h-8 !w-auto !py-0 text-xs" defaultValue={m.role}>{ctx.role === "church_admin" && <option value="church_admin">{ORG_ROLE_LABELS.church_admin}</option>}{(["assistant_admin", "teacher", "learner", "exam_supervisor", "coordinator", "auditor"] as const).map((r) => <option key={r} value={r}>{ORG_ROLE_LABELS[r]}</option>)}</select></ActionForm><ActionButton action={removeMemberAction} fields={{ id: m.id }} label="Remove" tone="danger" confirm={`Remove ${m.name} from your church?`} /></>)}
              </div></td></tr>
          ))}
        </tbody></Table>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} base="/church/members" params={{ status, role: sp.role, q: sp.q }} />
      <Card className="mt-6"><h2 className="text-lg">Add a person directly</h2><p className="text-sm text-mist">For children or people without email. They receive a one-time temporary password and must choose their own at first sign-in.</p>
        <ActionForm action={addMemberAction} submit="Create account" className="mt-3" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-4"><div className="sm:col-span-2"><label className="label" htmlFor="a-name">Full name</label><input id="a-name" name="fullName" className="input" required /></div><div><label className="label" htmlFor="a-email">Email (optional)</label><input id="a-email" name="email" type="email" className="input" /></div><div><label className="label" htmlFor="a-user">Username (if no email)</label><input id="a-user" name="username" className="input" placeholder="e.g. tolu.adeyemi" /></div></div>
          <div className="flex flex-wrap items-end gap-4"><div><label className="label" htmlFor="a-role">Role</label><select id="a-role" name="role" className="input !w-auto"><option value="learner">Learner</option><option value="teacher">Teacher</option><option value="assistant_admin">Assistant administrator</option><option value="exam_supervisor">Examination supervisor</option></select></div><label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="isMinor" className="h-4 w-4" /> This is a child under 13 (no forum posting)</label></div>
        </ActionForm></Card>
    </>
  );
}
