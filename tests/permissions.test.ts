import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { boot, uniq } from "./helpers";
import { platformCan } from "@/lib/permissions";
import { setExtraPerms } from "@/server/services/admin";
import type { Actor } from "@/server/audit";
import { getSettingFresh } from "@/server/settings";
import { saveSettingGroup } from "@/server/services/cms";

let actor: Actor;
beforeAll(async () => { ({ actor } = await boot([1])); });

describe("assignable platform permissions", () => {
  it("role defaults are unchanged and a plain role string stays role-only", () => {
    expect(platformCan("member", "site.edit")).toBe(false);
    expect(platformCan("super_admin", "users.manage")).toBe(true);
    expect(platformCan(null, "site.edit")).toBe(false);
  });
  it("granted permissions apply; users.manage and settings.manage can never be granted; admin.access follows any grant", () => {
    const m = { platformRole: "member" as const, extraPerms: ["site.edit", "users.manage", "settings.manage"] };
    expect(platformCan(m, "site.edit")).toBe(true);
    expect(platformCan(m, "users.manage")).toBe(false);
    expect(platformCan(m, "settings.manage")).toBe(false);
    expect(platformCan(m, "admin.access")).toBe(true);
    expect(platformCan({ platformRole: "member" as const, extraPerms: [] }, "admin.access")).toBe(false);
    expect(platformCan({ platformRole: "finance_admin" as const, extraPerms: ["site.edit"] }, "plans.manage")).toBe(true);
  });
  it("setExtraPerms stores only grantable permissions, is audited, and refuses the Super Admin", async () => {
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({ fullName: "Editor", email: `${uniq("e")}@test.org`, normalizedEmail: `${uniq("n")}@test.org`, passwordHash: "x" }).returning();
    const saved = await setExtraPerms(actor, u.id, ["site.edit", "users.manage", "bogus", "site.edit", "curriculum.review"]);
    expect(saved).toEqual(["curriculum.review", "site.edit"]);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(row.extraPerms).toEqual(["curriculum.review", "site.edit"]);
    const log = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "user.permissions_set"));
    expect(log.length).toBeGreaterThan(0);
    await setExtraPerms(actor, u.id, []);
    expect((await db.select().from(schema.users).where(eq(schema.users.id, u.id)))[0].extraPerms).toEqual([]);
    await expect(setExtraPerms(actor, actor.id!, ["site.edit"])).rejects.toThrow(/already holds/);
  });

  it("library, verify and pricing text defaults to the original wording and can be edited and audited", async () => {
    const d = await getSettingFresh("pageText");
    expect(d.library.title).toBe("Curriculum library");
    expect(d.pricing.title).toBe("Plans for every church");
    await saveSettingGroup(actor, "pageText", { ...d, verify: { title: "Check a certificate", intro: d.verify.intro } });
    const after = await getSettingFresh("pageText");
    expect(after.verify.title).toBe("Check a certificate");
    expect(after.library.title).toBe("Curriculum library");
  });
});
