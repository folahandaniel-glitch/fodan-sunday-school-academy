import { notFound } from "next/navigation";
import { requireOrg } from "@/server/guards";
import { AssignmentDetail } from "@/components/staff/assignments";
import { AccessError, NotFoundError } from "@/server/org";

export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireOrg("assignments.manage");
  try { return await AssignmentDetail({ ctx, id: (await params).id, base: "/teach" }); } catch (e) { if (e instanceof NotFoundError || e instanceof AccessError) notFound(); throw e; }
}
