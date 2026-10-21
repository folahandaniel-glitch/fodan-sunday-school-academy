import type { ReactNode } from "react";
import { requireUser } from "@/server/guards";
import { MemberShell } from "@/components/member-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <MemberShell user={user}>{children}</MemberShell>;
}
