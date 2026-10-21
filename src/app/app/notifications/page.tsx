import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { markAllRead, myNotifications } from "@/server/services/notify";
import { Empty, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";
import { markAllReadAction } from "@/app/actions/member";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function Notifications() {
  const user = await requireUser();
  const rows = await myNotifications(user.id);
  const unread = rows.filter((r) => !r.readAt).length;
  void markAllRead; // read state is changed only by the explicit button below
  return (
    <>
      <PageHeader title="Notifications" sub={unread ? `${unread} unread` : "You are up to date."} actions={unread ? <form action={markAllReadAction}><button className="btn btn-light btn-sm">Mark all as read</button></form> : undefined} />
      {rows.length === 0 ? <Empty title="No notifications yet">Approvals, lesson reminders, assignments and results will appear here.</Empty> : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id} className={`card card-pad ${n.readAt ? "" : "border-gold"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-semibold text-navy">{n.href ? <Link href={n.href}>{n.title}</Link> : n.title}</p><span className="text-xs text-mist">{fmtDateTime(n.createdAt, user.timezone)}</span></div>
              {n.body && <p className="mt-1 text-sm text-mist">{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
