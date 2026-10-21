import { requireOrg } from "@/server/guards";
import { ExamsIndex } from "@/components/staff/exams";

export const dynamic = "force-dynamic";
export default async function Page() { const { ctx } = await requireOrg("classes.view"); return <ExamsIndex ctx={ctx} base="/teach" />; }
