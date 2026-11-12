import type { ReactNode } from "react";
import { AppShell } from "./app-shell";
import { getOrgCtx } from "@/server/guards";
import { ADMIN_NAV, ADMIN_NAV_NEEDS, BASIC_NAV, CHURCH_NAV, LEARNER_NAV, TEACHER_NAV } from "@/lib/nav";
import { platformCan, type PlatformPerm } from "@/lib/permissions";
import type { SessionUser } from "@/server/auth/session";

/** Shell for pages every signed-in member can reach (forum, profile, notifications), with navigation matching their role. */
export async function MemberShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const ctx = await getOrgCtx();
  const staff = platformCan(user, "admin.access");
  const nav = staff ? [...ADMIN_NAV.filter((n) => !ADMIN_NAV_NEEDS[n.href] || platformCan(user, ADMIN_NAV_NEEDS[n.href] as PlatformPerm)), { label: "Community Forum", href: "/forum", icon: "chat" }] : ctx ? (ctx.role === "learner" ? LEARNER_NAV : ctx.role === "teacher" ? TEACHER_NAV : CHURCH_NAV) : BASIC_NAV;
  return <AppShell user={user} nav={nav} area={staff ? "Platform administration" : ctx ? (ctx.role === "learner" ? "Learner" : ctx.role === "teacher" ? "Teacher" : "Church administration") : "Member"} orgName={ctx?.orgName} orgId={ctx?.orgId}>{children}</AppShell>;
}
