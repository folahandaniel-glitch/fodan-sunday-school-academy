import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, type Tx } from "../db";
import { audit, type Actor } from "../audit";
import { friendlyCode } from "../crypto";
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };
const fail = (error: string, field?: string): { ok: false; error: string; field?: string } => ({ ok: false, error, field });

export const normCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");

export interface GenerateInput { planId: string; quantity: number; durationDays: number | null; maxUses: number; redeemBy: Date | null; note: string }

/** Super Admin: create one or more single-purpose codes that attach a plan to a church when it registers. */
export async function generateAccessCodes(actor: Actor, d: GenerateInput): Promise<Result<{ codes: string[] }>> {
  if (!Number.isInteger(d.quantity) || d.quantity < 1 || d.quantity > 100) return fail("Choose between 1 and 100 codes at a time.");
  if (!Number.isInteger(d.maxUses) || d.maxUses < 1 || d.maxUses > 1000) return fail("Uses per code must be between 1 and 1000.");
  if (d.durationDays !== null && (!Number.isInteger(d.durationDays) || d.durationDays < 1 || d.durationDays > 3650)) return fail("Plan length must be between 1 and 3650 days, or left blank for no end date.");
  if (d.redeemBy && d.redeemBy.getTime() < Date.now()) return fail("The last redemption date must be in the future.");
  const db = await getDb();
  const [plan] = await db.select().from(schema.subscriptionPlans).where(eq(schema.subscriptionPlans.id, d.planId));
  if (!plan) return fail("Choose a package.");
  if (plan.status === "retired") return fail("That package is retired. Choose another one or reactivate it first.");
  if (plan.billingInterval === "free") return fail("The Free package needs no access code. Choose a paid package.");
  const prefix = plan.code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "FSSA";
  const codes: string[] = [];
  await db.transaction(async (tx) => {
    for (let i = 0; i < d.quantity; i++) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = `${prefix}-${friendlyCode(2, 4)}`;
        const [row] = await tx.insert(schema.churchAccessCodes).values({ code, planId: plan.id, durationDays: d.durationDays, maxUses: d.maxUses, redeemBy: d.redeemBy, note: d.note.trim().slice(0, 200), createdBy: actor.id }).onConflictDoNothing({ target: schema.churchAccessCodes.code }).returning({ id: schema.churchAccessCodes.id });
        if (row) { codes.push(code); break; }
      }
    }
    await audit(actor, "accesscode.generated", { type: "plan", id: plan.id }, { count: codes.length, plan: plan.code, durationDays: d.durationDays, maxUses: d.maxUses, note: d.note.slice(0, 80) }, { db: tx });
  });
  if (codes.length !== d.quantity) return fail("Could not create all the codes. Please try again.");
  return { ok: true, codes };
}

export async function revokeAccessCode(actor: Actor, id: string) {
  const db = await getDb();
  await db.update(schema.churchAccessCodes).set({ status: "revoked" }).where(eq(schema.churchAccessCodes.id, id));
  await audit(actor, "accesscode.revoked", { type: "access_code", id });
}

export type CodeState = "available" | "used" | "expired" | "revoked";
export function codeState(c: { status: string; usedCount: number; maxUses: number; redeemBy: Date | null }, now = Date.now()): CodeState {
  if (c.status === "revoked") return "revoked";
  if (c.usedCount >= c.maxUses) return "used";
  if (c.redeemBy && c.redeemBy.getTime() < now) return "expired";
  return "available";
}

export async function listAccessCodes(limit = 300) {
  const db = await getDb();
  const rows = await db.select({ c: schema.churchAccessCodes, plan: schema.subscriptionPlans.name }).from(schema.churchAccessCodes)
    .innerJoin(schema.subscriptionPlans, eq(schema.subscriptionPlans.id, schema.churchAccessCodes.planId)).orderBy(desc(schema.churchAccessCodes.createdAt)).limit(limit);
  const ids = rows.map((r) => r.c.id);
  const reds = ids.length ? await db.select({ codeId: schema.churchAccessCodeRedemptions.codeId, name: schema.organizations.name, at: schema.churchAccessCodeRedemptions.createdAt }).from(schema.churchAccessCodeRedemptions)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.churchAccessCodeRedemptions.organizationId)).where(inArray(schema.churchAccessCodeRedemptions.codeId, ids)) : [];
  return rows.map((r) => ({ ...r.c, planName: r.plan, state: codeState(r.c), churches: reds.filter((x) => x.codeId === r.c.id).map((x) => x.name) }));
}

