import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction, switchChurchAction } from "@/app/actions/auth";
import { Logo } from "./logo";
import { NavLinks } from "./nav-links";
import type { NavItem } from "@/lib/nav";
import { Bell } from "lucide-react";
import { unreadCount } from "@/server/services/notify";
import { listMemberships } from "@/server/org";
import type { SessionUser } from "@/server/auth/session";

export async function AppShell({ user, nav, area, orgName, orgId, children }: { user: SessionUser; nav: NavItem[]; area: string; orgName?: string; orgId?: string; children: ReactNode }) {
  const [unread, memberships] = await Promise.all([unreadCount(user.id), listMemberships(user.id)]);
  const others = memberships.filter((m) => m.status === "active" && m.orgStatus === "active" && m.orgId !== orgId);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="no-print bg-navy text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-2 px-4 py-3 lg:block">
          <Link href="/" aria-label="Home"><Logo placement="header-dark" height={38} alt="Fodan Sunday School Academy" /></Link>
          <div className="mt-0 text-right lg:mt-3 lg:text-left"><p className="text-xs uppercase tracking-wider text-gold">{area}</p>{orgName && <p className="max-w-[12rem] truncate text-sm font-semibold lg:max-w-none" title={orgName}>{orgName}</p>}</div>
        </div>
        <details className="group lg:hidden px-3 pb-3"><summary className="btn btn-ghost-light btn-sm w-full cursor-pointer list-none">Menu</summary><div className="mt-2"><NavLinks items={nav} /></div></details>
        <div className="hidden px-3 pb-6 lg:block"><NavLinks items={nav} /></div>
      </aside>
      <div className="min-w-0">
        <div className="no-print flex items-center justify-end gap-3 border-b border-line bg-white px-4 py-2">
          {others.length > 0 && (
            <form action={switchChurchAction} className="flex items-center gap-1">
              <label className="sr-only" htmlFor="org-switch">Switch church</label>
              <select id="org-switch" name="orgId" className="input !min-h-9 !py-1 text-sm" defaultValue={orgId}>
                {orgId && <option value={orgId}>{orgName}</option>}{others.map((m) => <option key={m.orgId} value={m.orgId}>{m.orgName}</option>)}
              </select>
              <button className="btn btn-light btn-sm">Switch</button>
            </form>
          )}
          <Link href="/app/notifications" className="relative rounded-lg p-2 hover:bg-brand-50" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}><Bell size={20} aria-hidden />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}</Link>
          <span className="hidden text-sm text-mist sm:inline">{user.fullName}</span>
          <form action={logoutAction}><button className="btn btn-light btn-sm">Sign out</button></form>
        </div>
        <main id="main" className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
