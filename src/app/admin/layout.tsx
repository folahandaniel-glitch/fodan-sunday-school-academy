import type { ReactNode } from "react";
import { requirePlatform } from "@/server/guards";
import { AppShell } from "@/components/app-shell";
import { ADMIN_NAV } from "@/lib/nav";
import { platformCan, type PlatformPerm } from "@/lib/permissions";

const NEEDS: Record<string, PlatformPerm> = {
  "/admin/churches": "churches.view", "/admin/users": "users.manage", "/admin/curricula": "curriculum.write", "/admin/review": "curriculum.review", "/admin/completeness": "curriculum.write", "/admin/categories": "curriculum.write", "/admin/import": "curriculum.write",
  "/admin/plans": "plans.manage", "/admin/payments": "payments.view", "/admin/site": "site.edit", "/admin/branding": "branding.edit", "/admin/forum": "forum.moderate", "/admin/settings": "settings.manage", "/admin/jobs": "jobs.view", "/admin/audit": "audit.view", "/admin/analytics": "reports.platform",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePlatform();
  const nav = ADMIN_NAV.filter((n) => !NEEDS[n.href] || platformCan(user.platformRole, NEEDS[n.href]));
  return <AppShell user={user} nav={nav} area="Platform administration">{children}</AppShell>;
}
