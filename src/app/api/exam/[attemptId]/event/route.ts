import { apiOrgCtx, json, sameOrigin } from "@/server/api-auth";
import { recordEvent } from "@/server/services/exams";

export const dynamic = "force-dynamic";

/** Records integrity-relevant events (tab hidden, reconnected). Informational only: no automatic penalty is applied. */
export async function POST(req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  if (!(await sameOrigin())) return json({ ok: false }, 403);
  const ctx = await apiOrgCtx();
  if (!ctx) return json({ ok: false }, 401);
  try { const b = (await req.json()) as { event?: string }; await recordEvent(ctx, (await params).attemptId, String(b.event ?? "")); } catch { /* ignore */ }
  return json({ ok: true });
}
