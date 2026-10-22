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
  it("seeds the five packages in order", async () => {
    const db = await getDb();
    const rows = await db.select().from(schema.subscriptionPlans);
    const codes = rows.filter((p) => p.status !== "retired").sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.code);
    expect(codes).toEqual(["free", "silver", "bronze", "gold", "premium"]);
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
