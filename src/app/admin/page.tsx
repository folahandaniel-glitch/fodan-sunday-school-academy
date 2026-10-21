import Link from "next/link";
import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { platformMetrics } from "@/server/services/reports";
import { Alert, PageHeader, Stat, Table } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "Platform overview" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await requirePlatform();
  const m = await platformMetrics();
  return (
    <>
      <PageHeader title="Platform overview" sub="Live figures from the database. Every number has a defined calculation (see the labels)." />
      {m.awaitingReview > 0 && <div className="mb-4"><Alert tone="warn"><Link href="/admin/review" className="font-semibold">{m.awaitingReview} curriculum version(s) are waiting for review.</Link></Alert></div>}
      {m.churches.unverified > 0 && <div className="mb-4"><Alert tone="info"><Link href="/admin/churches?status=unverified" className="font-semibold">{m.churches.unverified} church listing(s) were typed in by members and are unverified.</Link></Alert></div>}
      {m.failedJobs > 0 && <div className="mb-4"><Alert tone="error"><Link href="/admin/jobs" className="font-semibold">{m.failedJobs} background job(s) have failed and need attention.</Link></Alert></div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Registered churches" value={m.churches.total} sub="All organisations" href="/admin/churches" />
        <Stat label="Active churches" value={m.churches.active} sub={`${m.churches.pending} awaiting approval`} href="/admin/churches?status=active" />
        <Stat label="Learners" value={m.learners} sub="Distinct people with an active learner membership" />
        <Stat label="Teachers" value={m.teachers} sub="Distinct active teachers" />
        <Stat label="Published curricula" value={m.publishedCurricula} sub="Status published" href="/admin/curricula" />
        <Stat label="Awaiting review" value={m.awaitingReview} sub="Versions in review" href="/admin/review" />
        <Stat label="Active sessions" value={m.activeSessions} sub="Academic sessions with status active" />
        <Stat label="Scheduled lessons" value={m.scheduledLessons} sub="All scheduled lesson records" />
        <Stat label="Results recorded" value={m.examsCompleted} sub="Marked attempts" />
        <Stat label="Average score" value={m.averageScore === null ? "–" : `${m.averageScore}%`} sub="Across all recorded results" />
        <Stat label="Paid subscriptions" value={m.activeSubscriptions} sub="Active plans other than Free" href="/admin/payments" />
        <Stat label="Pending payments" value={m.pendingPayments} sub="Awaiting provider confirmation" />
        <Stat label="Forum threads" value={m.forumThreads} href="/admin/forum" />
        <Stat label="Emails waiting" value={m.emailsWaiting} sub="Held or queued in the outbox" href="/admin/jobs" />
      </div>
      <h2 className="mb-2 mt-8 text-lg">Recent administrative activity</h2>
      <Table caption="Recent activity"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th></tr></thead><tbody>
        {m.recent.map((a) => <tr key={a.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(a.createdAt)}</td><td>{a.actorLabel ?? "system"}</td><td className="font-mono text-xs">{a.action}</td><td className="text-xs text-mist">{a.targetType} {a.targetId?.slice(0, 8)}</td></tr>)}
        {m.recent.length === 0 && <tr><td colSpan={4} className="text-mist">No activity yet.</td></tr>}
      </tbody></Table>
    </>
  );
}
