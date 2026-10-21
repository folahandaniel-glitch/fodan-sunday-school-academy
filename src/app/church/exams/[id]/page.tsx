import { notFound } from "next/navigation";
import { requireOrg } from "@/server/guards";
import { ExamDetail } from "@/components/staff/exams";
import { AccessError, NotFoundError } from "@/server/org";

export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireOrg("classes.view");
  try { return await ExamDetail({ ctx, id: (await params).id, base: "/church" }); } catch (e) { if (e instanceof NotFoundError || e instanceof AccessError) notFound(); throw e; }
}
