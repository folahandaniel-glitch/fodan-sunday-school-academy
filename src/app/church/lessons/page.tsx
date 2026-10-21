import { requireOrg } from "@/server/guards";
import { LessonsIndex } from "@/components/staff/lessons";

export const dynamic = "force-dynamic";
export default async function Page() { const { ctx } = await requireOrg("lessons.teacher_view"); return <LessonsIndex ctx={ctx} base="/church" />; }
