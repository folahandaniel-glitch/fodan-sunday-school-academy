import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { myResultDetail } from "@/server/services/exams";
import { NotFoundError } from "@/server/org";
import { Alert, Badge, Card, PageHeader, Progress, StatusBadge } from "@/components/ui";
import { PrintButton } from "@/components/forms";

export const metadata: Metadata = { title: "Result" };
export const dynamic = "force-dynamic";

export default async function ResultDetail({ params }: { params: Promise<{ attemptId: string }> }) {
  const { ctx } = await requireOrg("learn");
  let d;
  try { d = await myResultDetail(ctx, (await params).attemptId); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const r = d.result;
  return (
    <>
      <PageHeader crumbs={[{ label: "My results", href: "/learn/results" }, { label: d.exam.title }]} title={d.exam.title} actions={<PrintButton />} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-xs uppercase tracking-wide text-mist">Score</p><p className="font-display text-3xl text-navy">{r.awardedMarks} / {r.totalMarks}</p><Progress value={r.percentage} label="Score" /><p className="mt-1 text-sm">{r.percentage.toFixed(1)}%</p></Card>
        <Card><p className="text-xs uppercase tracking-wide text-mist">Grade</p><p className="font-display text-3xl text-navy">{r.grade}</p><StatusBadge status={r.passStatus} /> <span className="text-xs text-mist">Pass mark {d.exam.passPercent}%</span></Card>
        <Card><p className="text-xs uppercase tracking-wide text-mist">Attempt</p><p className="font-display text-3xl text-navy">{d.attempt.number}</p>{d.attempt.startedAt && d.attempt.submittedAt && <p className="text-sm text-mist">Time taken: {Math.max(1, Math.round((d.attempt.submittedAt.getTime() - d.attempt.startedAt.getTime()) / 60000))} min</p>}</Card>
      </div>
      {d.feedback.length > 0 && <div className="mt-4"><Alert tone="info"><strong>Teacher feedback:</strong> {d.feedback.join(" ")}</Alert></div>}
      {d.topics.length > 0 && (
        <Card className="mt-4"><h2 className="text-lg">Performance by topic</h2><ul className="mt-2 space-y-2">{d.topics.map((t) => <li key={t.topic}><div className="flex justify-between text-sm"><span>{t.topic}</span><span>{t.percent}%</span></div><Progress value={t.percent} label={t.topic} /></li>)}</ul></Card>
      )}
      <h2 className="mb-2 mt-6 text-lg">Question by question</h2>
      {!d.released && <Alert tone="info">Correct answers and explanations are not released yet. Your teacher or church controls when they appear.</Alert>}
      <ol className="mt-3 space-y-3">
        {d.items.map((i) => (
          <li key={i.number} className="card card-pad print-block">
            <p className="flex flex-wrap items-center gap-2 text-sm text-mist"><strong className="text-navy">Question {i.number}</strong><Badge tone={i.awarded >= i.marks ? "ok" : i.awarded > 0 ? "warn" : "bad"}>{i.awarded} / {i.marks}</Badge></p>
            <p className="mt-1 font-semibold text-navy">{i.text}</p>
            {"given" in i && (<div className="mt-2 grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-mist">Your answer:</span> {i.given || <em>no answer</em>}</p><p><span className="text-mist">Correct answer or marking guide:</span> {i.correct}</p>{i.explanation && <p className="sm:col-span-2 rounded-lg bg-ivory p-3"><strong>Explanation:</strong> {i.explanation}</p>}</div>)}
            {i.feedback && <p className="mt-2 text-sm"><strong>Teacher:</strong> {i.feedback}</p>}
          </li>
        ))}
      </ol>
    </>
  );
}
