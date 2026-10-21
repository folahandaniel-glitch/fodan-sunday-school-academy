import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { planSlots, proposeSchedule, rescheduleFrom, eligibleDates } from "@/lib/schedule";
import { gradeAnswer, gradeFor, percent } from "@/lib/grading";
import { toMinor, formatMoney } from "@/lib/money";
import { getDb, schema } from "@/server/db";
import { settlePayment, handleWebhook } from "@/server/services/billing";
import { effectivePlan, assertWithinLimit } from "@/server/services/entitlements";
import { createThread, reply } from "@/server/services/forum";
import { boot, makeChurch, addPerson, uniq, STRONG } from "./helpers";
import { registerMember } from "@/server/services/auth";
import type { SessionUser } from "@/server/auth/session";

describe("scheduling logic", () => {
  it("defaults put the test in week 13, exam in 25 and revision in 26, covering all 26 units once", () => {
    const { slots } = planSlots();
    expect(slots).toHaveLength(26);
    expect(slots.filter((s) => s.type !== "teaching").map((s) => [s.slot, s.type])).toEqual([[13, "midtest"], [25, "final"], [26, "revision"]]);
    expect(new Set(slots.map((s) => s.unitWeek)).size).toBe(26);
  });
  it("supports revision before the examination and rejects invalid layouts", () => {
    const { slots } = planSlots({ midtestWeek: 13, finalWeek: 26, revisionWeek: 25 });
    expect(slots[24].type).toBe("revision");
    expect(slots[25].type).toBe("final");
    expect(planSlots({ midtestWeek: 13, finalWeek: 13, revisionWeek: 26 }).errors.length).toBeGreaterThan(0);
    expect(planSlots({ midtestWeek: 20, finalWeek: 10, revisionWeek: 26 }).errors.length).toBeGreaterThan(0);
  });
  it("finds 26 Sundays in Jan-Jun 2026 and skips holidays", () => {
    const all = eligibleDates("2026-01-01", "2026-06-30", 0);
    expect(all).toHaveLength(26);
    const p = proposeSchedule({ ...{ midtestWeek: 13, finalWeek: 25, revisionWeek: 26 }, start: "2026-01-01", end: "2026-06-30", weekday: 0, exclude: ["2026-04-05"], shortfallPolicy: "extend" });
    expect(p.shortfall).toBe(1);
    expect(p.slots.every((s) => s.date)).toBe(true);
    expect(p.slots[25].beyondEnd).toBe(true);
    expect(p.slots.map((s) => s.date)).not.toContain("2026-04-05");
  });
  it("never drops lessons whichever shortfall policy is chosen", () => {
    for (const shortfallPolicy of ["extend", "combine", "unscheduled"] as const) {
      const p = proposeSchedule({ midtestWeek: 13, finalWeek: 25, revisionWeek: 26, start: "2026-07-01", end: "2026-10-31", weekday: 0, shortfallPolicy });
      expect(p.slots).toHaveLength(26);
    }
    const c = proposeSchedule({ midtestWeek: 13, finalWeek: 25, revisionWeek: 26, start: "2026-07-01", end: "2026-12-05", weekday: 0, shortfallPolicy: "combine" });
    expect(c.slots.filter((s) => s.combinedWithSlot).length).toBe(c.shortfall);
  });
  it("reschedules only undelivered lessons", () => {
    const out = rescheduleFrom([{ slot: 1, date: "2026-01-04", delivered: true }, { slot: 2, date: "2026-01-11", delivered: false }, { slot: 3, date: "2026-01-18", delivered: false }], 2, "2026-01-25", ["2026-02-01"]);
    expect(out).toEqual([{ slot: 2, date: "2026-01-25" }, { slot: 3, date: "2026-02-08" }]);
  });
});

describe("grading and money", () => {
  it("grades objective answers and never auto-fails written answers", () => {
    expect(gradeAnswer({ type: "mcq", correct: 2 }, 2, 1).awarded).toBe(1);
    expect(gradeAnswer({ type: "mcq", correct: 2 }, 1, 1).awarded).toBe(0);
    expect(gradeAnswer({ type: "tf", correct: false }, false, 1).awarded).toBe(1);
    expect(gradeAnswer({ type: "multi", correct: [0, 2] }, [0, 1], 2).awarded).toBe(0);
    expect(gradeAnswer({ type: "multi", correct: [0, 2] }, [0, 2], 2).awarded).toBe(2);
    expect(gradeAnswer({ type: "fill", accepted: ["Jesus Christ", "Christ Jesus"] }, "  christ  jesus. ", 2).awarded).toBe(2);
    const miss = gradeAnswer({ type: "fill", accepted: ["Moses"] }, "Mosses", 2);
    expect(miss.awarded).toBeNull();
    const w = gradeAnswer({ type: "short", keywords: ["grace", "faith"], rubric: "r" }, "By grace through faith", 5);
    expect(w.awarded).toBeNull();
    expect(w.suggested).toBe(5);
    expect(gradeAnswer({ type: "essay", rubric: "r", keyPoints: [] }, "text", 10).status).toBe("pending");
  });
  it("applies grades and percentages consistently", () => {
    expect(percent(36, 39)).toBe(92.31);
    expect(gradeFor(70, [{ min: 70, grade: "A" }, { min: 0, grade: "F" }])).toBe("A");
    expect(gradeFor(69.99, [{ min: 70, grade: "A" }, { min: 0, grade: "F" }])).toBe("F");
  });
  it("keeps money in integer minor units", () => {
    expect(toMinor("1500.50", "NGN")).toBe(150050);
    expect(toMinor("1500.505", "NGN")).toBeNull();
    expect(toMinor("1500", "JPY")).toBe(1500);
    expect(formatMoney(150050, "NGN")).toContain("1,500.50");
  });
});

