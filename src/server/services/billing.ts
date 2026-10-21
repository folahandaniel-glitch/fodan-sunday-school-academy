import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema, type DB, type Tx } from "../db";
import { AccessError, NotFoundError, assertCan, type OrgCtx } from "../org";
import { audit, type Actor } from "../audit";
import { randomToken } from "../crypto";
import { appUrl } from "../url";
import { emailAdminsOf, notify } from "./notify";
import { effectivePlan } from "./entitlements";
import { formatMoney } from "@/lib/money";
import { getSetting } from "../settings";

/* ===================== Provider abstraction ===================== */
export interface InitResult { checkoutUrl: string; providerReference: string }
export interface VerifyResult { status: "success" | "failed" | "pending" | "abandoned"; amountMinor: number; currency: string; reference: string }
export interface PaymentProvider {
  name: string;
  configured(): boolean;
  initialize(a: { reference: string; amountMinor: number; currency: string; email: string; callbackUrl: string; metadata: Record<string, string> }): Promise<InitResult>;
  verify(reference: string): Promise<VerifyResult>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseWebhook(rawBody: string): { eventId: string; type: string; reference: string | null } | null;
}

/** Paystack, written against its documented Initialize, Verify and webhook (HMAC-SHA512) endpoints. Not exercised against a live account in this build. */
const paystack: PaymentProvider = {
  name: "paystack",
  configured: () => !!process.env.PAYSTACK_SECRET_KEY,
  async initialize(a) {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: a.email, amount: a.amountMinor, currency: a.currency, reference: a.reference, callback_url: a.callbackUrl, metadata: a.metadata }),
    });
    const j = (await res.json()) as { status?: boolean; data?: { authorization_url?: string; reference?: string }; message?: string };
    if (!res.ok || !j.status || !j.data?.authorization_url) throw new Error(j.message ?? "Payment provider rejected the request.");
    return { checkoutUrl: j.data.authorization_url, providerReference: j.data.reference ?? a.reference };
  },
  async verify(reference) {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } });
    const j = (await res.json()) as { status?: boolean; data?: { status?: string; amount?: number; currency?: string; reference?: string } };
    if (!res.ok || !j.status || !j.data) return { status: "pending", amountMinor: 0, currency: "", reference };
    const s = j.data.status;
    return { status: s === "success" ? "success" : s === "failed" ? "failed" : s === "abandoned" ? "abandoned" : "pending", amountMinor: j.data.amount ?? 0, currency: j.data.currency ?? "", reference: j.data.reference ?? reference };
  },
  verifyWebhook(raw, sig) {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key || !sig) return false;
    const expected = createHmac("sha512", key).update(raw).digest("hex");
    const a = Buffer.from(expected), b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  },
  parseWebhook(raw) {
    try {
      const j = JSON.parse(raw) as { event?: string; data?: { id?: number | string; reference?: string } };
      if (!j.event) return null;
      return { eventId: `${j.event}:${j.data?.id ?? j.data?.reference ?? randomToken(6)}`, type: j.event, reference: j.data?.reference ?? null };
    } catch { return null; }
  },
};

/** Development-only simulator: exists only outside production and without a real key. It can never run on the live site. */
const simulator: PaymentProvider = {
  name: "simulator",
  configured: () => process.env.NODE_ENV !== "production" && !process.env.PAYSTACK_SECRET_KEY,
  async initialize(a) { return { checkoutUrl: `${a.callbackUrl}&simulate=1`, providerReference: a.reference }; },
  async verify(reference) { const db = await getDb(); const [t] = await db.select().from(schema.paymentTransactions).where(eq(schema.paymentTransactions.providerReference, reference)); return { status: "success", amountMinor: t?.amountMinor ?? 0, currency: t?.currency ?? "NGN", reference }; },
  verifyWebhook: () => false, parseWebhook: () => null,
};

export const providers: Record<string, PaymentProvider> = { paystack, simulator };
export function activeProvider(): PaymentProvider | null {
  if (paystack.configured()) return paystack;
  if (simulator.configured()) return simulator;
  return null;
}

