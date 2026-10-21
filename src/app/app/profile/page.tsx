import Link from "next/link";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { getDb, schema } from "@/server/db";
import { ActionForm } from "@/components/forms";
import { profileAction, disableMfaAction } from "@/app/actions/auth";
import { Card, PageHeader } from "@/components/ui";
import { TIMEZONES } from "@/lib/text";
import { MfaSetup } from "@/components/mfa-setup";

export const metadata: Metadata = { title: "My profile" };
export const dynamic = "force-dynamic";

export default async function Profile() {
  const user = await requireUser();
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  return (
    <>
      <PageHeader title="My profile" sub="Only the details below are needed. Your church's leaders and teachers can see your learning record; no other church can." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg">Profile and preferences</h2>
          <ActionForm action={profileAction} submit="Save profile" className="mt-3">
            <div><label className="label" htmlFor="fullName">Full name</label><input id="fullName" name="fullName" className="input" defaultValue={u.fullName} required /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><span className="label">Email</span><p className="input !flex items-center bg-gray-50 text-mist">{u.email ?? "None (username sign-in)"}</p></div>
              <div><label className="label" htmlFor="phone">Phone (optional)</label><input id="phone" name="phone" className="input" defaultValue={u.phone ?? ""} /></div>
            </div>
            <div><label className="label" htmlFor="timezone">Time zone</label><select id="timezone" name="timezone" className="input" defaultValue={u.timezone}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showChurchInForum" defaultChecked={u.showChurchInForum} className="h-4 w-4" /> Show my church&apos;s name beside my forum posts</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="emailNotifications" defaultChecked={u.emailNotifications} className="h-4 w-4" /> Send me email notifications</label>
          </ActionForm>
        </Card>
        <div className="space-y-4">
          <Card><h2 className="text-lg">Password</h2><p className="mt-1 text-sm text-mist">Choose a strong password you do not use elsewhere.</p><Link className="btn btn-light mt-3" href="/account/password">Change password</Link></Card>
          <Card>
            <h2 className="text-lg">Two-step verification</h2>
            <p className="mt-1 text-sm text-mist">Adds a code from an authenticator app when you sign in. Recommended for administrators.</p>
            {u.totpEnabled ? (
              <ActionForm action={disableMfaAction} submit="Turn off" className="mt-3" submitClass="btn-danger">
                <div><label className="label" htmlFor="code">Enter a current code to turn it off</label><input id="code" name="code" className="input" inputMode="numeric" autoComplete="one-time-code" required /></div>
              </ActionForm>
            ) : <MfaSetup />}
          </Card>
        </div>
      </div>
    </>
  );
}
