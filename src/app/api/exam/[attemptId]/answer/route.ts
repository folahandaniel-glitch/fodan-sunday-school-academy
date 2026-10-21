import { apiOrgCtx, json, sameOrigin } from "@/server/api-auth";
import { saveAnswer, setFlag } from "@/server/services/exams";
import { AccessError, NotFoundError } from "@/server/org";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Autosave. Identity, church, attempt ownership, deadline and answer shape are all verified on the server. */
export async function PUT(req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  if (!(await sameOrigin())) return json({ ok: false, error: "Bad origin." }, 403);
  const ctx = await apiOrgCtx();
  if (!ctx || ctx.role !== "learner") return json({ ok: false, error: "Please sign in again." }, 401);
  const { attemptId } = await params;
  if (!(await rateLimit(`exam-save:${ctx.userId}`, 240, 60))) return json({ ok: false, error: "Slow down." }, 429);
  let body: { eqId?: string; answer?: unknown; flagged?: boolean; flagOnly?: boolean };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Bad request." }, 400); }
  if (typeof body.eqId !== "string") return json({ ok: false, error: "Bad request." }, 400);
  try {
    const r = body.flagOnly ? await setFlag(ctx, attemptId, body.eqId, !!body.flagged) : await saveAnswer(ctx, attemptId, body.eqId, body.answer ?? null, body.flagged);
    return json(r, r.ok ? 200 : 409);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof AccessError) return json({ ok: false, error: "Not found." }, 404);
    console.error("[exam-save]", (e as Error).message);
    return json({ ok: false, error: "Could not save. Retrying." }, 500);
  }
}