/* ===================== Plans ===================== */
export async function publicPlans() {
  const db = await getDb();
  const plans = await db.select().from(schema.subscriptionPlans).where(eq(schema.subscriptionPlans.status, "active")).orderBy(schema.subscriptionPlans.sortOrder);
  const ents = await db.select().from(schema.planEntitlements);
  return plans.map((p) => ({ ...p, entitlements: Object.fromEntries(ents.filter((e) => e.planId === p.id).map((e) => [e.featureKey, e.limitValue])) }));
}
export async function allPlans() {
  const db = await getDb();
  const plans = await db.select().from(schema.subscriptionPlans).orderBy(schema.subscriptionPlans.sortOrder);
  const ents = await db.select().from(schema.planEntitlements);
  return plans.map((p) => ({ ...p, entitlements: ents.filter((e) => e.planId === p.id) }));
}
export async function savePlan(actor: Actor, id: string | null, d: { name: string; description: string; status: "draft" | "active" | "retired"; billingInterval: "free" | "monthly" | "quarterly" | "biannual" | "yearly"; priceMinor: number; currency: string; trialDays: number; highlights: string[]; entitlements: Record<string, number | null> }) {
  const db = await getDb();
  if (d.priceMinor < 0 || !Number.isInteger(d.priceMinor)) return { ok: false as const, error: "Price must be a whole number of minor units." };
  if (d.status === "active" && d.billingInterval !== "free" && d.priceMinor === 0) return { ok: false as const, error: "A paid plan needs a price before it can be activated." };
  const code = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const planId = await db.transaction(async (tx) => {
    let pid = id;
    const vals = { name: d.name.trim(), description: d.description, status: d.status, billingInterval: d.billingInterval, priceMinor: d.priceMinor, currency: d.currency.toUpperCase(), trialDays: d.trialDays, display: { highlights: d.highlights } };
    if (pid) await tx.update(schema.subscriptionPlans).set(vals).where(eq(schema.subscriptionPlans.id, pid));
    else { const [r] = await tx.insert(schema.subscriptionPlans).values({ ...vals, code }).returning({ id: schema.subscriptionPlans.id }); pid = r.id; }
    for (const [k, v] of Object.entries(d.entitlements)) await tx.insert(schema.planEntitlements).values({ planId: pid!, featureKey: k, limitValue: v }).onConflictDoUpdate({ target: [schema.planEntitlements.planId, schema.planEntitlements.featureKey], set: { limitValue: v } });
    await audit(actor, id ? "plan.updated" : "plan.created", { type: "plan", id: pid! }, { name: d.name, status: d.status }, { db: tx });
    return pid!;
  });
  return { ok: true as const, id: planId };
}

/* ===================== Checkout and settlement ===================== */
const INTERVAL_DAYS = { free: 0, monthly: 31, quarterly: 92, biannual: 183, yearly: 366 } as const;

export async function startCheckout(ctx: OrgCtx, planId: string, payerEmail: string) {
  assertCan(ctx, "billing.manage");
  const db = await getDb();
  const [plan] = await db.select().from(schema.subscriptionPlans).where(and(eq(schema.subscriptionPlans.id, planId), eq(schema.subscriptionPlans.status, "active")));
  if (!plan || plan.priceMinor <= 0) throw new NotFoundError("That plan is not available for purchase.");
  const provider = activeProvider();
  if (!provider) return { ok: false as const, error: "Online payment is not configured yet. Contact the Academy to arrange payment." };
  const reference = `FSSA-${Date.now().toString(36)}-${randomToken(6)}`.replace(/[^A-Za-z0-9-]/g, "x");
  await db.insert(schema.paymentTransactions).values({ organizationId: ctx.orgId, planId: plan.id, provider: provider.name, providerReference: reference, amountMinor: plan.priceMinor, currency: plan.currency, status: "initiated", purpose: "subscription", initiatedBy: ctx.userId });
  try {
    const init = await provider.initialize({ reference, amountMinor: plan.priceMinor, currency: plan.currency, email: payerEmail, callbackUrl: `${appUrl()}/church/billing/return?ref=${encodeURIComponent(reference)}`, metadata: { organizationId: ctx.orgId, planId: plan.id } });
    await db.update(schema.paymentTransactions).set({ status: "pending" }).where(eq(schema.paymentTransactions.providerReference, reference));
    await audit({ id: ctx.userId, label: ctx.userName }, "billing.checkout_started", { type: "payment", id: reference }, { plan: plan.code }, { orgId: ctx.orgId });
    return { ok: true as const, url: init.checkoutUrl, reference };
  } catch (e) {
    await db.update(schema.paymentTransactions).set({ status: "failed" }).where(eq(schema.paymentTransactions.providerReference, reference));
    return { ok: false as const, error: `Could not start payment: ${(e as Error).message}` };
  }
}

/**
 * THE ONLY place a paid plan is activated. It is idempotent and trusts only a provider-verified result: the browser redirect or an
 * unverified notification can never grant access. The verified amount and currency must equal what we asked for.
 */
