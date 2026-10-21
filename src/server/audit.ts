import "server-only";
import { getDb, schema, type Executor } from "./db";

export interface Actor { id: string | null; label?: string; role?: string; ip?: string | null }

/** Keys that must never be written to the audit log. */
const SECRET_KEYS = /pass|token|secret|key|card|cvv|authorization|answer/i;
function scrub(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : typeof v === "string" && v.length > 500 ? v.slice(0, 500) + "…" : v;
  return out;
}

export async function audit(actor: Actor | null, action: string, target?: { type?: string; id?: string }, meta: Record<string, unknown> = {}, opts: { orgId?: string | null; db?: Executor } = {}) {
  const db = opts.db ?? (await getDb());
  await db.insert(schema.auditLogs).values({
    actorId: actor?.id ?? null, actorLabel: actor?.label ?? null, actorRole: actor?.role ?? null, organizationId: opts.orgId ?? null, action,
    targetType: target?.type ?? null, targetId: target?.id ?? null, meta: scrub(meta), ip: actor?.ip ?? null,
  });
}
