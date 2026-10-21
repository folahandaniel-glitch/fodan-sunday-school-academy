import { apiOrgCtx } from "@/server/api-auth";
import { reportCsv } from "@/server/services/reports";
import { AccessError, assertCan } from "@/server/org";
import { isIsoDate } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** Church report as CSV. Scope (church, classes) is derived from the signed-in user on the server. */
export async function GET(req: Request) {
  const ctx = await apiOrgCtx();
  if (!ctx) return new Response("Please sign in.", { status: 401 });
  try {
    assertCan(ctx, "reports.view");
    const u = new URL(req.url).searchParams;
    const from = u.get("from") ?? undefined, to = u.get("to") ?? undefined;
    const csv = await reportCsv(ctx, { classId: u.get("classId") || undefined, from: from && isIsoDate(from) ? from : undefined, to: to && isIsoDate(to) ? to : undefined });
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="church-report-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AccessError) return new Response("Not allowed.", { status: 403 });
    throw e;
  }
}
