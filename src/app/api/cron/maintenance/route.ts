import { enqueueJob, runDueJobs } from "@/server/services/admin";
import { safeEqual } from "@/server/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called daily by the scheduler with `Authorization: Bearer $CRON_SECRET`. Reconciles payments, expires plans, flushes email. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !given || !safeEqual(given, secret)) return new Response("Unauthorized", { status: 401 });
  await enqueueJob("maintenance", {}, { idempotencyKey: `daily:${new Date().toISOString().slice(0, 13)}` });
  const r = await runDueJobs(5);
  return Response.json({ ok: true, ...r });
}
