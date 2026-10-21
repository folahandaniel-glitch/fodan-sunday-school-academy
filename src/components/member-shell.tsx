import type { ReactNode } from "react";
import { AppShell } from "./app-shell";
import { getOrgCtx } from "@/server/guards";
import { ADMIN_NAV, CHURCH_NAV, LEARNER_NAV, TEACHER_NAV, type NavItem } from "@/lib/nav";
import { platformCan } from "@/lib/permissions";
import type { SessionUser } from "@/server/auth/session";

const BASIC: NavItem[] = [
  { label: "My Dashboard", href: "/app", icon: "home", exact: true }, { label: "Community Forum", href: "/forum", icon: "chat" },
  { label: "Notifications", href: "/app/notifications", icon: "bell" }, { label: "My Profile", href: "/app/profile", icon: "user" },
];

/** Shell for pages every signed-in member can reach (forum, profile, notifications), with navigation matching their role. */
export async function MemberShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const ctx = await getOrgCtx();
  const staff = platformCan(user.platformRole, "admin.access");
  const nav = staff ? [...ADMIN_NAV, { label: "Community Forum", href: "/forum", icon: "chat" }] : ctx ? (ctx.role === "learner" ? LEARNER_NAV : ctx.role === "teacher" ? TEACHER_NAV : CHURCH_NAV) : BASIC;
  return <AppShell user={user} nav={nav} area={staff ? "Platform administration" : ctx ? (ctx.role === "learner" ? "Learner" : ctx.role === "teacher" ? "Teacher" : "Church administration") : "Member"} orgName={ctx?.orgName} orgId={ctx?.orgId}>{children}</AppShell>;
}