export async function settlePayment(reference: string, verified: VerifyResult, source: "webhook" | "return" | "reconcile") {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(schema.paymentTransactions).where(eq(schema.paymentTransactions.providerReference, reference)).for("update");
    if (!t) return { ok: false as const, reason: "unknown_reference" };
    if (t.status === "success") return { ok: true as const, already: true };
    if (verified.status === "failed" || verified.status === "abandoned") {
      await tx.update(schema.paymentTransactions).set({ status: verified.status === "failed" ? "failed" : "abandoned", verificationStatus: "verified" }).where(eq(schema.paymentTransactions.id, t.id));
      return { ok: false as const, reason: verified.status };
    }
    if (verified.status !== "success") return { ok: false as const, reason: "pending" };
    if (verified.amountMinor !== t.amountMinor || verified.currency.toUpperCase() !== t.currency.toUpperCase()) {
      await tx.update(schema.paymentTransactions).set({ verificationStatus: "mismatch" }).where(eq(schema.paymentTransactions.id, t.id));
      await audit(null, "billing.amount_mismatch", { type: "payment", id: reference }, { expected: t.amountMinor, got: verified.amountMinor }, { orgId: t.organizationId, db: tx });
      return { ok: false as const, reason: "amount_mismatch" };
    }
    const [plan] = await tx.select().from(schema.subscriptionPlans).where(eq(schema.subscriptionPlans.id, t.planId!));
    const now = new Date();
    // Renewal extends from the current end date if the church still has time left; otherwise from now.
    const [cur] = await tx.select().from(schema.organizationSubscriptions).where(and(eq(schema.organizationSubscriptions.organizationId, t.organizationId), eq(schema.organizationSubscriptions.planId, plan.id), eq(schema.organizationSubscriptions.status, "active"))).orderBy(desc(schema.organizationSubscriptions.createdAt)).limit(1);
    const base = cur?.endAt && cur.endAt > now ? cur.endAt : now;
    const end = new Date(base.getTime() + INTERVAL_DAYS[plan.billingInterval] * 86_400_000);
    await tx.update(schema.organizationSubscriptions).set({ status: "cancelled" }).where(and(eq(schema.organizationSubscriptions.organizationId, t.organizationId), sql`${schema.organizationSubscriptions.status} in ('active','trialing','grace')`));
    await tx.insert(schema.organizationSubscriptions).values({ organizationId: t.organizationId, planId: plan.id, status: "active", startAt: now, endAt: end, source: "payment" });
    await tx.update(schema.paymentTransactions).set({ status: "success", verificationStatus: "verified", settledAt: now }).where(eq(schema.paymentTransactions.id, t.id));
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.invoices);
    await tx.insert(schema.invoices).values({ organizationId: t.organizationId, invoiceNumber: `FSSA-${now.getUTCFullYear()}-${String(n + 1).padStart(5, "0")}`, transactionId: t.id, currency: t.currency, subtotalMinor: t.amountMinor, totalMinor: t.amountMinor, paymentStatus: "paid", description: `${plan.name} plan` });
    await audit(null, "billing.settled", { type: "payment", id: reference }, { source, plan: plan.code }, { orgId: t.organizationId, db: tx });
    return { ok: true as const, already: false, orgId: t.organizationId, planName: plan.name, amount: formatMoney(t.amountMinor, t.currency) };
  }).then(async (r) => {
    if (r.ok && "orgId" in r && r.orgId && !r.already) await emailAdminsOf(r.orgId, "Payment received", `Your ${r.planName} plan is active (${r.amount}). Thank you.`, `paid:${reference}`);
    return r;
  });
}

export async function handleWebhook(providerName: string, rawBody: string, signature: string | null) {
  const p = providers[providerName];
  if (!p || providerName === "simulator") return { status: 404 };
  const db = await getDb();
  if (!p.configured() || !p.verifyWebhook(rawBody, signature)) {
    await db.insert(schema.paymentWebhookEvents).values({ provider: providerName, providerEventId: `rejected:${randomToken(8)}`, verificationStatus: "rejected", processingStatus: "ignored" });
    return { status: 401 };
  }
  const ev = p.parseWebhook(rawBody);
  if (!ev) return { status: 400 };
  const ins = await db.insert(schema.paymentWebhookEvents).values({ provider: providerName, providerEventId: ev.eventId, verificationStatus: "verified", payloadSummary: { type: ev.type, reference: ev.reference } }).onConflictDoNothing().returning({ id: schema.paymentWebhookEvents.id });
  if (!ins.length) return { status: 200, duplicate: true }; // already processed: acknowledge, do nothing
  if (ev.reference && /^(charge\.success|charge\.failed)$/.test(ev.type)) {
    const v = await p.verify(ev.reference); // never trust the payload: ask the provider
    await settlePayment(ev.reference, v, "webhook");
  }
  return { status: 200 };
}

