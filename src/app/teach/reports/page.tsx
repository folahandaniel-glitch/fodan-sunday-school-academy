import { requireOrg } from "@/server/guards";
import { ReportsView } from "@/components/staff/reports";

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ classId?: string; from?: string; to?: string }> }) { const { ctx } = await requireOrg("reports.view"); return <ReportsView ctx={ctx} base="/teach" sp={await searchParams} />; }
