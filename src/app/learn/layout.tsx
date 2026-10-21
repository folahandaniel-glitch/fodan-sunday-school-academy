import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireOrg } from "@/server/guards";
import { AppShell } from "@/components/app-shell";
import { LEARNER_NAV } from "@/lib/nav";

export default async function LearnLayout({ children }: { children: ReactNode }) {
  const { user, ctx } = await requireOrg();
  if (ctx.role !== "learner") redirect(ctx.role === "teacher" ? "/teach" : "/church");
  return <AppShell user={user} nav={LEARNER_NAV} area="Learner" orgName={ctx.orgName} orgId={ctx.orgId}>{children}</AppShell>;
}
