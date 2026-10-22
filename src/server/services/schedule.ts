import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, qid } from "../db";
import { AccessError, NotFoundError, assertCan, type OrgCtx } from "../org";
import { audit } from "../audit";
import { assertWithinLimit, curriculumTierAllowed, EntitlementError, limitOf } from "./entitlements";
import { notify } from "./notify";
import { DEFAULT_PLAN, isIsoDate, proposeSchedule, rescheduleFrom, type Proposal, type ShortfallPolicy } from "@/lib/schedule";
import { orgSettings } from "./church";

export interface WizardInput {
  sessionName: string; year: number; sessionType: "jan_jun" | "jul_dec" | "custom"; startDate: string; endDate: string; weekday: number; timezone?: string;
  curriculumId: string; midtestWeek?: number; finalWeek?: number; revisionWeek?: number; shortfallPolicy?: ShortfallPolicy;
  holidays?: { date: string; description?: string; type?: "holiday" | "special_service" | "skipped" }[];
  classIds?: string[]; dateOverrides?: Record<number, string>; idempotencyKey?: string; activate?: boolean; existingSessionId?: string;
}

export const sessionDefaults = (type: "jan_jun" | "jul_dec", year: number) => type === "jan_jun" ? { start: `${year}-01-01`, end: `${year}-06-30`, name: `January to June ${year}` } : { start: `${year}-07-01`, end: `${year}-12-31`, name: `July to December ${year}` };

/** A curriculum the church is allowed to start: published, public/registered, within its plan tier, with a complete 26-week version. */
async function selectableCurriculum(ctx: OrgCtx, curriculumId: string) {
  const db = await getDb();
  const [c] = await db.select().from(schema.curricula).where(eq(schema.curricula.id, curriculumId));
  if (!c || c.status !== "published" || !c.currentVersionId || c.visibility === "private") throw new NotFoundError("That curriculum is not available.");
  if (!(await curriculumTierAllowed(ctx.orgId, c.accessTier))) throw new EntitlementError("This curriculum is not included in your church's current plan.", "curriculumTier");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.curriculumLessons).where(eq(schema.curriculumLessons.versionId, c.currentVersionId));
  if (n !== 26) throw new AccessError("This curriculum version is incomplete and cannot be scheduled.");
  return c;
}

export function buildProposal(input: WizardInput): Proposal {
  const plan = { midtestWeek: input.midtestWeek ?? DEFAULT_PLAN.midtestWeek, finalWeek: input.finalWeek ?? DEFAULT_PLAN.finalWeek, revisionWeek: input.revisionWeek ?? DEFAULT_PLAN.revisionWeek };
  const exclude = (input.holidays ?? []).map((h) => h.date);
  const p = proposeSchedule({ ...plan, start: input.startDate, end: input.endDate, weekday: input.weekday, exclude, shortfallPolicy: input.shortfallPolicy ?? "extend" });
  if (input.dateOverrides && p.slots.length) {
    for (const [slot, date] of Object.entries(input.dateOverrides)) {
      const s = p.slots.find((x) => x.slot === Number(slot));
      if (s && isIsoDate(date)) { s.date = date; s.combinedWithSlot = null; }
    }
  }
  return p;
}

export async function previewSchedule(ctx: OrgCtx, input: WizardInput) {
  assertCan(ctx, "sessions.manage");
  const c = await selectableCurriculum(ctx, input.curriculumId);
  return { proposal: buildProposal(input), curriculum: { id: c.id, title: c.title, versionId: c.currentVersionId! } };
}

/**
 * Creates the academic session, pins the curriculum version, and generates all 26 scheduled lessons in ONE transaction.
 * Safe to retry: the same idempotency key returns the original result instead of creating a duplicate.
 */
