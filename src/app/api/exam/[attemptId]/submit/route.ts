import { apiOrgCtx, json, sameOrigin } from "@/server/api-auth";
import { submitAttempt } from "@/server/services/exams";
import { AccessError, NotFoundError } from "@/server/org";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Idempotent: pressing submit twice, or retrying after a dropped connection, returns the first result. */
export async function POST(_: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  if (!(await sameOrigin())) return json({ ok: false, error: "Bad origin." }, 403);
  const ctx = await apiOrgCtx();
  if (!ctx || ctx.role !== "learner") return json({ ok: false, error: "Please sign in again." }, 401);
  try {
    const r = await submitAttempt(ctx, (await params).attemptId, "learner");
    return json({ ok: true, already: r.already });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof AccessError) return json({ ok: false, error: "Not found." }, 404);
    console.error("[exam-submit]", (e as Error).message);
    return json({ ok: false, error: "Could not submit yet. Your answers are saved; try again." }, 500);
  }
}
