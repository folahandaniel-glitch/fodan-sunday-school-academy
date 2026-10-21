import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { jobsOverview } from "@/server/services/admin";
import { ActionButton, ActionForm } from "@/components/forms";
import { retryJobAction, runJobsAction } from "@/app/actions/admin";
import { Card, PageHeader, StatusBadge, Table } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "Background jobs" };
export const dynamic = "force-dynamic";

export default async function Jobs() {
  await requirePlatform("jobs.view");
  const { jobs, outbox } = await jobsOverview();
  return (
    <>
      <PageHeader title="Background jobs" sub="Email delivery, payment reconciliation and plan expiry run as retryable jobs. A daily scheduled call to /api/cron/maintenance keeps them moving." actions={<ActionForm action={runJobsAction} submit="Run maintenance now" className="!space-y-0" submitClass="btn-sm"><span /></ActionForm>} />
      <Card><h2 className="text-lg">Email outbox</h2><p className="mt-1 text-sm text-mist">{outbox.length === 0 ? "No email has been queued yet." : outbox.map((o) => `${o.n} ${o.status}`).join(" · ")}. Mail is <strong>held</strong> (never reported as sent) until an email provider is configured.</p></Card>
      <h2 className="mb-2 mt-6 text-lg">Recent jobs</h2>
      <Table caption="Jobs"><thead><tr><th>When</th><th>Kind</th><th>Status</th><th>Attempts</th><th>Last error</th><th /></tr></thead><tbody>
        {jobs.map((j) => <tr key={j.id}><td className="text-xs">{fmtDateTime(j.createdAt)}</td><td>{j.kind}</td><td><StatusBadge status={j.status} /></td><td>{j.attempts}/{j.maxAttempts}</td><td className="max-w-xs text-xs text-danger">{j.lastError}</td><td>{j.status === "failed" && <ActionButton action={retryJobAction} fields={{ id: j.id }} label="Retry" />}</td></tr>)}
        {jobs.length === 0 && <tr><td colSpan={6} className="text-mist">No jobs yet.</td></tr>}
      </tbody></Table>
    </>
  );
}
