import { searchChurches } from "@/server/services/auth";
import { rateLimit } from "@/server/rate-limit";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/** Public church-name lookup for registration. Returns only name, place and listing status; no members, no contacts. */
export async function GET(req: Request) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  if (!(await rateLimit(`church-search:${ip}`, 60, 60))) return Response.json([], { status: 429 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json(await searchChurches(q.slice(0, 80)), { headers: { "Cache-Control": "no-store" } });
}
