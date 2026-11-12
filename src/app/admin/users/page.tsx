import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { listUsers } from "@/server/services/admin";
import { ActionButton, ActionForm } from "@/components/forms";
import { userPermsAction, staffUserAction, userResetAction, userRevokeAction, userRoleAction, userStatusAction } from "@/app/actions/admin";
import { Card, Empty, PageHeader, Pagination, StatusBadge, Table } from "@/components/ui";
import { PLATFORM_GRANTABLE, PLATFORM_ROLE_LABELS } from "@/lib/permissions";
import { fmtDate } from "@/lib/text";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }> }) {
  const me = await requirePlatform("users.manage");
  const sp = await searchParams;
  const d = await listUsers({ q: sp.q?.slice(0, 80), role: sp.role, status: sp.status, page: Math.max(1, Number(sp.page) || 1) });
  return (
    <>
      <PageHeader title="User management" sub="Platform roles are separate from a person's role inside a church. Changing a platform role ends that person's sessions." />
      <form className="mb-4 flex flex-wrap gap-2" role="search"><label className="sr-only" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q} className="input !w-64" placeholder="Name or email" /><label className="sr-only" htmlFor="role">Platform role</label><select id="role" name="role" defaultValue={sp.role ?? ""} className="input !w-auto"><option value="">Any role</option>{Object.entries(PLATFORM_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="btn btn-light">Filter</button></form>
      {d.rows.length === 0 ? <Empty title="No users match" /> : (
        <Table caption="Users"><thead><tr><th>Name</th><th>Church</th><th>Platform role</th><th>2-step</th><th>Last sign-in</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {d.rows.map(({ u, church }) => (
            <tr key={u.id}><td><span className="font-semibold">{u.name}</span><br /><span className="text-xs text-mist">{u.email ?? u.username}</span></td><td className="text-sm">{church ?? "–"}</td>
              <td><ActionForm action={userRoleAction} submit="Set" className="!space-y-0 flex items-center gap-1" submitClass="btn-sm btn-light !text-brand"><input type="hidden" name="id" value={u.id} /><select name="role" aria-label={`Platform role for ${u.name}`} defaultValue={u.role} className="input !min-h-8 !w-auto !py-0 text-xs" disabled={u.id === me.id}>{Object.entries(PLATFORM_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></ActionForm></td>
              <td>{u.mfa ? "On" : "–"}</td><td className="text-xs">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : "Never"}</td><td><StatusBadge status={u.status} /></td>
              <td><div className="flex flex-wrap gap-1">{u.id !== me.id && <ActionButton action={userStatusAction} fields={{ id: u.id, status: u.status === "suspended" ? "active" : "suspended" }} label={u.status === "suspended" ? "Reactivate" : "Suspend"} tone={u.status === "suspended" ? "light" : "danger"} confirm={u.status === "suspended" ? undefined : `Suspend ${u.name}?`} />}<ActionButton action={userResetAction} fields={{ id: u.id }} label="Reset password" confirm={`Reset ${u.name}'s password and show a temporary one?`} /><ActionButton action={userRevokeAction} fields={{ id: u.id }} label="End sessions" /></div></td></tr>
          ))}
        </tbody></Table>
      )}
      {me.platformRole === "super_admin" && d.rows.length > 0 && (
        <Card className="mt-6"><h2 className="text-lg">Assign admin permissions</h2>
          <p className="text-sm text-mist">Choose exactly what an individual may edit from the admin area, on top of their platform role. Changes are recorded in the audit log and apply on their next page load.</p>
          <div className="mt-3 space-y-2">
            {d.rows.filter(({ u }) => u.role !== "super_admin").map(({ u }) => (
              <details key={u.id} className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">{u.name} <span className="font-normal text-mist">· {u.email ?? u.username}{u.extraPerms?.length ? ` · ${u.extraPerms.length} granted` : ""}</span></summary>
                <ActionForm action={userPermsAction} submit="Save permissions" className="mt-3">
                  <input type="hidden" name="id" value={u.id} />
                  <div className="grid gap-4 md:grid-cols-3">
                    {Array.from(new Set(PLATFORM_GRANTABLE.map((g) => g.group))).map((grp) => (
                      <fieldset key={grp} className="space-y-1"><legend className="text-xs font-bold uppercase tracking-wide text-mist">{grp}</legend>
                        {PLATFORM_GRANTABLE.filter((g) => g.group === grp).map((g) => <label key={g.perm} className="flex items-start gap-2 text-sm"><input type="checkbox" name="perm" value={g.perm} defaultChecked={u.extraPerms?.includes(g.perm)} className="mt-1" /><span>{g.label}</span></label>)}
                      </fieldset>
                    ))}
                  </div>
                </ActionForm>
              </details>
            ))}
          </div>
        </Card>
      )}
      <Pagination page={d.page} pageSize={d.pageSize} total={d.total} base="/admin/users" params={{ q: sp.q, role: sp.role }} />
      <Card className="mt-6"><h2 className="text-lg">Add a staff account</h2><p className="text-sm text-mist">Curriculum reviewers, finance administrators and auditors. The person must change the temporary password at first sign-in. Super Admin status is granted separately and only to accounts with two-step verification on.</p>
        <ActionForm action={staffUserAction} submit="Create account" className="mt-3" resetOnSuccess><div className="grid gap-3 sm:grid-cols-3"><div><label className="label" htmlFor="s-name">Full name</label><input id="s-name" name="fullName" className="input" required /></div><div><label className="label" htmlFor="s-email">Email</label><input id="s-email" name="email" type="email" className="input" required /></div><div><label className="label" htmlFor="s-role">Role</label><select id="s-role" name="role" className="input"><option value="curriculum_admin">Curriculum reviewer / editor</option><option value="finance_admin">Finance administrator</option><option value="auditor">Platform auditor (read only)</option></select></div></div></ActionForm></Card>
    </>
  );
}
