import Link from "next/link";
import type { Metadata } from "next";
import { eq, and, gt, isNull, desc } from "drizzle-orm";
import { requirePlatform } from "@/server/guards";
import { getDb, schema } from "@/server/db";
import { Alert, Card, PageHeader, Table } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "Security" };
export const dynamic = "force-dynamic";

export default async function Security() {
  const me = await requirePlatform();
  const db = await getDb();
  const sessions = await db.select({ s: schema.sessions, name: schema.users.fullName }).from(schema.sessions).innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId)).where(and(isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date()), eq(schema.users.id, me.id))).orderBy(desc(schema.sessions.createdAt));
  const events = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "auth.locked")).orderBy(desc(schema.auditLogs.createdAt)).limit(10);
  return (
    <>
      <PageHeader title="Security" sub="Protect privileged accounts." />
      {!me.totpEnabled && <div className="mb-4"><Alert tone="warn"><strong>Two-step verification is off on your account.</strong> Administrators should turn it on. <Link href="/app/profile">Set it up</Link></Alert></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="text-lg">Protections in place</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm"><li>Passwords stored with Argon2id; staff passwords need 12+ characters.</li><li>Sessions are random tokens in HttpOnly cookies; only a keyed hash is stored. Ending a person&apos;s sessions is on the Users page.</li><li>Sign-in rate limiting and temporary lockout after repeated failures.</li><li>Every church-owned record is checked against the signed-in user&apos;s church on the server, and enforced again by composite foreign keys in the database.</li><li>Examination answer keys are stored apart from questions and never sent to learners before release.</li><li>Approved and published curriculum versions are frozen by a database trigger.</li><li>Security headers and a content-security policy on every page.</li></ul></Card>
        <Card><h2 className="text-lg">Your active sessions</h2><Table caption="Sessions"><thead><tr><th>Started</th><th>IP</th><th>Expires</th></tr></thead><tbody>{sessions.map(({ s }) => <tr key={s.id}><td className="text-xs">{fmtDateTime(s.createdAt)}</td><td className="text-xs">{s.ip}</td><td className="text-xs">{fmtDateTime(s.expiresAt)}</td></tr>)}</tbody></Table>
          <h3 className="mt-4 text-base">Recent account lockouts</h3><ul className="mt-1 text-sm">{events.map((e) => <li key={e.id}>{fmtDateTime(e.createdAt)}: {e.actorLabel}</li>)}{events.length === 0 && <li className="text-mist">None.</li>}</ul></Card>
      </div>
    </>
  );
}
