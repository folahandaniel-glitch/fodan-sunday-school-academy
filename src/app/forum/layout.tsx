import type { ReactNode } from "react";
import { requireUser } from "@/server/guards";
import { MemberShell } from "@/components/member-shell";

export default async function ForumLayout({ children }: { children: ReactNode }) {
  const user = await requireUser({ next: "/forum" });
  return <MemberShell user={user}>{children}</MemberShell>;
}
