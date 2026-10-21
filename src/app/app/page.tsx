import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireUser, getOrgCtx } from "@/server/guards";
import { listMemberships } from "@/server/org";
import { platformCan } from "@/lib/permissions";
import { Alert, Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "My dashboard" };
export const dynamic = "force-dynamic";

export default async function AppHome({ searchParams }: { searchParams: Promise<{ denied?: string; registered?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (platformCan(user.platformRole, "admin.access")) redirect("/admin");
  const ctx = await getOrgCtx();
  if (ctx && !sp.denied) redirect(ctx.role === "learner" ? "/learn" : ctx.role === "teacher" ? "/teach" : "/church");
  const ms = await listMemberships(user.id);
  return (
    <>
      <PageHeader title={`Welcome, ${user.fullName.split(" ")[0]}`} sub="Here is where you stand with your church." />
      {sp.denied && <div className="mb-4"><Alert tone="warn">You do not have access to that page.</Alert></div>}
      {sp.registered && <div className="mb-4"><Alert tone="ok">Your account is ready.</Alert></div>}
      {ctx && <div className="mb-4"><Link className="btn btn-primary" href={ctx.role === "learner" ? "/learn" : ctx.role === "teacher" ? "/teach" : "/church"}>Go to my church workspace</Link></div>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-lg">Your church</h2>
          {ms.length === 0 && <p className="mt-2 text-sm text-mist">You are not linked to a church yet. Ask your church administrator to add you, or register again with your church selected.</p>}
          <ul className="mt-2 space-y-3">
            {ms.map((m) => (
              <li key={m.orgId} className="rounded-lg border border-line p-3">
                <p className="font-semibold">{m.orgName}</p>
                {m.status === "pending" && m.orgStatus === "active" && <p className="mt-1 text-sm text-mist">Waiting for the church administrator to approve you. You will be notified, and your lessons will appear here.</p>}
                {m.status === "pending" && m.orgStatus === "unverified" && <p className="mt-1 text-sm text-mist">This church was listed from your registration and is awaiting verification. Ask your pastor or Sunday school superintendent to register the church at <Link href="/register/church">Register church</Link> and claim this listing, then they can approve you.</p>}
                {m.status === "pending" && m.orgStatus === "pending" && <p className="mt-1 text-sm text-mist">The church has registered and is awaiting approval from the Academy.</p>}
                {m.orgStatus === "suspended" && <p className="mt-1 text-sm text-danger">This church&apos;s workspace is currently suspended.</p>}
                {m.status === "rejected" && <p className="mt-1 text-sm text-danger">Your request was not approved. Please speak to your church leaders.</p>}
                {m.status === "removed" && <p className="mt-1 text-sm text-mist">You are no longer a member of this church.</p>}
                {m.status === "active" && m.orgStatus === "active" && <p className="mt-1 text-sm text-leaf">Approved ({m.role.replace("_", " ")}).</p>}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="text-lg">Community forum</h2>
          <p className="mt-2 text-sm text-mist">Members of every church can meet here to encourage one another, ask teaching questions and share testimonies. You can join in now, even while your church is still approving you.</p>
          <Link className="btn btn-gold mt-4" href="/forum">Open the forum</Link>
        </Card>
      </div>
    </>
  );
}
