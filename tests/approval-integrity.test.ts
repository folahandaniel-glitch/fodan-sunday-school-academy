import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { seedContent } from "@/server/seed";
import { boot } from "./helpers";
import { approveAllValid, contentHashOf, loadBundle, publishAllApproved, publishVersion } from "@/server/services/curriculum";
import { sha256 } from "@/server/crypto";
import type { Actor } from "@/server/audit";

let actor: Actor;
beforeAll(async () => { ({ actor } = await boot([1])); });

describe("approval integrity", () => {
  it("publishes when the database returns blueprints in a different order, and accepts old-style fingerprints", async () => {
    const db = await getDb();
    await seedContent(db, [2]);
    await approveAllValid(actor);
    const [cur] = await db.select().from(schema.curricula).where(eq(schema.curricula.catalogNumber, 2));
    const [v] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.curriculumId, cur.id));
    expect(v.status).toBe("approved");
    // The database returns blueprints in no fixed order, so store a fingerprint in the old, order-dependent form (reverse order).
    const after = await loadBundle(v.id);
    const legacy = sha256(JSON.stringify([after.lessons.map((l) => [l.weekNumber, l.title, l.summary, l.content, l.objectives]), [...after.blueprints].reverse().map((x) => [x.kind, x.config])]));
    await db.update(schema.curriculumVersions).set({ contentHash: legacy }).where(eq(schema.curriculumVersions.id, v.id));
    await publishVersion(actor, v.id);
    const [done] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, v.id));
    expect(done.status).toBe("published");
    expect(done.contentHash).toBe(contentHashOf(await loadBundle(v.id)));
  });

  it("really changed content is still refused", async () => {
    const db = await getDb();
    await seedContent(db, [3]);
    await approveAllValid(actor);
    const [cur] = await db.select().from(schema.curricula).where(eq(schema.curricula.catalogNumber, 3));
    const [v] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.curriculumId, cur.id));
    await db.update(schema.curriculumVersions).set({ contentHash: "0".repeat(64) }).where(eq(schema.curriculumVersions.id, v.id));
    await expect(publishVersion(actor, v.id)).rejects.toThrow(/no longer matches/);
  });

  it("re-running the seed does not add new versions for unchanged approved or published curricula", async () => {
    const db = await getDb();
    await seedContent(db, [4]);
    await approveAllValid(actor);
    await publishAllApproved(actor);
    const [cur] = await db.select().from(schema.curricula).where(eq(schema.curricula.catalogNumber, 4));
    const before = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.curriculumId, cur.id));
    const r = await seedContent(db, [4]);
    const afterV = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.curriculumId, cur.id));
    expect(r.versioned).toEqual([]);
    expect(afterV.length).toBe(before.length);
  });

  it("Publish all publishes only the newest approved copy and retires older duplicates", async () => {
    const db = await getDb();
    await seedContent(db, [5]);
    await approveAllValid(actor);
    const [cur] = await db.select().from(schema.curricula).where(eq(schema.curricula.catalogNumber, 5));
    const [v1] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.curriculumId, cur.id));
    const { id: _id, ...rest } = v1;
    void _id;
    const [v2] = await db.insert(schema.curriculumVersions).values({ ...rest, versionNumber: v1.versionNumber + 1, status: "in_review" }).returning();
    const ls = await db.select().from(schema.curriculumLessons).where(eq(schema.curriculumLessons.versionId, v1.id));
    await db.insert(schema.curriculumLessons).values(ls.map(({ id: _l, ...l }) => (void _l, { ...l, versionId: v2.id })));
    const bs = await db.select().from(schema.assessmentBlueprints).where(eq(schema.assessmentBlueprints.versionId, v1.id));
    await db.insert(schema.assessmentBlueprints).values(bs.map(({ id: _b, ...b }) => (void _b, { ...b, versionId: v2.id })));
    await db.update(schema.curriculumVersions).set({ status: "approved", contentHash: v1.contentHash }).where(eq(schema.curriculumVersions.id, v2.id));
    const r = await publishAllApproved(actor);
    expect(r.skipped.filter((x) => x.title === cur.title)).toEqual([]);
    const rows = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.curriculumId, cur.id));
    expect(rows.find((x) => x.id === v2.id)?.status).toBe("published");
    expect(rows.find((x) => x.id === v1.id)?.status).toBe("superseded");
  });
});
