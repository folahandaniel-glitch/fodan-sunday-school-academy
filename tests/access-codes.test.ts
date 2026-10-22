import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { boot, makeChurch, registerMember, STRONG, uniq } from "./helpers";
import { effectivePlan } from "@/server/services/entitlements";
import { generateAccessCodes, revokeAccessCode, checkAccessCode, listAccessCodes } from "@/server/services/access-codes";
import { registerChurch } from "@/server/services/auth";
import type { Actor } from "@/server/audit";

let actor: Actor;
beforeAll(async () => { ({ actor } = await boot([1])); });

async function planId(code: string) {
  const db = await getDb();
  const [p] = await db.select().from(schema.subscriptionPlans).where(eq(schema.subscriptionPlans.code, code));
  return p.id;
}

describe("church access codes", () => {
  it("seeds exactly the five agreed packages, with no duplicates and the agreed prices", async () => {
    const db = await getDb();
    const rows = (await db.select().from(schema.subscriptionPlans)).sort((a, b) => a.sortOrder - b.sortOrder);
    expect(rows.map((p) => p.code)).toEqual(["free", "silver", "bronze", "gold", "premium"]);
    expect(new Set(rows.map((p) => p.name)).size).toBe(rows.length);
    expect(rows.every((p) => p.status === "active")).toBe(true);
    const price = Object.fromEntries(rows.map((p) => [p.code, [p.priceMinor, p.currency, p.billingInterval, p.trialDays]]));
    expect(price.free).toEqual([0, "NGN", "free", 30]);
    expect(price.silver).toEqual([1000, "USD", "yearly", 0]);
    expect(price.bronze).toEqual([1500, "USD", "yearly", 0]);
    expect(price.gold).toEqual([2000, "USD", "yearly", 0]);
    expect(price.premium).toEqual([2500, "USD", "yearly", 0]);
  });

  it("features only grow as packages go up (no contradictions)", async () => {
    const db = await getDb();
    const rows = (await db.select().from(schema.subscriptionPlans)).sort((a, b) => a.sortOrder - b.sortOrder);
    const ents = await db.select().from(schema.planEntitlements);
    const val = (code: string, key: string) => { const id = rows.find((p) => p.code === code)!.id; const e = ents.find((x) => x.planId === id && x.featureKey === key); return e ? (e.limitValue === null ? Infinity : e.limitValue) : 0; };
    for (const key of ["maxLearners", "maxClasses", "maxActiveSessions", "maxAdmins", "examsPerSession", "curriculumTier", "downloads", "certificates", "advancedReports", "customBranding", "aiAssist", "storageMb"]) {
      for (let i = 1; i < rows.length; i++) expect(val(rows[i].code, key), key + " " + rows[i].code).toBeGreaterThanOrEqual(val(rows[i - 1].code, key));
    }
  });

  it("the Free package needs no code, and codes cannot be generated for it", async () => {
    const r = await generateAccessCodes(actor, { planId: await planId("free"), quantity: 1, durationDays: 30, maxUses: 1, redeemBy: null, note: "" });
    expect(r.ok).toBe(false);
  });

  it("a new church gets 30 free days, then has no entitlements until it redeems a code", async () => {
    const ch = await makeChurch("Trial Church " + uniq("t"));
    const p = await effectivePlan(ch.orgId);
    expect(p.code).toBe("free");
    expect(p.endAt!.getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
    expect(p.endAt!.getTime() - Date.now()).toBeLessThanOrEqual(30 * 86_400_000);
    const db = await getDb();
    await db.update(schema.organizationSubscriptions).set({ endAt: new Date(Date.now() - 1000) }).where(eq(schema.organizationSubscriptions.organizationId, ch.orgId));
    const ended = await effectivePlan(ch.orgId);
    expect(ended.status).toBe("expired");
    expect(Object.keys(ended.entitlements)).toHaveLength(0);
    const gen = await generateAccessCodes(actor, { planId: await planId("silver"), quantity: 1, durationDays: 365, maxUses: 1, redeemBy: null, note: "" });
    const code = (gen as { codes: string[] }).codes[0];
    const { redeemAccessCodeForOrg } = await import("@/server/services/access-codes");
    const r = await redeemAccessCodeForOrg(ch.orgId, ch.userId, code);
    expect(r.ok).toBe(true);
    expect((await effectivePlan(ch.orgId)).code).toBe("silver");
  });

  it("a church that registers with a Gold code starts on Gold and receives its own member code", async () => {
    const gen = await generateAccessCodes(actor, { planId: await planId("gold"), quantity: 1, durationDays: 365, maxUses: 1, redeemBy: null, note: "test" });
    expect(gen.ok).toBe(true);
    const code = (gen as { codes: string[] }).codes[0];
    expect(code.startsWith("GOLD-")).toBe(true);
    const ch = await makeChurch("Grace Chapel " + uniq("g"), { accessCode: code.toLowerCase() });
    expect((await effectivePlan(ch.orgId)).code).toBe("gold");
    expect(ch.org.joinCode).toBeTruthy();
    // the member code gives instant approval to members of that church
    const m = await registerMember({ fullName: "Ada Member", email: `${uniq("m")}@test.org`, password: STRONG, orgId: ch.orgId, joinCode: ch.org.joinCode!, isThirteenOrOlder: true, acceptTerms: true });
    expect(m.ok && m.membership).toBe("active");
    const wrong = await registerMember({ fullName: "Bad Code", email: `${uniq("m")}@test.org`, password: STRONG, orgId: ch.orgId, joinCode: "ZZZZ-ZZZZ", isThirteenOrOlder: true, acceptTerms: true });
    expect(wrong.ok).toBe(false);
  });

  it("a single-use code cannot be used twice, and an invalid code stops registration", async () => {
    const gen = await generateAccessCodes(actor, { planId: await planId("silver"), quantity: 1, durationDays: 30, maxUses: 1, redeemBy: null, note: "" });
    const code = (gen as { codes: string[] }).codes[0];
    await makeChurch("First Church " + uniq("f"), { accessCode: code });
    const again = await checkAccessCode(code);
    expect(again.ok).toBe(false);
    const email = `${uniq("x")}@test.org`;
    const second = await registerChurch({ churchName: "Second Church " + uniq("s"), contactEmail: email, adminName: "Pastor Two", adminEmail: email, password: STRONG, acceptTerms: true, accessCode: code });
    expect(second.ok).toBe(false);
    const bogus = await registerChurch({ churchName: "Third Church " + uniq("t"), contactEmail: `${uniq("y")}@test.org`, adminName: "Pastor Three", adminEmail: `${uniq("y")}@test.org`, password: STRONG, acceptTerms: true, accessCode: "NOPE-0000-0000" });
    expect(bogus.ok).toBe(false);
  });

  it("a withdrawn code cannot be redeemed, and a church without a code starts on Free", async () => {
    const gen = await generateAccessCodes(actor, { planId: await planId("bronze"), quantity: 2, durationDays: null, maxUses: 5, redeemBy: null, note: "bulk" });
    const [a] = (gen as { codes: string[] }).codes;
    const list = await listAccessCodes();
    const row = list.find((c) => c.code === a)!;
    expect(row.state).toBe("available");
    await revokeAccessCode(actor, row.id);
    expect((await checkAccessCode(a)).ok).toBe(false);
    const plain = await makeChurch("Plain Church " + uniq("p"));
    expect((await effectivePlan(plain.orgId)).code).toBe("free");
  });

  it("rejects bad generation requests", async () => {
    const pid = await planId("gold");
    expect((await generateAccessCodes(actor, { planId: pid, quantity: 0, durationDays: 30, maxUses: 1, redeemBy: null, note: "" })).ok).toBe(false);
    expect((await generateAccessCodes(actor, { planId: pid, quantity: 1, durationDays: -5, maxUses: 1, redeemBy: null, note: "" })).ok).toBe(false);
  });
});