/** Read-only check used before registration so the church gets a clear message. */
export async function checkAccessCode(raw: string): Promise<Result<{ planName: string }>> {
  const code = normCode(raw);
  const db = await getDb();
  const [row] = await db.select({ c: schema.churchAccessCodes, plan: schema.subscriptionPlans }).from(schema.churchAccessCodes)
    .innerJoin(schema.subscriptionPlans, eq(schema.subscriptionPlans.id, schema.churchAccessCodes.planId)).where(eq(schema.churchAccessCodes.code, code));
  if (!row) return fail("That access code was not recognised. Check it and try again, or ask the Academy.", "accessCode");
  const st = codeState(row.c);
  if (st === "revoked") return fail("That access code has been withdrawn. Please contact the Academy.", "accessCode");
  if (st === "used") return fail("That access code has already been used.", "accessCode");
  if (st === "expired") return fail("That access code has expired. Please contact the Academy for a new one.", "accessCode");
  if (row.plan.status === "retired") return fail("The package for that code is no longer offered. Please contact the Academy.", "accessCode");
  return { ok: true, planName: row.plan.name };
}

/**
 * Redeem inside the church-registration transaction. The code row is locked so two churches cannot use the last use at once.
 * Replaces any other live subscription with the plan the code carries.
 */
export async function redeemAccessCodeTx(tx: Tx, raw: string, orgId: string, userId: string): Promise<{ planName: string }> {
  const code = normCode(raw);
  const [c] = await tx.select().from(schema.churchAccessCodes).where(eq(schema.churchAccessCodes.code, code)).for("update");
  if (!c || codeState(c) !== "available") throw new Error("BAD_ACCESS_CODE");
  const [plan] = await tx.select().from(schema.subscriptionPlans).where(eq(schema.subscriptionPlans.id, c.planId));
  if (!plan || plan.status === "retired") throw new Error("BAD_ACCESS_CODE");
  await tx.update(schema.organizationSubscriptions).set({ status: "cancelled" }).where(sql`${schema.organizationSubscriptions.organizationId} = ${orgId} and ${schema.organizationSubscriptions.status} in ('active','trialing','grace')`);
  const endAt = c.durationDays ? new Date(Date.now() + c.durationDays * 86_400_000) : null;
  const [sub] = await tx.insert(schema.organizationSubscriptions).values({ organizationId: orgId, planId: plan.id, status: "active", endAt, source: "access_code" }).returning({ id: schema.organizationSubscriptions.id });
  await tx.insert(schema.churchAccessCodeRedemptions).values({ codeId: c.id, organizationId: orgId, redeemedBy: userId, subscriptionId: sub.id });
  await tx.update(schema.churchAccessCodes).set({ usedCount: c.usedCount + 1 }).where(eq(schema.churchAccessCodes.id, c.id));
  await audit(null, "accesscode.redeemed", { type: "access_code", id: c.id }, { orgId, plan: plan.code }, { orgId, db: tx });
  return { planName: plan.name };
}

/** A church administrator redeems a code on an existing church (to upgrade, or to renew after the Free 30 days). */
export async function redeemAccessCodeForOrg(orgId: string, userId: string, raw: string): Promise<Result<{ planName: string }>> {
  const ck = await checkAccessCode(raw);
  if (!ck.ok) return ck;
  const db = await getDb();
  try {
    const r = await db.transaction((tx) => redeemAccessCodeTx(tx, raw, orgId, userId));
    return { ok: true, planName: r.planName };
  } catch (e) {
    if ((e as Error).message === "BAD_ACCESS_CODE") return fail("That access code could not be used. It may have just been used or withdrawn.", "accessCode");
    if ((e as { code?: string }).code === "23505") return fail("This church has already used that access code.", "accessCode");
    throw e;
  }
}