export async function createProgramme(ctx: OrgCtx, input: WizardInput) {
  assertCan(ctx, "sessions.manage"); assertCan(ctx, "curriculum.select");
  const db = await getDb();
  if (input.idempotencyKey) {
    const [ex] = await db.select().from(schema.curriculumAssignments).where(and(eq(schema.curriculumAssignments.organizationId, ctx.orgId), eq(schema.curriculumAssignments.idempotencyKey, input.idempotencyKey)));
    if (ex) return { ok: true as const, assignmentId: ex.id, sessionId: ex.sessionId, duplicate: true, warnings: [] as string[] };
  }
  if (input.sessionName.trim().length < 3) return { ok: false as const, error: "Enter a session name." };
  const cur = await selectableCurriculum(ctx, input.curriculumId);
  const proposal = buildProposal(input);
  if (proposal.errors.length) return { ok: false as const, error: proposal.errors[0] };
  const missing = proposal.slots.filter((s) => !s.date);
  if (input.activate && missing.length) return { ok: false as const, error: `${missing.length} lesson(s) still have no date. Set their dates, extend the calendar or choose another option before activating.` };
  // Classes must belong to this church
  const classIds = [...new Set(input.classIds ?? [])];
  if (classIds.length) {
    const own = await db.select({ id: schema.classes.id }).from(schema.classes).where(and(eq(schema.classes.organizationId, ctx.orgId), inArray(schema.classes.id, classIds)));
    if (own.length !== classIds.length) throw new NotFoundError("One of the selected classes was not found.");
  }
  try {
    const out = await db.transaction(async (tx) => {
      let sessionId = input.existingSessionId;
      if (sessionId) {
        const [s] = await tx.select().from(schema.academicSessions).where(and(eq(schema.academicSessions.id, sessionId), eq(schema.academicSessions.organizationId, ctx.orgId)));
        if (!s) throw new NotFoundError("Session not found.");
      } else {
        const [s] = await tx.insert(schema.academicSessions).values({
          organizationId: ctx.orgId, name: input.sessionName.trim(), year: input.year, sessionType: input.sessionType, startDate: input.startDate, endDate: input.endDate,
          timezone: input.timezone ?? ctx.timezone, teachingWeekday: input.weekday, status: "draft", createdBy: ctx.userId,
          config: { midtestWeek: input.midtestWeek ?? 13, finalWeek: input.finalWeek ?? 25, revisionWeek: input.revisionWeek ?? 26, shortfallPolicy: input.shortfallPolicy ?? "extend" },
        }).returning({ id: schema.academicSessions.id });
        sessionId = s.id;
        const ex = (input.holidays ?? []).filter((h) => isIsoDate(h.date));
        if (ex.length) await tx.insert(schema.sessionCalendarExceptions).values(ex.map((h) => ({ organizationId: ctx.orgId, sessionId: sessionId!, exceptionDate: h.date, type: h.type ?? "holiday", description: h.description ?? "", resolution: "skip" }))).onConflictDoNothing();
      }
      const [a] = await tx.insert(schema.curriculumAssignments).values({ organizationId: ctx.orgId, sessionId, curriculumId: cur.id, versionId: cur.currentVersionId!, assignedBy: ctx.userId, status: "draft", idempotencyKey: input.idempotencyKey ?? null }).returning({ id: schema.curriculumAssignments.id });
      const lessons = await tx.select({ id: schema.curriculumLessons.id, week: schema.curriculumLessons.weekNumber }).from(schema.curriculumLessons).where(eq(schema.curriculumLessons.versionId, cur.currentVersionId!));
      const byUnit = new Map(lessons.map((l) => [l.week, l.id]));
      await tx.insert(schema.scheduledLessons).values(proposal.slots.map((s) => ({
        organizationId: ctx.orgId, assignmentId: a.id, lessonId: byUnit.get(s.unitWeek)!, weekNumber: s.slot, scheduledDate: s.date, lessonType: s.type, combinedWithWeek: s.combinedWithSlot,
        note: s.beyondEnd ? "Extended beyond the session end date." : null,
      })));
      if (classIds.length) await tx.insert(schema.classCurriculumAssignments).values(classIds.map((classId) => ({ organizationId: ctx.orgId, classId, assignmentId: a.id })));
      await audit({ id: ctx.userId, label: ctx.userName }, "programme.created", { type: "assignment", id: a.id }, { curriculum: cur.title, versionId: cur.currentVersionId, sessionId }, { orgId: ctx.orgId, db: tx });
      return { assignmentId: a.id, sessionId: sessionId! };
    });
    if (input.activate) await activateProgramme(ctx, out.assignmentId);
    return { ok: true as const, ...out, duplicate: false, warnings: proposal.warnings };
  } catch (e) {
    const msg = (e as { cause?: { code?: string }; code?: string; message?: string });
    if ((msg.cause?.code ?? msg.code) === "23505") return { ok: false as const, error: "This church already has that curriculum in that session." };
    throw e;
  }
}

