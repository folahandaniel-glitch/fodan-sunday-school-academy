import Link from "next/link";
import type { Metadata } from "next";
import { eq, and, desc } from "drizzle-orm";
import { requirePlatform } from "@/server/guards";
import { getDb, schema } from "@/server/db";
import { ActionForm } from "@/components/forms";
import { approveAllAction, reviewAllAction, publishAllAction } from "@/app/actions/admin";
import { Alert, Badge, Card, Empty, PageHeader, Table } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";
import { platformCan } from "@/lib/permissions";

export const metadata: Metadata = { title: "Content review" };
export const dynamic = "force-dynamic";

export default async function ReviewQueue() {
  const user = await requirePlatform("curriculum.review");
  const db = await getDb();
  const rows = await db.select({ v: schema.curriculumVersions, c: schema.curricula }).from(schema.curriculumVersions).innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumVersions.curriculumId))
    .where(and(eq(schema.curriculumVersions.status, "in_review"))).orderBy(schema.curricula.catalogNumber);
  const approved = await db.select({ v: schema.curriculumVersions, c: schema.curricula }).from(schema.curriculumVersions).innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumVersions.curriculumId)).where(eq(schema.curriculumVersions.status, "approved")).orderBy(desc(schema.curriculumVersions.approvedAt));
  const valid = rows.filter((r) => (r.v.validation as { ok?: boolean }).ok);
  return (
    <>
      <PageHeader title="Content review" sub="Curricula must be reviewed by a qualified person before churches can select them. Approving freezes the version; publishing makes it available." />
      <div className="mb-4"><Alert tone="warn"><strong>Honest status:</strong> lessons and questions authored with AI assistance are marked as such. A passing completeness check shows the material is structurally complete and its Scripture references resolve; it does <em>not</em> show that the theology has been reviewed. Read the lessons before approving.</Alert></div>
      {(rows.length > 0 || approved.length > 0) && (
        <Card className="mb-4"><h2 className="text-lg">Quick actions</h2>
          <p className="mt-1 text-sm text-mist">Work through the whole queue in two clicks. <strong>Review all</strong> approves (and freezes) every waiting version that passes the completeness checks. <strong>Publish all</strong> then releases every approved version to churches. Failures are skipped and listed; nothing is changed for them.</p>
          <div className="mt-3 flex flex-wrap items-start gap-4">
            {platformCan(user.platformRole, "curriculum.review") && rows.length > 0 && <ActionForm action={reviewAllAction} submit={`Review all (${valid.length} ready)`} submitClass="btn-primary" confirm={`Approve all ${valid.length} curricula that pass the checks? Approved versions are frozen; you can still publish them afterwards.`}><span /></ActionForm>}
            {platformCan(user.platformRole, "curriculum.publish") && approved.length > 0 && <ActionForm action={publishAllAction} submit={`Publish all (${approved.length} approved)`} submitClass="btn-gold" confirm={`Publish all ${approved.length} approved curricula so churches can select them?`}><span /></ActionForm>}
          </div>
        </Card>
      )}
      {rows.length === 0 ? <Empty title="Nothing waiting for review">Versions appear here when an author submits them (or when seeded content passes the completeness checks).</Empty> : (
        <Table caption="Review queue"><thead><tr><th>No.</th><th>Curriculum</th><th>Version</th><th>Provenance</th><th>Checks</th><th>Updated</th><th /></tr></thead><tbody>
          {rows.map(({ v, c }) => (<tr key={v.id}><td>{c.catalogNumber}</td><td className="font-semibold">{c.title}</td><td>v{v.versionNumber}</td><td className="text-xs">{v.provenance === "seed" ? "AI-assisted draft" : v.provenance}</td><td>{(v.validation as { ok?: boolean }).ok ? <Badge tone="ok">passes</Badge> : <Badge tone="bad">fails</Badge>}</td><td className="text-xs">{fmtDateTime(v.updatedAt)}</td><td><Link className="btn btn-primary btn-sm" href={`/admin/curricula/${c.id}/v/${v.id}`}>Review</Link></td></tr>))}
        </tbody></Table>
      )}
      {platformCan(user.platformRole, "curriculum.publish") && valid.length > 0 && (
        <Card className="mt-6"><h2 className="text-lg">Approve and publish in bulk</h2><p className="text-sm text-mist">For the product owner, after reading the material. Approves and publishes {valid.length} version(s) that pass every completeness check; the action is recorded in the audit log under your name.</p>
          <ActionForm action={approveAllAction} submit={`Approve and publish ${valid.length} curriculum version(s)`} className="mt-3" submitClass="btn-gold" confirm={`Confirm that you have reviewed these ${valid.length} curricula and want churches to be able to use them.`}><span /></ActionForm></Card>
      )}
      {approved.length > 0 && (<><h2 className="mb-2 mt-8 text-lg">Approved, not yet published</h2><Table caption="Approved"><tbody>{approved.map(({ v, c }) => <tr key={v.id}><td className="font-semibold">{c.title}</td><td>v{v.versionNumber}</td><td><Link className="btn btn-light btn-sm" href={`/admin/curricula/${c.id}/v/${v.id}`}>Open to publish</Link></td></tr>)}</tbody></Table></>)}
    </>
  );
}
