import { notFound } from "next/navigation";
import { requireOrg } from "@/server/guards";
import { GradingAttempt } from "@/components/staff/exams";
import { AccessError, NotFoundError } from "@/server/org";

export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { ctx } = await requireOrg("grading.mark");
  try { return await GradingAttempt({ ctx, attemptId: (await params).attemptId, base: "/church" }); } catch (e) { if (e instanceof NotFoundError || e instanceof AccessError) notFound(); throw e; }
}
