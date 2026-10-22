import "server-only";
import path from "node:path";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = PgDatabase<any, typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

/** Local data lives OUTSIDE the project folder so file watchers and git never see database writes. Override with FSSA_DATA_DIR. */
export const dataDir = () => process.env.FSSA_DATA_DIR ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? process.cwd(), ".fodan-sunday-school-academy");

const g = globalThis as unknown as { __fssaDb?: Promise<DB> };

/**
 * Process-wide database handle. With DATABASE_URL it uses PostgreSQL (Neon, Vercel Postgres or any managed Postgres).
 * Without it an embedded PostgreSQL (PGlite) is used so the app runs with zero setup in development and in tests.
 * Pending migrations are applied and the built-in catalogue is seeded on first connection (both idempotent).
 */
export function getDb(): Promise<DB> {
  return (g.__fssaDb ??= init().catch((e) => { g.__fssaDb = undefined; throw e; }));
}
/** Tests inject their own database. */
export function setDb(db: DB) { g.__fssaDb = Promise.resolve(db); }

async function init(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  let db: DB;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const local = /127\.0\.0\.1|localhost/.test(url);
    const pool = new Pool({ connectionString: url, max: local ? 3 : Number(process.env.DATABASE_POOL_MAX ?? 5), idleTimeoutMillis: 20_000, ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false } });
    pool.on("error", (e) => console.warn("[db] idle connection dropped:", e.message));
    const d = drizzle(pool, { schema });
    await migrate(d, { migrationsFolder });
    db = d as unknown as DB;
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dir = process.env.FSSA_DB_MEMORY === "1" ? undefined : path.join(dataDir(), "pglite");
    if (dir) (await import("node:fs")).mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    const d = drizzle(client, { schema });
    await migrate(d, { migrationsFolder });
    db = d as unknown as DB;
  }
  const { ensureSeed } = await import("../seed");
  await ensureSeed(db);
  return db;
}

export { schema };

export { qid } from "./sql";
