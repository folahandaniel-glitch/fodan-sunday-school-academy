import { notFound } from "next/navigation";
import { getThread } from "@/server/services/forum";
import { requireUser } from "@/server/guards";
import { ActionForm, ActionButton } from "@/components/forms";
import { replyAction, reportAction, moderateAction } from "@/app/actions/forum";
import { Badge, Card, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";
import { NotFoundError } from "@/server/org";

export const dynamic = "force-dynamic";

export default async function Thread({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  let d;
  try { d = await getThread((await params).id, user); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const who = (a: typeof d.thread.author) => <span><strong>{a?.name ?? "Member"}</strong>{a?.staff && <> <Badge tone="info">Academy staff</Badge></>}{a?.church && <span className="text-xs text-mist"> · {a.church}</span>}</span>;
  return (
    <>
      <PageHeader crumbs={[{ label: "Forum", href: "/forum" }, { label: d.category.name, href: `/forum/${d.category.slug}` }, { label: "Thread" }]} title={d.thread.title} />
      <article className="card card-pad"><p className="text-sm">{who(d.thread.author)} · <span className="text-xs text-mist">{fmtDateTime(d.thread.createdAt, user.timezone)}</span></p>
        <p className="mt-3 whitespace-pre-wrap">{d.thread.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <details className="text-sm"><summary className="cursor-pointer text-mist">Report this post</summary><ActionForm action={reportAction} submit="Send report" className="mt-2"><input type="hidden" name="threadId" value={d.thread.id} /><input name="reason" className="input" placeholder="What is wrong?" required minLength={5} /></ActionForm></details>
          {d.canModerate && <ActionButton action={moderateAction} fields={{ kind: "thread", id: d.thread.id, to: "hidden" }} label="Hide thread" tone="danger" confirm="Hide this thread from members?" />}
          {d.canModerate && <ActionButton action={moderateAction} fields={{ kind: "thread", id: d.thread.id, to: d.thread.status === "locked" ? "visible" : "locked" }} label={d.thread.status === "locked" ? "Unlock" : "Lock"} />}
        </div>
      </article>
      <h2 className="mb-2 mt-6 text-lg">{d.posts.length} {d.posts.length === 1 ? "reply" : "replies"}</h2>
      <ul className="space-y-2">
        {d.posts.map((p) => (
          <li key={p.id} className={`card card-pad ${p.status === "hidden" ? "opacity-60" : ""}`}><p className="text-sm">{who(p.author)} · <span className="text-xs text-mist">{fmtDateTime(p.createdAt, user.timezone)}</span> {p.status === "hidden" && <Badge tone="bad">hidden</Badge>}</p>
            <p className="mt-2 whitespace-pre-wrap">{p.body}</p>
            <div className="mt-2 flex flex-wrap gap-2"><details className="text-sm"><summary className="cursor-pointer text-mist">Report</summary><ActionForm action={reportAction} submit="Send report" className="mt-2"><input type="hidden" name="postId" value={p.id} /><input name="reason" className="input" placeholder="What is wrong?" required minLength={5} /></ActionForm></details>
              {d.canModerate && <ActionButton action={moderateAction} fields={{ kind: "post", id: p.id, to: p.status === "hidden" ? "visible" : "hidden" }} label={p.status === "hidden" ? "Restore" : "Hide"} />}</div></li>
        ))}
      </ul>
      <div className="mt-6">
        {d.thread.status === "locked" ? <p className="text-sm text-mist">This thread is locked.</p> : user.isMinor ? <p className="text-sm text-mist">Accounts for children can read but not post.</p> : (
          <Card><h2 className="text-lg">Reply</h2><ActionForm action={replyAction} submit="Post reply" className="mt-3" resetOnSuccess><input type="hidden" name="threadId" value={d.thread.id} /><textarea name="body" className="input" rows={4} required minLength={2} maxLength={6000} aria-label="Your reply" /></ActionForm></Card>
        )}
      </div>
    </>
  );
}
