import { requireOrg } from "@/server/guards";
import { GradingQueue } from "@/components/staff/exams";

export const dynamic = "force-dynamic";
export default async function Page() { const { ctx } = await requireOrg("grading.mark"); return <GradingQueue ctx={ctx} base="/church" />; }
