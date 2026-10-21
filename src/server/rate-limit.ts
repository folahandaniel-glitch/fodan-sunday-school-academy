import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema } from "./db";

/** Fixed-window limiter stored in the database so it holds across serverless instances. Returns true when the call is allowed. */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  if (process.env.NODE_ENV === "test" && !process.env.FSSA_TEST_RATELIMIT) return true;
  const db = await getDb();
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowSec * 1000);
  const [row] = await db
    .insert(schema.rateLimits)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`CASE WHEN ${schema.rateLimits.windowStart} < ${cutoff} THEN 1 ELSE ${schema.rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${schema.rateLimits.windowStart} < ${cutoff} THEN ${now} ELSE ${schema.rateLimits.windowStart} END`,
      },
    })
    .returning({ count: schema.rateLimits.count });
  return row.count <= max;
}
