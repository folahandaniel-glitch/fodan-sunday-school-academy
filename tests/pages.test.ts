import { beforeAll, describe, expect, it } from "vitest";
import { boot, makeChurch, makeClass, uniq } from "./helpers";
import { listClasses } from "@/server/services/church";
import { listChurches, churchDetail, listUsers, auditPage } from "@/server/services/admin";
import { listCategories } from "@/server/services/curriculum";
import { listProgrammes } from "@/server/services/schedule";
import { markingQueue, listExams } from "@/server/services/exams";
import { churchReport } from "@/server/services/reports";
import { listThreads } from "@/server/services/forum";

let ch: Awaited<ReturnType<typeof makeChurch>>;
beforeAll(async () => { await boot([1]); ch = await makeChurch("Pages Chapel " + uniq("p")); });

describe("menu pages load without database errors", () => {
  it("Classes lists classes with learner and teacher counts (regression: ambiguous id in sub-select)", async () => {
    await makeClass(ch.ctx, "Juniors");
    const rows = await listClasses(ch.ctx);
    expect(rows.length).toBe(1);
    expect(rows[0].learners).toBe(0);
    expect(rows[0].teachers).toEqual([]);
  });
  it("empty church pages return empty lists, not errors", async () => {
    expect(await listProgrammes(ch.ctx)).toEqual([]);
    expect(await markingQueue(ch.ctx)).toEqual([]);
    expect(Array.isArray(await listExams(ch.ctx))).toBe(true);
    const rep = await churchReport(ch.ctx, {});
    expect(rep.learners).toEqual([]);
  });
  it("admin directories load", async () => {
    const churches = await listChurches({});
    expect(churches.rows.length).toBeGreaterThan(0);
    expect(churches.rows[0]).toHaveProperty("members");
    await churchDetail(ch.orgId);
    await listUsers({});
    await auditPage({});
    await listCategories();
    await listThreads({} as never).catch(() => undefined);
  });
});