export async function activateProgramme(ctx: OrgCtx, assignmentId: string) {
  assertCan(ctx, "sessions.manage");
  const db = await getDb();
  const [a] = await db.select().from(schema.curriculumAssignments).where(and(eq(schema.curriculumAssignments.id, assignmentId), eq(schema.curriculumAssignments.organizationId, ctx.orgId)));
  if (!a) throw new NotFoundError("Programme not found.");
  if (a.status === "active") return { ok: true as const };
  if (a.status !== "draft") throw new AccessError("Only a draft programme can be activated.");
  const lessons = await db.select().from(schema.scheduledLessons).where(and(eq(schema.scheduledLessons.assignmentId, a.id), eq(schema.scheduledLessons.organizationId, ctx.orgId)));
  if (lessons.length !== 26) throw new AccessError("The programme does not have all 26 lessons.");
  if (lessons.some((l) => !l.scheduledDate)) throw new AccessError("Every lesson needs a date before the programme can be activated.");
  const [active] = await db.select({ n: sql<number>`count(distinct ${schema.curriculumAssignments.sessionId})::int` }).from(schema.curriculumAssignments).innerJoin(schema.academicSessions, eq(schema.academicSessions.id, schema.curriculumAssignments.sessionId)).where(and(eq(schema.curriculumAssignments.organizationId, ctx.orgId), eq(schema.curriculumAssignments.status, "active"), eq(schema.academicSessions.status, "active")));
  const [thisS] = await db.select().from(schema.academicSessions).where(eq(schema.academicSessions.id, a.sessionId));
  if (thisS.status !== "active") await assertWithinLimit(ctx.orgId, "maxActiveSessions", active.n);
  await db.transaction(async (tx) => {
    await tx.update(schema.curriculumAssignments).set({ status: "active", activatedAt: new Date() }).where(eq(schema.curriculumAssignments.id, a.id));
    await tx.update(schema.academicSessions).set({ status: "active" }).where(eq(schema.academicSessions.id, a.sessionId));
    await audit({ id: ctx.userId, label: ctx.userName }, "programme.activated", { type: "assignment", id: a.id }, {}, { orgId: ctx.orgId, db: tx });
  });
  await notifyProgramme(ctx, a.id, "Your programme has started", "A new programme is active. Open your lessons to see the schedule.");
  return { ok: true as const };
}

async function notifyProgramme(ctx: OrgCtx, assignmentId: string, title: string, body: string) {
  const db = await getDb();
  const classes = await db.select({ classId: schema.classCurriculumAssignments.classId }).from(schema.classCurriculumAssignments).where(and(eq(schema.classCurriculumAssignments.assignmentId, assignmentId), eq(schema.classCurriculumAssignments.organizationId, ctx.orgId)));
  if (!classes.length) return;
  const ids = classes.map((c) => c.classId);
  const people = await db.selectDistinct({ id: schema.classMemberships.userId }).from(schema.classMemberships).where(and(eq(schema.classMemberships.organizationId, ctx.orgId), inArray(schema.classMemberships.classId, ids), eq(schema.classMemberships.status, "active")));
  const teachers = await db.selectDistinct({ id: schema.classTeachers.teacherId }).from(schema.classTeachers).where(and(eq(schema.classTeachers.organizationId, ctx.orgId), inArray(schema.classTeachers.classId, ids)));
  for (const p of [...people, ...teachers]) await notify(p.id, { type: "session", title, body, href: "/learn", orgId: ctx.orgId, dedupeKey: `prog:${assignmentId}:${title}` });
}

