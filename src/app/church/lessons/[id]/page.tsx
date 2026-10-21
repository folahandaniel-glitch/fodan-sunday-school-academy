import { notFound } from "next/navigation";
import { requireOrg } from "@/server/guards";
import { LessonStaffPage } from "@/components/staff/lessons";
import { AccessError, NotFoundError } from "@/server/org";
import { isTranslation } from "@/lib/bible";

export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tr?: string }> }) {
  const { ctx } = await requireOrg("lessons.teacher_view");
  const sp = await searchParams;
  try { return await LessonStaffPage({ ctx, id: (await params).id, base: "/church", tr: isTranslation(sp.tr) ? sp.tr : "bsb" }); } catch (e) { if (e instanceof NotFoundError || e instanceof AccessError) notFound(); throw e; }
}