describe("billing, entitlements and forum", () => {
  let org: Awaited<ReturnType<typeof makeChurch>>;
  let planId: string;
  beforeAll(async () => {
    await boot([]);
    org = await makeChurch("Billing Test Church");
    const db = await getDb();
    const [p] = await db.insert(schema.subscriptionPlans).values({ code: uniq("pro"), name: "Pro", status: "active", billingInterval: "yearly", priceMinor: 2500000, currency: "NGN" }).returning({ id: schema.subscriptionPlans.id });
    planId = p.id;
    await db.insert(schema.planEntitlements).values([{ planId, featureKey: "maxLearners", limitValue: null }, { planId, featureKey: "certificates", limitValue: 1 }]);
  });
  it("starts on the Free plan and enforces its limits on the server", async () => {
    const plan = await effectivePlan(org.orgId);
    expect(plan.code).toBe("free");
    await expect(assertWithinLimit(org.orgId, "maxLearners", 100)).rejects.toThrow();
    await expect(assertWithinLimit(org.orgId, "maxLearners", 99)).resolves.toBeUndefined();
  });
  async function txn(ref: string, amount = 2500000) {
    const db = await getDb();
    await db.insert(schema.paymentTransactions).values({ organizationId: org.orgId, planId, provider: "paystack", providerReference: ref, amountMinor: amount, currency: "NGN", status: "pending", initiatedBy: org.userId });
  }
  it("activates a paid plan only after a verified, matching payment, exactly once", async () => {
    await txn("REF-OK");
    expect((await settlePayment("REF-OK", { status: "pending", amountMinor: 0, currency: "", reference: "REF-OK" }, "return")).ok).toBe(false);
    expect((await effectivePlan(org.orgId)).code).toBe("free");
    expect((await settlePayment("REF-OK", { status: "success", amountMinor: 1, currency: "NGN", reference: "REF-OK" }, "webhook")).ok).toBe(false); // amount mismatch
    expect((await effectivePlan(org.orgId)).code).toBe("free");
    const ok = await settlePayment("REF-OK", { status: "success", amountMinor: 2500000, currency: "NGN", reference: "REF-OK" }, "webhook");
    expect(ok.ok).toBe(true);
    const again = await settlePayment("REF-OK", { status: "success", amountMinor: 2500000, currency: "NGN", reference: "REF-OK" }, "return");
    expect(again.ok && again.already).toBe(true);
    const db = await getDb();
    expect((await db.select().from(schema.invoices).where(eq(schema.invoices.organizationId, org.orgId))).length).toBe(1);
    const plan = await effectivePlan(org.orgId);
    expect(plan.code).toContain("pro");
    await expect(assertWithinLimit(org.orgId, "maxLearners", 5000)).resolves.toBeUndefined();
  });
  it("records failed payments without granting access and rejects unsigned webhooks", async () => {
    await txn("REF-FAIL");
    const f = await settlePayment("REF-FAIL", { status: "failed", amountMinor: 2500000, currency: "NGN", reference: "REF-FAIL" }, "webhook");
    expect(f.ok).toBe(false);
    const db = await getDb();
    const [t] = await db.select().from(schema.paymentTransactions).where(eq(schema.paymentTransactions.providerReference, "REF-FAIL"));
    expect(t.status).toBe("failed");
    process.env.PAYSTACK_SECRET_KEY = "sk_test_unit";
    const body = JSON.stringify({ event: "charge.success", data: { id: 1, reference: "REF-X" } });
    expect((await handleWebhook("paystack", body, "bad-signature")).status).toBe(401);
    const sig = createHmac("sha512", "sk_test_unit").update(body).digest("hex");
    const first = await handleWebhook("paystack", body.replace("REF-X", "REF-NONE"), sig); // signature no longer matches the changed body
    expect(first.status).toBe(401);
    delete process.env.PAYSTACK_SECRET_KEY;
  });
  it("lets any member, even one still pending approval, use the shared forum; children cannot post", async () => {
    const em = `${uniq("f")}@test.org`;
    const reg = await registerMember({ fullName: "Fola Forum", email: em, password: STRONG, role: "learner", orgId: org.orgId, joinCode: "", isThirteenOrOlder: true, acceptTerms: true });
    if (!reg.ok) throw new Error(reg.error);
    const db = await getDb();
    const [cat] = await db.select().from(schema.forumCategories).where(eq(schema.forumCategories.slug, "general"));
    const user = { id: reg.userId, fullName: "Fola Forum", platformRole: "member", isMinor: false } as unknown as SessionUser;
    const t = await createThread(user, cat.slug, "Hello from a pending member", "I am new here and glad to join the conversation.");
    expect(t.ok).toBe(true);
    if (t.ok) expect((await reply(user, t.id, "Welcome!")).ok).toBe(true);
    const child = await addPerson(org.ctx, "learner", "Little Child");
    await db.update(schema.users).set({ isMinor: true }).where(eq(schema.users.id, child.userId));
    await expect(createThread({ ...user, id: child.userId, isMinor: true } as SessionUser, cat.slug, "Child post attempt", "This should not be allowed to post.")).rejects.toThrow();
  });
});
