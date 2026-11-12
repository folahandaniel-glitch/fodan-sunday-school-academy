import type { ReactNode } from "react";
import { requirePlatform } from "@/server/guards";
import { AppShell } from "@/components/app-shell";
import { ADMIN_NAV, ADMIN_NAV_NEEDS as NEEDS } from "@/lib/nav";
import { platformCan, type PlatformPerm } from "@/lib/permissions";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePlatform();
  const nav = ADMIN_NAV.filter((n) => !(NEEDS[n.href] as PlatformPerm | undefined) || platformCan(user, NEEDS[n.href] as PlatformPerm));
  return <AppShell user={user} nav={nav} area="Platform administration">{children}</AppShell>;
}
