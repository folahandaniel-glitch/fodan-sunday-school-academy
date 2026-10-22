import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getSetting } from "../settings";

export class EntitlementError extends Error {
  constructor(message: string, readonly feature: string) { super(message); this.name = "EntitlementError"; }
}

export const FEATURE_LABELS: Record<string, string> = {
  maxLearners: "Learners", maxClasses: "Active classes", maxActiveSessions: "Active sessions", maxAdmins: "Administrators", examsPerSession: "Examinations per session",
  curriculumTier: "Curriculum access", downloads: "Downloadable lesson materials", certificates: "Certificates", advancedReports: "Advanced reports", customBranding: "Church branding", aiAssist: "AI-assisted authoring", storageMb: "Storage (MB)",
};
export const BOOLEAN_FEATURES = ["downloads", "certificates", "advancedReports", "customBranding", "aiAssist"];
export const TIER_RANK = { free: 0, standard: 1, premium: 2 } as const;

export interface EffectivePlan { planId: string; code: string; name: string; status: string; endAt: Date | null; entitlements: Record<string, number | null> }

/**
 * The plan that governs a church RIGHT NOW. A paid plan keeps working through the grace period after its end date; the Free 30-day start has no grace.
 * When a church's plan has ended and nothing replaces it, the church has NO entitlements until it renews or redeems an access code (status "expired").
 * Churches that never had a subscription at all (for example a church listed by a member and not yet claimed) are treated as Free. History is never deleted.
 */
export async function effectivePlan(orgId: string): Promise<EffectivePlan> {
  const db = await getDb();
  const grace = (await getSetting("features")).graceDays;
  const subs = await db.select({ s: schema.organizationSubscriptions, p: schema.subscriptionPlans }).from(schema.organizationSubscriptions)
    .innerJoin(schema.subscriptionPlans, eq(schema.subscriptionPlans.id, schema.organizationSubscriptions.planId))
    .where(eq(schema.organizationSubscriptions.organizationId, orgId)).orderBy(desc(schema.organizationSubscriptions.createdAt));
  const now = Date.now();
  const live = subs.find(({ s, p }) => {
    if (s.status === "cancelled" || s.status === "expired") return false;
    if (!s.endAt) return true;
    const g = p.billingInterval === "free" ? 0 : grace;
    return s.endAt.getTime() + g * 86_400_000 > now;
  });
  if (live) {
    const ents = await db.select().from(schema.planEntitlements).where(eq(schema.planEntitlements.planId, live.p.id));
    return { planId: live.p.id, code: live.p.code, name: live.p.name, status: live.s.status, endAt: live.s.endAt ?? null, entitlements: Object.fromEntries(ents.map((x) => [x.featureKey, x.limitValue])) };
  }
  if (subs.length > 0) {
    const last = subs[0];
    return { planId: last.p.id, code: last.p.code, name: last.p.name, status: "expired", endAt: last.s.endAt ?? null, entitlements: {} };
  }
  const [free] = await db.select().from(schema.subscriptionPlans).where(eq(schema.subscriptionPlans.code, "free"));
  const ents = await db.select().from(schema.planEntitlements).where(eq(schema.planEntitlements.planId, free.id));
  return { planId: free.id, code: free.code, name: free.name, status: "default", endAt: null, entitlements: Object.fromEntries(ents.map((x) => [x.featureKey, x.limitValue])) };
}

/** null = unlimited. Missing key = 0 (denied). */
export async function limitOf(orgId: string, key: string): Promise<number | null> {
  const p = await effectivePlan(orgId);
  return key in p.entitlements ? p.entitlements[key] : 0;
}
export async function hasFeature(orgId: string, key: string) {
  const l = await limitOf(orgId, key);
  return l === null || l > 0;
}
export async function assertFeature(orgId: string, key: string) {
  if (!(await hasFeature(orgId, key))) throw new EntitlementError((await effectivePlan(orgId)).status === "expired" ? "Your church's plan has ended. Renew your package or enter an access code under Billing to continue." : `${FEATURE_LABELS[key] ?? key} is not included in your church's current plan.`, key);
}
/** Throws when adding `adding` to `current` would exceed the plan limit. */
export async function assertWithinLimit(orgId: string, key: string, current: number, adding = 1) {
  const l = await limitOf(orgId, key);
  if (l !== null && current + adding > l) throw new EntitlementError(`Your church's plan allows ${l} ${FEATURE_LABELS[key]?.toLowerCase() ?? key}. Upgrade to add more.`, key);
}
export async function curriculumTierAllowed(orgId: string, tier: keyof typeof TIER_RANK) {
  const l = await limitOf(orgId, "curriculumTier");
  return l === null || TIER_RANK[tier] <= l;
}
export async function planStatusFor(orgId: string) {
  const db = await getDb();
  const [sub] = await db.select().from(schema.organizationSubscriptions).where(and(eq(schema.organizationSubscriptions.organizationId, orgId))).orderBy(desc(schema.organizationSubscriptions.createdAt)).limit(1);
  return { plan: await effectivePlan(orgId), latest: sub ?? null };
}