/** Programmes with their dates, for the church's session pages. */
export async function listProgrammes(ctx: OrgCtx) {
  assertCan(ctx, "classes.view");
  const db = await getDb();
  return db.select({ a: schema.curriculumAssignments, s: schema.academicSessions, title: schema.curricula.title, slug: schema.curricula.slug, versionNumber: schema.curriculumVersions.versionNumber, currentVersionId: schema.curricula.currentVersionId,
    delivered: sql<number>`(select count(*)::int from scheduled_lessons sl where sl.assignment_id = ${qid(schema.curriculumAssignments)} and sl.status = 'completed')` })
    .from(schema.curriculumAssignments)
    .innerJoin(schema.academicSessions, eq(schema.academicSessions.id, schema.curriculumAssignments.sessionId))
    .innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumAssignments.curriculumId))
    .innerJoin(schema.curriculumVersions, eq(schema.curriculumVersions.id, schema.curriculumAssignments.versionId))
    .where(eq(schema.curriculumAssignments.organizationId, ctx.orgId)).orderBy(desc(schema.academicSessions.startDate));
}

export async function getProgramme(ctx: OrgCtx, assignmentId: string) {
  const db = await getDb();
  const [row] = await db.select({ a: schema.curriculumAssignments, s: schema.academicSessions, title: schema.curricula.title, slug: schema.curricula.slug, versionNumber: schema.curriculumVersions.versionNumber, currentVersionId: schema.curricula.currentVersionId })
    .from(schema.curriculumAssignments).innerJoin(schema.academicSessions, eq(schema.academicSessions.id, schema.curriculumAssignments.sessionId))
    .innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumAssignments.curriculumId)).innerJoin(schema.curriculumVersions, eq(schema.curriculumVersions.id, schema.curriculumAssignments.versionId))
    .where(and(eq(schema.curriculumAssignments.id, assignmentId), eq(schema.curriculumAssignments.organizationId, ctx.orgId)));
  if (!row) throw new NotFoundError("Programme not found.");
  const lessons = await db.select({ sl: schema.scheduledLessons, title: schema.curriculumLessons.title, theme: schema.curriculumLessons.theme, unitWeek: schema.curriculumLessons.weekNumber, versionId: schema.curriculumLessons.versionId })
    .from(schema.scheduledLessons).innerJoin(schema.curriculumLessons, eq(schema.curriculumLessons.id, schema.scheduledLessons.lessonId))
    .where(and(eq(schema.scheduledLessons.assignmentId, assignmentId), eq(schema.scheduledLessons.organizationId, ctx.orgId))).orderBy(asc(schema.scheduledLessons.weekNumber));
  const exceptions = await db.select().from(schema.sessionCalendarExceptions).where(and(eq(schema.sessionCalendarExceptions.sessionId, row.s.id), eq(schema.sessionCalendarExceptions.organizationId, ctx.orgId))).orderBy(asc(schema.sessionCalendarExceptions.exceptionDate));
  const classes = await db.select({ id: schema.classes.id, name: schema.classes.name }).from(schema.classCurriculumAssignments).innerJoin(schema.classes, eq(schema.classes.id, schema.classCurriculumAssignments.classId)).where(and(eq(schema.classCurriculumAssignments.assignmentId, assignmentId), eq(schema.classCurriculumAssignments.organizationId, ctx.orgId)));
  return { ...row, lessons, exceptions, classes };
}