export async function confirmReturn(ctx: OrgCtx, reference: string, simulate = false) {
  const db = await getDb();
  const [t] = await db.select().from(schema.paymentTransactions).where(and(eq(schema.paymentTransactions.providerReference, reference), eq(schema.paymentTransactions.organizationId, ctx.orgId)));
  if (!t) throw new NotFoundError("Payment not found.");
  const p = providers[t.provider];
  if (!p) throw new AccessError();
  if (t.provider === "simulator" && !simulate) return { ok: false as const, reason: "pending" };
  const v = await p.verify(reference);
  return settlePayment(reference, v, "return");
}

/** Daily maintenance: reconcile pending payments, expire lapsed plans and remind churches before they lapse. */
export async function billingMaintenance() {
  const db = await getDb();
  const out = { reconciled: 0, expired: 0, reminded: 0 };
  const pending = await db.select().from(schema.paymentTransactions).where(and(eq(schema.paymentTransactions.status, "pending"), sql`${schema.paymentTransactions.createdAt} < now() - interval '15 minutes'`)).limit(25);
  for (const t of pending) { const p = providers[t.provider]; if (!p || t.provider === "simulator") continue; try { await settlePayment(t.providerReference, await p.verify(t.providerReference), "reconcile"); out.reconciled++; } catch { /* retried tomorrow */ } }
  const grace = (await getSetting("features")).graceDays;
  const lapsed = await db.update(schema.organizationSubscriptions).set({ status: "expired" }).where(and(eq(schema.organizationSubscriptions.status, "active"), sql`${schema.organizationSubscriptions.endAt} < now() - make_interval(days => ${grace})`)).returning({ orgId: schema.organizationSubscriptions.organizationId });
  out.expired = lapsed.length;
  const soon = await db.select().from(schema.organizationSubscriptions).where(and(eq(schema.organizationSubscriptions.status, "active"), sql`${schema.organizationSubscriptions.endAt} between now() and now() + interval '7 days'`));
  for (const s of soon) { await emailAdminsOf(s.organizationId, "Your plan expires soon", `Your plan ends on ${s.endAt?.toISOString().slice(0, 10)}. Renew from Subscription and billing to keep your features.`, `expiring:${s.id}`); out.reminded++; }
  return out;
}

export async function billingOverview(ctx: OrgCtx) {
  const db = await getDb();
  const plan = await effectivePlan(ctx.orgId);
  const tx = await db.select().from(schema.paymentTransactions).where(eq(schema.paymentTransactions.organizationId, ctx.orgId)).orderBy(desc(schema.paymentTransactions.createdAt)).limit(20);
  const inv = await db.select().from(schema.invoices).where(eq(schema.invoices.organizationId, ctx.orgId)).orderBy(desc(schema.invoices.issuedAt)).limit(20);
  const [{ learners }] = await db.select({ learners: sql<number>`count(*)::int` }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, ctx.orgId), eq(schema.organizationMemberships.role, "learner"), eq(schema.organizationMemberships.status, "active")));
  const [{ classes }] = await db.select({ classes: sql<number>`count(*)::int` }).from(schema.classes).where(and(eq(schema.classes.organizationId, ctx.orgId), eq(schema.classes.status, "active")));
  return { plan, transactions: tx, invoices: inv, usage: { learners, classes }, providerReady: !!activeProvider() };
}

/** Super Admin grant (for scholarships or manual payment). Audited. */
export async function grantPlan(actor: Actor, orgId: string, planId: string, days: number, source: "admin_grant" | "scholarship" = "admin_grant") {
  const db = await getDb();
  const end = new Date(Date.now() + days * 86_400_000);
  await db.transaction(async (tx: Tx | DB) => {
    await tx.update(schema.organizationSubscriptions).set({ status: "cancelled" }).where(and(eq(schema.organizationSubscriptions.organizationId, orgId), sql`${schema.organizationSubscriptions.status} in ('active','trialing','grace')`));
    await tx.insert(schema.organizationSubscriptions).values({ organizationId: orgId, planId, status: "active", endAt: end, source });
    await audit(actor, "billing.granted", { type: "organization", id: orgId }, { planId, days, source }, { orgId, db: tx });
  });
  await emailAdminsOf(orgId, "Your plan was updated", "The Academy updated your church's plan.", `grant:${orgId}:${Date.now()}`);
}
export { notify };
