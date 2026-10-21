import { requireOrg } from "@/server/guards";
import { AssignmentsIndex } from "@/components/staff/assignments";

export const dynamic = "force-dynamic";
export default async function Page() { const { ctx } = await requireOrg("assignments.manage"); return <AssignmentsIndex ctx={ctx} base="/church" />; }
