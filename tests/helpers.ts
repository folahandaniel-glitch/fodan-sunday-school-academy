import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { seedContent } from "@/server/seed";
import { registerChurch, registerMember, bootstrapSuperAdmin } from "@/server/services/auth";
import { resolveOrgCtx, type OrgCtx } from "@/server/org";
import { approveAndPublishAllValid } from "@/server/services/curriculum";
import { addManagedMember, createClass, enrolLearner, assignTeacher } from "@/server/services/church";
import type { Actor } from "@/server/audit";

export const STRONG = "Correct-Horse-9-Battery";
let counter = 0;
export const uniq = (p: string) => `${p}${Date.now().toString(36)}${counter++}`;

export async function boot(only: number[] = [1]) {
  const db = await getDb();
  await seedContent(db, only);
  const sa = await bootstrapSuperAdmin(`root-${uniq("")}@test.org`, "Root Admin", STRONG + "x");
  const actor: Actor = { id: sa.id, label: "Root Admin", role: "super_admin" };
  await approveAndPublishAllValid(actor);
  return { db, actor };
}

export async function makeChurch(name: string, extra: Partial<Parameters<typeof registerChurch>[0]> = {}) {
  const email = `${uniq("admin")}@test.org`;
  const r = await registerChurch({ churchName: name, type: "Church", country: "Nigeria", state: "Lagos", city: "Ikeja", contactEmail: email, adminName: "Pastor " + name.slice(0, 5), adminEmail: email, password: STRONG, language: "en", timezone: "Africa/Lagos", currency: "NGN", acceptTerms: true, ...extra });
  if (!r.ok) throw new Error("church registration failed: " + r.error);
  const ctx = (await resolveOrgCtx(r.userId))!;
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, r.orgId));
  return { ...r, ctx, org, adminId: r.userId };
}

/** Creates an ACTIVE learner or teacher in a church via the admin path and returns their context. */
export async function addPerson(admin: OrgCtx, role: "learner" | "teacher", name: string) {
  const r = await addManagedMember(admin, { fullName: name, username: uniq("u").toLowerCase().slice(0, 20), role });
  if (!r.ok) throw new Error(r.error);
  return { userId: r.userId, ctx: (await resolveOrgCtx(r.userId))! };
}

export async function makeClass(admin: OrgCtx, name: string, teacherId?: string, learnerIds: string[] = []) {
  const c = await createClass(admin, { name });
  if (!c.ok) throw new Error(c.error);
  if (teacherId) await assignTeacher(admin, c.id, teacherId);
  for (const l of learnerIds) await enrolLearner(admin, c.id, l);
  return c.id;
}

export { registerMember };
