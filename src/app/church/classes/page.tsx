import { requireOrg } from "@/server/guards";
import { ClassesIndex } from "@/components/staff/classes";

export const dynamic = "force-dynamic";
export default async function Page() { const { ctx } = await requireOrg("classes.view"); return <ClassesIndex ctx={ctx} base="/church" />; }
