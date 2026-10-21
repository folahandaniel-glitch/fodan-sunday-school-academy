import Link from "next/link";
import { notFound } from "next/navigation";
import { listThreads } from "@/server/services/forum";
import { requireUser } from "@/server/guards";
import { ActionForm } from "@/components/forms";
import { newThreadAction } from "@/app/actions/forum";
import { Card, Empty, PageHeader, Pagination } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";
import { NotFoundError } from "@/server/org";
import { platformCan } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function Category({ params, searchParams }: { params: Promise<{ category: string }>; searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const { category } = await params;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  let data;
  try { data = await listThreads(category, page); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const canPost = !user.isMinor && (!data.category.staffOnlyPosting || platformCan(user.platformRole, "forum.moderate"));
  return (
    <>
      <PageHeader crumbs={[{ label: "Forum", href: "/forum" }, { label: data.category.name }]} title={data.category.name} sub={data.category.description} />
      {data.threads.length === 0 ? <Empty title="No threads yet">Be the first to start a conversation.</Empty> : (
        <ul className="space-y-2">
          {data.threads.map((t) => (
            <li key={t.id} className="card card-pad"><Link href={`/forum/thread/${t.id}`} className="font-display text-lg text-navy">{t.pinned && "📌 "}{t.title}</Link>
              <p className="mt-1 text-xs text-mist">{t.author?.name}{t.author?.church ? ` · ${t.author.church}` : ""} · {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"} · last activity {fmtDateTime(t.lastActivityAt)}</p></li>
          ))}
        </ul>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} base={`/forum/${category}`} />
      <div className="mt-8">
        {canPost ? (
          <Card><h2 className="text-lg">Start a new thread</h2>
            <ActionForm action={newThreadAction} submit="Post thread" className="mt-3">
              <input type="hidden" name="category" value={category} />
              <div><label className="label" htmlFor="title">Title</label><input id="title" name="title" className="input" required minLength={5} maxLength={150} /></div>
              <div><label className="label" htmlFor="body">Message</label><textarea id="body" name="body" className="input" rows={5} required minLength={10} maxLength={6000} /><p className="hint">Do not post phone numbers, addresses or private details about other people. Posts are visible to members of every church.</p></div>
            </ActionForm></Card>
        ) : <p className="text-sm text-mist">{user.isMinor ? "Accounts for children can read the forum but cannot post." : "Only Academy staff can post in this category."}</p>}
      </div>
    </>
  );
}