/** Moves one lesson's date, or re-dates every undelivered lesson from a slot onwards. Delivered lessons are never moved and no lesson is ever removed. */
export async function rescheduleLessons(ctx: OrgCtx, assignmentId: string, input: { fromSlot: number; anchorDate: string; shiftFollowing: boolean; addExceptionDates?: string[]; reason?: string }) {
  assertCan(ctx, "sessions.manage");
  if (!isIsoDate(input.anchorDate)) return { ok: false as const, error: "Enter a valid date." };
  const db = await getDb();
  const [a] = await db.select().from(schema.curriculumAssignments).where(and(eq(schema.curriculumAssignments.id, assignmentId), eq(schema.curriculumAssignments.organizationId, ctx.orgId)));
  if (!a) throw new NotFoundError("Programme not found.");
  const rows = await db.select().from(schema.scheduledLessons).where(and(eq(schema.scheduledLessons.assignmentId, assignmentId), eq(schema.scheduledLessons.organizationId, ctx.orgId)));
  const target = rows.find((r) => r.weekNumber === input.fromSlot);
  if (!target) throw new NotFoundError("Lesson not found.");
  if (target.status === "completed") throw new AccessError("A delivered lesson cannot be moved.");
  const exc = (input.addExceptionDates ?? []).filter(isIsoDate);
  if (exc.length) {
    await db.insert(schema.sessionCalendarExceptions).values(exc.map((d) => ({ organizationId: ctx.orgId, sessionId: a.sessionId, exceptionDate: d, type: "skipped" as const, description: input.reason ?? "Rescheduled", resolution: "skip" }))).onConflictDoNothing();
  }
  const allExc = (await db.select({ d: schema.sessionCalendarExceptions.exceptionDate }).from(schema.sessionCalendarExceptions).where(eq(schema.sessionCalendarExceptions.sessionId, a.sessionId))).map((e) => e.d);
  let updates: { slot: number; date: string }[];
  if (input.shiftFollowing) {
    updates = rescheduleFrom(rows.map((r) => ({ slot: r.weekNumber, date: r.scheduledDate, delivered: r.status === "completed" })), input.fromSlot, input.anchorDate, allExc);
  } else updates = [{ slot: input.fromSlot, date: input.anchorDate }];
  await db.transaction(async (tx) => {
    for (const u of updates) await tx.update(schema.scheduledLessons).set({ scheduledDate: u.date, combinedWithWeek: null, note: input.reason ?? "Rescheduled" }).where(and(eq(schema.scheduledLessons.assignmentId, assignmentId), eq(schema.scheduledLessons.organizationId, ctx.orgId), eq(schema.scheduledLessons.weekNumber, u.slot)));
    await audit({ id: ctx.userId, label: ctx.userName }, "programme.rescheduled", { type: "assignment", id: assignmentId }, { fromSlot: input.fromSlot, count: updates.length, shift: input.shiftFollowing }, { orgId: ctx.orgId, db: tx });
  });
  return { ok: true as const, moved: updates.length };
}

export async function setLessonRelease(ctx: OrgCtx, scheduledLessonId: string, release: "open" | "locked" | null) {
  assertCan(ctx, "sessions.manage");
  const db = await getDb();
  const r = await db.update(schema.scheduledLessons).set({ releaseOverride: release }).where(and(eq(schema.scheduledLessons.id, scheduledLessonId), eq(schema.scheduledLessons.organizationId, ctx.orgId))).returning({ id: schema.scheduledLessons.id });
  if (!r.length) throw new NotFoundError("Lesson not found.");
}

