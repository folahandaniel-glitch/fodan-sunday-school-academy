import Link from "next/link";
import type { Metadata } from "next";
import { eq, and, desc } from "drizzle-orm";
import { requireOrg } from "@/server/guards";
import { getDb, schema } from "@/server/db";
import { listProgrammes } from "@/server/services/schedule";
import { hasFeature } from "@/server/services/entitlements";
import { ActionButton } from "@/components/forms";
import { issueCertificatesAction } from "@/app/actions/staff";
import { Alert, Empty, PageHeader, Table } from "@/components/ui";
import { fmtDate } from "@/lib/text";
import { orgSettings } from "@/server/services/church";

export const metadata: Metadata = { title: "Certificates" };
export const dynamic = "force-dynamic";

export default async function CertificatesPage() {
  const { ctx } = await requireOrg("certificates.issue");
  const db = await getDb();
  const [ok, progs, issued] = await Promise.all([hasFeature(ctx.orgId, "certificates"), listProgrammes(ctx), db.select({ c: schema.certificates, name: schema.users.fullName }).from(schema.certificates).innerJoin(schema.users, eq(schema.users.id, schema.certificates.learnerId)).where(and(eq(schema.certificates.organizationId, ctx.orgId))).orderBy(desc(schema.certificates.issuedAt)).limit(100)]);
  const r = orgSettings(ctx).certificate;
  return (
    <>
      <PageHeader title="Certificates" sub={`A certificate is issued only to learners who meet your rules: attendance ${r.minAttendancePercent}%+, lessons completed ${r.minLessonCompletionPercent}%+${r.requireFinalExam ? `, final examination released with ${r.minScorePercent}%+` : ""}. Change the rules under Church settings.`} />
      {!ok && <Alert tone="warn">Certificates are included in higher plans. <Link href="/church/billing">See plans</Link></Alert>}
      {ok && <div className="mb-6 flex flex-wrap gap-2">{progs.filter((p) => p.a.status !== "cancelled").map((p) => <ActionButton key={p.a.id} action={issueCertificatesAction} fields={{ id: p.a.id }} label={`Issue for ${p.title} (${p.s.name})`} tone="gold" confirm="Issue certificates to every eligible learner in this programme?" />)}</div>}
      {issued.length === 0 ? <Empty title="No certificates issued yet" /> : <Table caption="Certificates"><thead><tr><th>Learner</th><th>Curriculum</th><th>Code</th><th>Issued</th></tr></thead><tbody>{issued.map(({ c, name }) => <tr key={c.id}><td className="font-semibold">{name}</td><td>{(c.data as { curriculum?: string }).curriculum}</td><td className="font-mono text-xs"><Link href={`/verify/${c.verificationCode}`}>{c.verificationCode}</Link></td><td>{fmtDate(c.issuedAt)}{c.revokedAt && " (revoked)"}</td></tr>)}</tbody></Table>}
    </>
  );
}
