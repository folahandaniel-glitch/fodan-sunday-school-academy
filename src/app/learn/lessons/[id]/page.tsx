import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { discussionsFor, getLesson } from "@/server/services/teaching";
import { AccessError, NotFoundError } from "@/server/org";
import { LessonBody } from "@/components/lesson-view";
import { TranslationPicker } from "@/components/scripture";
import { ActionForm } from "@/components/forms";
import { PrintButton } from "@/components/forms";
import { progressAction, respondAction } from "@/app/actions/learn";
import { Alert, Card } from "@/components/ui";
import { isTranslation } from "@/lib/bible";
import { hasFeature } from "@/server/services/entitlements";

export const metadata: Metadata = { title: "Lesson" };
export const dynamic = "force-dynamic";

export default async function LessonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tr?: string }> }) {
  const { ctx } = await requireOrg("learn");
  const { id } = await params;
  const tr = isTranslation((await searchParams).tr) ? ((await searchParams).tr as "bsb") : "bsb";
  let v;
  try { v = await getLesson(ctx, id); } catch (e) {
    if (e instanceof NotFoundError) notFound();
    if (e instanceof AccessError) return <Alert tone="warn">{e.message} <Link href="/learn/lessons">Back to lessons</Link></Alert>;
    throw e;
  }
  const [discussions, canPrint] = await Promise.all([discussionsFor(ctx, id), hasFeature(ctx.orgId, "downloads")]);
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/learn/lessons" className="text-sm">← All lessons</Link>
        <div className="flex flex-wrap items-center gap-3"><TranslationPicker current={tr} base={`/learn/lessons/${id}`} />{canPrint && <PrintButton />}</div>
      </div>
      <LessonBody v={v} tr={tr} />
      <div className="no-print mt-10 space-y-6">
        {discussions.map((d) => (
          <Card key={d.id}><h2 className="text-lg">Class discussion</h2><p className="mt-1 font-semibold text-navy">{d.prompt}</p>
            <ul className="mt-3 space-y-2">{d.responses.map((r) => <li key={r.id} className="rounded-lg bg-ivory p-3 text-sm"><strong>{r.author}:</strong> {r.content}{r.reflection && <p className="mt-1 text-mist"><em>Teacher: {r.reflection}</em></p>}</li>)}{d.responses.length === 0 && <li className="text-sm text-mist">No responses yet.</li>}</ul>
            {d.status === "open" && <ActionForm action={respondAction} submit="Post my response" className="mt-3" resetOnSuccess><input type="hidden" name="discussionId" value={d.id} /><textarea name="content" className="input" rows={3} required minLength={2} maxLength={2000} aria-label="Your response" /></ActionForm>}
          </Card>
        ))}
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg">Finished this lesson?</h2><p className="text-sm text-mist">{v.myProgress === "completed" ? "You have marked this lesson as completed." : "Mark it as completed to track your progress."}</p></div>
          {v.myProgress !== "completed" && <ActionForm action={progressAction} submit="Mark as completed" className="!space-y-0"><input type="hidden" name="lessonId" value={v.id} /><input type="hidden" name="status" value="completed" /></ActionForm>}
        </Card>
        <nav aria-label="Related lessons" className="flex justify-between text-sm">{v.related.map((r) => <Link key={r.id} href={`/learn/lessons/${r.id}`}>{r.week < v.week ? "← " : ""}Week {r.week}: {r.title}{r.week > v.week ? " →" : ""}</Link>)}</nav>
      </div>
    </>
  );
}
