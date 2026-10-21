import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireOrg } from "@/server/guards";
import { AppShell } from "@/components/app-shell";
import { TEACHER_NAV } from "@/lib/nav";

export default async function TeachLayout({ children }: { children: ReactNode }) {
  const { user, ctx } = await requireOrg();
  if (ctx.role !== "teacher") redirect(ctx.role === "learner" ? "/learn" : "/church");
  return <AppShell user={user} nav={TEACHER_NAV} area="Teacher" orgName={ctx.orgName} orgId={ctx.orgId}>{children}</AppShell>;
}
