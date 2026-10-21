import { handleWebhook } from "@/server/services/billing";

export const dynamic = "force-dynamic";

/** Payment provider webhook. The signature is verified over the RAW body before anything is read; duplicates are acknowledged and ignored. */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const raw = await req.text();
  if (raw.length > 200_000) return new Response("Too large", { status: 413 });
  const r = await handleWebhook((await params).provider, raw, req.headers.get("x-paystack-signature"));
  return new Response(null, { status: r.status });
}