export async function updateAssessmentWeeks(ctx: OrgCtx, assignmentId: string, w: { midtestWeek: number; finalWeek: number; revisionWeek: number }) {
  assertCan(ctx, "sessions.manage");
  const { planSlots } = await import("@/lib/schedule");
  const plan = planSlots(w);
  if (plan.errors.length) return { ok: false as const, error: plan.errors[0] };
  const db = await getDb();
  const rows = await db.select().from(schema.scheduledLessons).where(and(eq(schema.scheduledLessons.assignmentId, assignmentId), eq(schema.scheduledLessons.organizationId, ctx.orgId)));
  if (rows.length !== 26) throw new NotFoundError("Programme not found.");
  if (rows.some((r) => r.status === "completed")) return { ok: false as const, error: "Assessment weeks cannot be rearranged after lessons have been delivered." };
  const lessons = await db.select({ id: schema.curriculumLessons.id, w: schema.curriculumLessons.weekNumber }).from(schema.curriculumLessons).where(inArray(schema.curriculumLessons.id, rows.map((r) => r.lessonId)));
  const idByUnit = new Map(lessons.map((l) => [l.w, l.id]));
  const dates = rows.sort((a, b) => a.weekNumber - b.weekNumber).map((r) => r.scheduledDate);
  await db.transaction(async (tx) => {
    for (const r of rows) await tx.update(schema.scheduledLessons).set({ weekNumber: r.weekNumber + 100 }).where(eq(schema.scheduledLessons.id, r.id));
    for (const s of plan.slots) {
      const row = rows.find((r) => r.lessonId === idByUnit.get(s.unitWeek))!;
      await tx.update(schema.scheduledLessons).set({ weekNumber: s.slot, lessonType: s.type, scheduledDate: dates[s.slot - 1] }).where(eq(schema.scheduledLessons.id, row.id));
    }
    await audit({ id: ctx.userId, label: ctx.userName }, "programme.assessment_weeks_changed", { type: "assignment", id: assignmentId }, w, { orgId: ctx.orgId, db: tx });
  });
  return { ok: true as const, warnings: plan.warnings };
}

/* ===================== Version adoption (explicit, audited) ===================== */
/** Programmes in this church whose curriculum has a newer published version. Read-only; nothing changes until the church adopts it. */
export async function programmesWithNewerVersion(ctx: OrgCtx) {
  assertCan(ctx, "classes.view");
  const db = await getDb();
  return db.select({ id: schema.curriculumAssignments.id, title: schema.curricula.title }).from(schema.curriculumAssignments)
    .innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumAssignments.curriculumId))
    .where(and(eq(schema.curriculumAssignments.organizationId, ctx.orgId), inArray(schema.curriculumAssignments.status, ["active", "draft"]), sql`${schema.curricula.currentVersionId} is not null and ${schema.curricula.currentVersionId} <> ${schema.curriculumAssignments.versionId}`));
}

export async function previewAdoption(ctx: OrgCtx, assignmentId: string) {
  assertCan(ctx, "sessions.manage");
  const db = await getDb();
  const [a] = await db.select().from(schema.curriculumAssignments).where(and(eq(schema.curriculumAssignments.id, assignmentId), eq(schema.curriculumAssignments.organizationId, ctx.orgId)));
  if (!a) throw new NotFoundError("Programme not found.");
  const [c] = await db.select().from(schema.curricula).where(eq(schema.curricula.id, a.curriculumId));
  if (!c.currentVersionId || c.currentVersionId === a.versionId) return { available: false as const };
  const [fromV] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, a.versionId));
  const [toV] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, c.currentVersionId));
  const oldL = await db.select().from(schema.curriculumLessons).where(eq(schema.curriculumLessons.versionId, a.versionId));
  const newL = await db.select().from(schema.curriculumLessons).where(eq(schema.curriculumLessons.versionId, c.currentVersionId));
  const newBy = new Map(newL.map((l) => [l.weekNumber, l]));
  const sl = await db.select({ sl: schema.scheduledLessons, unit: schema.curriculumLessons.weekNumber }).from(schema.scheduledLessons).innerJoin(schema.curriculumLessons, eq(schema.curriculumLessons.id, schema.scheduledLessons.lessonId)).where(and(eq(schema.scheduledLessons.assignmentId, assignmentId), eq(schema.scheduledLessons.organizationId, ctx.orgId)));
  const delivered = new Set(sl.filter((x) => x.sl.status === "completed").map((x) => x.unit));
  const changes = oldL.sort((x, y) => x.weekNumber - y.weekNumber).map((o) => {
    const n = newBy.get(o.weekNumber);
    const changed = !n || JSON.stringify([o.title, o.summary, o.content, o.objectives]) !== JSON.stringify([n.title, n.summary, n.content, n.objectives]);
    return { unitWeek: o.weekNumber, title: o.title, newTitle: n?.title ?? o.title, changed, alreadyDelivered: delivered.has(o.weekNumber) };
  });
  return { available: true as const, from: fromV, to: toV, summary: toV.changeSummary, changes, movable: changes.filter((x) => !x.alreadyDelivered).length, changedMovable: changes.filter((x) => x.changed && !x.alreadyDelivered).length };
}

