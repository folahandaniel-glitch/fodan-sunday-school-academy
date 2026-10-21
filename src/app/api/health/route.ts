import { getDb, schema } from "@/server/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Liveness and database check. Reveals no secrets or configuration values. */
export async function GET() {
  try {
    const db = await getDb();
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.curricula);
    return Response.json({ ok: true, database: "up", curricula: r.n });
  } catch {
    return Response.json({ ok: false, database: "down" }, { status: 503 });
  }
}
