import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { listAnnouncements } from "@/server/services/church";
import { ActionForm } from "@/components/forms";
import { announceAction } from "@/app/actions/staff";
import { Card, Empty, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

export default async function Announcements() {
  const { ctx } = await requireOrg("announcements.manage");
  const rows = await listAnnouncements(ctx, 30);
  return (
    <>
      <PageHeader title="Announcements" sub="Messages to every member of your church (in the app, and by email where members allow it)." />
      <Card><h2 className="text-lg">New announcement</h2>
        <ActionForm action={announceAction} submit="Send to all members" className="mt-2" resetOnSuccess confirm="Send this announcement to every member of your church?">
          <div><label className="label" htmlFor="title">Title</label><input id="title" name="title" className="input" required minLength={3} maxLength={120} /></div>
          <div><label className="label" htmlFor="body">Message</label><textarea id="body" name="body" className="input" rows={4} required minLength={3} maxLength={3000} /></div>
        </ActionForm></Card>
      <h2 className="mb-2 mt-6 text-lg">Previous announcements</h2>
      {rows.length === 0 ? <Empty title="Nothing sent yet" /> : <ul className="space-y-2">{rows.map((a) => <li key={a.id} className="card card-pad"><p className="font-semibold text-navy">{a.title}</p><p className="mt-1 whitespace-pre-line text-sm">{a.body}</p><p className="mt-1 text-xs text-mist">{fmtDateTime(a.createdAt, ctx.timezone)}</p></li>)}</ul>}
    </>
  );
}