/** Moves the NOT-YET-DELIVERED lessons to the newer version. Delivered weeks stay on the version that was taught. */
export async function adoptNewVersion(ctx: OrgCtx, assignmentId: string, notes = "") {
  assertCan(ctx, "sessions.manage");
  const pv = await previewAdoption(ctx, assignmentId);
  if (!pv.available) return { ok: false as const, error: "There is no newer version to adopt." };
  const db = await getDb();
  const [a] = await db.select().from(schema.curriculumAssignments).where(and(eq(schema.curriculumAssignments.id, assignmentId), eq(schema.curriculumAssignments.organizationId, ctx.orgId)));
  const newL = await db.select({ id: schema.curriculumLessons.id, w: schema.curriculumLessons.weekNumber }).from(schema.curriculumLessons).where(eq(schema.curriculumLessons.versionId, pv.to.id));
  const newBy = new Map(newL.map((l) => [l.w, l.id]));
  const rows = await db.select({ sl: schema.scheduledLessons, unit: schema.curriculumLessons.weekNumber }).from(schema.scheduledLessons).innerJoin(schema.curriculumLessons, eq(schema.curriculumLessons.id, schema.scheduledLessons.lessonId)).where(and(eq(schema.scheduledLessons.assignmentId, assignmentId), eq(schema.scheduledLessons.organizationId, ctx.orgId)));
  const movable = rows.filter((r) => r.sl.status !== "completed" && newBy.has(r.unit));
  const firstWeek = Math.min(...movable.map((r) => r.sl.weekNumber), 27);
  await db.transaction(async (tx) => {
    for (const r of movable) await tx.update(schema.scheduledLessons).set({ lessonId: newBy.get(r.unit)! }).where(eq(schema.scheduledLessons.id, r.sl.id));
    await tx.update(schema.curriculumAssignments).set({ versionId: pv.to.id }).where(eq(schema.curriculumAssignments.id, a.id));
    await tx.insert(schema.versionAdoptions).values({ organizationId: ctx.orgId, assignmentId, fromVersionId: a.versionId, toVersionId: pv.to.id, fromWeek: firstWeek, weeksMoved: movable.length, adoptedBy: ctx.userId, notes });
    await audit({ id: ctx.userId, label: ctx.userName }, "programme.version_adopted", { type: "assignment", id: assignmentId }, { from: a.versionId, to: pv.to.id, weeksMoved: movable.length }, { orgId: ctx.orgId, db: tx });
  });
  return { ok: true as const, weeksMoved: movable.length };
}

export async function cancelProgramme(ctx: OrgCtx, assignmentId: string) {
  assertCan(ctx, "sessions.manage");
  const db = await getDb();
  const r = await db.update(schema.curriculumAssignments).set({ status: "cancelled" }).where(and(eq(schema.curriculumAssignments.id, assignmentId), eq(schema.curriculumAssignments.organizationId, ctx.orgId), eq(schema.curriculumAssignments.status, "draft"))).returning({ id: schema.curriculumAssignments.id });
  if (!r.length) throw new AccessError("Only a draft programme can be cancelled.");
}

export async function limitsSummary(ctx: OrgCtx) {
  return { learners: await limitOf(ctx.orgId, "maxLearners"), classes: await limitOf(ctx.orgId, "maxClasses"), sessions: await limitOf(ctx.orgId, "maxActiveSessions") };
}
export { orgSettings };
