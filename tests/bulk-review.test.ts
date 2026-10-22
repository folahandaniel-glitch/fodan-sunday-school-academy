import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { seedContent } from "@/server/seed";
import { boot } from "./helpers";
import { approveAllValid, publishAllApproved } from "@/server/services/curriculum";
import type { Actor } from "@/server/audit";

let actor: Actor;
beforeAll(async () => { ({ actor } = await boot([1])); });

describe("bulk review and publish", () => {
  it("Review all approves every valid in-review version, then Publish all releases them", async () => {
    const db = await getDb();
    await seedContent(db, [2, 3]);
    const waiting = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.status, "in_review"));
    expect(waiting.length).toBeGreaterThanOrEqual(2);
    const r = await approveAllValid(actor);
    expect(r.done.length).toBeGreaterThanOrEqual(2);
    const approved = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.status, "approved"));
    expect(approved.length).toBe(r.done.length);
    const p = await publishAllApproved(actor);
    expect(p.done.length).toBe(r.done.length);
    expect((await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.status, "approved"))).length).toBe(0);
    const again = await publishAllApproved(actor);
    expect(again.done.length).toBe(0);
  });
});
