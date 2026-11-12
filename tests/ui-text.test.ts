import { beforeAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { boot } from "./helpers";
import { makeT } from "@/lib/ui-text";
import { UI_TEXT_CATALOG } from "@/lib/ui-text-catalog";
import { saveWording } from "@/server/services/cms";
import { getSettingFresh } from "@/server/settings";
import type { Actor } from "@/server/audit";
// @ts-expect-error plain script without types
import { buildCatalog } from "../scripts/gen-ui-catalog.mjs";

let actor: Actor;
beforeAll(async () => { ({ actor } = await boot([1])); });

describe("interface wording", () => {
  it("returns the original wording unless a non-blank replacement exists, and fills placeholders", () => {
    const t = makeT({ "Sign in": "Log in", Blank: "  " });
    expect(t("Sign in")).toBe("Log in");
    expect(t("Blank")).toBe("Blank");
    expect(t("Sign out")).toBe("Sign out");
    expect(t("{site} home", { site: "X" })).toBe("X home");
    expect(t("toString")).toBe("toString");
  });
  it("the committed catalog matches the code (run `npm run registry` after adding wording)", () => {
    expect(JSON.parse(JSON.stringify(UI_TEXT_CATALOG))).toEqual(buildCatalog());
    expect(UI_TEXT_CATALOG.flatMap((g) => g.items)).toContain("Sign in");
  });
  it("saving replaces only catalogued texts, can be reverted, and is audited", async () => {
    const n = await saveWording(actor, { "Sign in": "Log in", "Not in the catalogue": "x", "Sign out": "Sign out" });
    expect(n).toBe(1);
    expect((await getSettingFresh("uiText")).overrides).toEqual({ "Sign in": "Log in" });
    const db = await getDb();
    const [row] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "site.wording_saved")).orderBy(desc(schema.auditLogs.createdAt)).limit(1);
    expect(row.actorId).toBe(actor.id);
    await saveWording(actor, { "Sign in": "Sign in" });
    expect((await getSettingFresh("uiText")).overrides).toEqual({});
  });
  it("rejects over-long replacements", async () => {
    await expect(saveWording(actor, { "Sign in": "x".repeat(900) })).rejects.toThrow(/longer than/);
  });
});
