import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireOrg } from "@/server/guards";
import { AppShell } from "@/components/app-shell";
import { CHURCH_NAV } from "@/lib/nav";

export default async function ChurchLayout({ children }: { children: ReactNode }) {
  const { user, ctx } = await requireOrg();
  if (ctx.role === "learner") redirect("/learn");
  if (ctx.role === "teacher") redirect("/teach");
  return <AppShell user={user} nav={CHURCH_NAV} area="Church administration" orgName={ctx.orgName} orgId={ctx.orgId}>{children}</AppShell>;
}
