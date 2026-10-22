import "server-only";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { getDb, schema, type DB, type Tx, qid } from "../db";
import { AccessError, NotFoundError } from "../org";
import { audit, type Actor } from "../audit";
import { sha256 } from "../crypto";
import { getSetting } from "../settings";
import { getPassages } from "../bible-data";
import { validateCurriculum, validateLesson, type CurriculumReport, type LessonLike } from "@/lib/completeness";
import { slugify } from "@/lib/text";
import type { AnswerConfig, LessonContent, QuestionType } from "@/lib/lesson-types";
import { notify } from "./notify";

export class FrozenError extends Error { constructor(msg = "This version is frozen. Create a new draft version to change it.") { super(msg); this.name = "FrozenError"; } }
export const EDITABLE = ["draft", "in_review", "rejected"] as const;
const isEditable = (s: string) => (EDITABLE as readonly string[]).includes(s);

export const emptyContent = (): LessonContent => ({ introduction: "", context: "", observations: "", teachingPoints: [], discussion: [], application: "", activity: "", takeHome: "", prayer: "", teacherGuidance: "", supplementary: [], assessmentNote: "" });

/* ===================== Public library ===================== */
export interface CatalogFilter { q?: string; category?: string; tag?: string; level?: string; tier?: string; sort?: "number" | "title" | "newest"; page?: number; pageSize?: number }

export async function listCatalog(f: CatalogFilter = {}) {
  const db = await getDb();
  const ps = Math.min(f.pageSize ?? 12, 60), off = ((f.page ?? 1) - 1) * ps;
  const where = and(
    eq(schema.curricula.status, "published"), eq(schema.curricula.visibility, "public"),
    f.q ? or(ilike(schema.curricula.title, `%${f.q}%`), ilike(schema.curricula.shortDescription, `%${f.q}%`)) : undefined,
    f.category ? eq(schema.curriculumCategories.slug, f.category) : undefined,
    f.level ? eq(schema.curricula.level, f.level) : undefined,
    f.tier ? eq(schema.curricula.accessTier, f.tier as "free") : undefined,
    f.tag ? sql`${schema.curricula.tags} @> ${JSON.stringify([f.tag])}::jsonb` : undefined,
  );
  const order = f.sort === "title" ? asc(schema.curricula.title) : f.sort === "newest" ? desc(schema.curricula.updatedAt) : asc(schema.curricula.catalogNumber);
  const rows = await db.select({ c: schema.curricula, cat: schema.curriculumCategories.name, catSlug: schema.curriculumCategories.slug })
    .from(schema.curricula).leftJoin(schema.curriculumCategories, eq(schema.curriculumCategories.id, schema.curricula.categoryId)).where(where).orderBy(order).limit(ps).offset(off);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.curricula).leftJoin(schema.curriculumCategories, eq(schema.curriculumCategories.id, schema.curricula.categoryId)).where(where);
  return { rows, total: n, page: f.page ?? 1, pageSize: ps };
}

export async function listCategories() {
  const db = await getDb();
  return db.select({ c: schema.curriculumCategories, published: sql<number>`(select count(*)::int from curricula x where x.category_id = ${qid(schema.curriculumCategories)} and x.status = 'published')`, total: sql<number>`(select count(*)::int from curricula x where x.category_id = ${qid(schema.curriculumCategories)})` })
    .from(schema.curriculumCategories).orderBy(asc(schema.curriculumCategories.sortOrder));
}

/** Public outline: titles, themes, Scripture and objectives only. Teaching notes stay inside churches' private workspaces. */
export async function getPublicCurriculum(slug: string) {
  const db = await getDb();
  const [row] = await db.select({ c: schema.curricula, cat: schema.curriculumCategories.name }).from(schema.curricula).leftJoin(schema.curriculumCategories, eq(schema.curriculumCategories.id, schema.curricula.categoryId))
    .where(and(eq(schema.curricula.slug, slug), eq(schema.curricula.status, "published"), eq(schema.curricula.visibility, "public")));
  if (!row || !row.c.currentVersionId) return null;
  const lessons = await db.select({ week: schema.curriculumLessons.weekNumber, title: schema.curriculumLessons.title, theme: schema.curriculumLessons.theme, summary: schema.curriculumLessons.summary, scripture: schema.curriculumLessons.primaryScripture, kind: schema.curriculumLessons.unitKind, minutes: schema.curriculumLessons.durationMinutes })
    .from(schema.curriculumLessons).where(eq(schema.curriculumLessons.versionId, row.c.currentVersionId)).orderBy(asc(schema.curriculumLessons.weekNumber));
  const [v] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, row.c.currentVersionId));
  const bps = await db.select({ kind: schema.assessmentBlueprints.kind, config: schema.assessmentBlueprints.config }).from(schema.assessmentBlueprints).where(eq(schema.assessmentBlueprints.versionId, row.c.currentVersionId));
  return { curriculum: row.c, category: row.cat, version: v, lessons, blueprints: bps };
}

/* ===================== Version bundle + validation ===================== */
export async function loadBundle(versionId: string, db?: DB | Tx) {
  const d = db ?? (await getDb());
  const [version] = await d.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, versionId));
  if (!version) throw new NotFoundError("Version not found.");
  const lessons = await d.select().from(schema.curriculumLessons).where(eq(schema.curriculumLessons.versionId, versionId)).orderBy(asc(schema.curriculumLessons.weekNumber));
  const qs = await d.select({ id: schema.questions.id, week: schema.questions.weekNumber, type: schema.questions.type, hasKey: sql<boolean>`${schema.questionAnswerKeys.id} is not null`, expl: schema.questionAnswerKeys.explanation })
    .from(schema.questions).leftJoin(schema.questionAnswerKeys, eq(schema.questionAnswerKeys.questionId, schema.questions.id)).where(eq(schema.questions.versionId, versionId));
  const bps = await d.select().from(schema.assessmentBlueprints).where(eq(schema.assessmentBlueprints.versionId, versionId));
  return { version, lessons, questions: qs, blueprints: bps };
}

export const asLessonLike = (l: typeof schema.curriculumLessons.$inferSelect): LessonLike => ({
  weekNumber: l.weekNumber, title: l.title, summary: l.summary, theme: l.theme, unitKind: l.unitKind, primaryScripture: l.primaryScripture, additionalScripture: l.additionalScripture,
  memoryVerse: l.memoryVerse, objectives: l.objectives, keyTerms: l.keyTerms, durationMinutes: l.durationMinutes, content: l.content,
});

/** Runs every completeness rule plus a check that each Scripture reference resolves to real Bible text. */
export async function validateVersion(versionId: string, opts: { store?: boolean } = {}): Promise<CurriculumReport & { scriptureProblems: string[] }> {
  const b = await loadBundle(versionId);
  const lessons = b.lessons.map(asLessonLike);
  const report = validateCurriculum(lessons, b.questions.map((q) => ({ weekNumber: q.week, type: q.type, hasKey: !!q.hasKey, hasExplanation: !!q.expl })),
    b.blueprints.map((x) => ({ kind: x.kind, totalMarks: x.config.totalMarks, durationMinutes: x.config.durationMinutes, passPercent: x.config.passPercent, types: x.config.types })));
  const scriptureProblems: string[] = [];
  for (const l of lessons) for (const r of [...l.primaryScripture, ...l.additionalScripture, l.memoryVerse]) {
    if (r && getPassages(r, "bsb").length === 0) scriptureProblems.push(`Week ${l.weekNumber}: "${r}" does not resolve to Bible text.`);
  }
  if (scriptureProblems.length) report.problems.push(`${scriptureProblems.length} Scripture reference(s) do not resolve to Bible text.`);
  const ok = report.problems.length === 0;
  if (opts.store) {
    const db = await getDb();
    await db.update(schema.curriculumVersions).set({ validation: { ok, checkedAt: new Date().toISOString(), lessonsComplete: report.lessonsComplete, words: report.words, questions: report.questions, problems: report.problems.concat(scriptureProblems.slice(0, 20)) } }).where(and(eq(schema.curriculumVersions.id, versionId)));
  }
  return { ...report, ok, scriptureProblems };
}

export function contentHashOf(b: Awaited<ReturnType<typeof loadBundle>>) {
  return sha256(JSON.stringify([b.lessons.map((l) => [l.weekNumber, l.title, l.summary, l.content, l.objectives]), b.blueprints.map((x) => [x.kind, x.config])]));
}

/* ===================== Admin: listing ===================== */
export async function adminListCurricula(f: { q?: string; status?: string; category?: string; page?: number; pageSize?: number } = {}) {
  const db = await getDb();
  const ps = Math.min(f.pageSize ?? 25, 100), off = ((f.page ?? 1) - 1) * ps;
  const where = and(
    f.status ? eq(schema.curricula.status, f.status as "draft") : undefined,
    f.q ? ilike(schema.curricula.title, `%${f.q}%`) : undefined,
    f.category ? eq(schema.curriculumCategories.slug, f.category) : undefined,
  );
  const rows = await db.select({ c: schema.curricula, cat: schema.curriculumCategories.name,
    latestVersionId: sql<string | null>`(select v.id from curriculum_versions v where v.curriculum_id = ${qid(schema.curricula)} order by v.version_number desc limit 1)`,
    latestStatus: sql<string | null>`(select v.status from curriculum_versions v where v.curriculum_id = ${qid(schema.curricula)} order by v.version_number desc limit 1)`,
    latestNumber: sql<number | null>`(select v.version_number from curriculum_versions v where v.curriculum_id = ${qid(schema.curricula)} order by v.version_number desc limit 1)`,
    latestValid: sql<boolean | null>`(select (v.validation->>'ok')::boolean from curriculum_versions v where v.curriculum_id = ${qid(schema.curricula)} order by v.version_number desc limit 1)`,
    lessonCount: sql<number>`(select count(*)::int from curriculum_lessons l join curriculum_versions v on v.id = l.version_id where v.curriculum_id = ${qid(schema.curricula)} and v.version_number = (select max(v2.version_number) from curriculum_versions v2 where v2.curriculum_id = ${qid(schema.curricula)}))`,
  }).from(schema.curricula).leftJoin(schema.curriculumCategories, eq(schema.curriculumCategories.id, schema.curricula.categoryId)).where(where).orderBy(asc(schema.curricula.catalogNumber), asc(schema.curricula.title)).limit(ps).offset(off);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.curricula).leftJoin(schema.curriculumCategories, eq(schema.curriculumCategories.id, schema.curricula.categoryId)).where(where);
  return { rows, total: n, page: f.page ?? 1, pageSize: ps };
}

export async function getCurriculumAdmin(id: string) {
  const db = await getDb();
  const [c] = await db.select().from(schema.curricula).where(eq(schema.curricula.id, id));
  if (!c) throw new NotFoundError("Curriculum not found.");
  const versions = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.curriculumId, id)).orderBy(desc(schema.curriculumVersions.versionNumber));
  const reviews = versions.length ? await db.select({ r: schema.curriculumReviews, reviewer: schema.users.fullName }).from(schema.curriculumReviews).leftJoin(schema.users, eq(schema.users.id, schema.curriculumReviews.reviewerId)).where(inArray(schema.curriculumReviews.versionId, versions.map((v) => v.id))).orderBy(desc(schema.curriculumReviews.createdAt)) : [];
  return { curriculum: c, versions, reviews };
}

/* ===================== Admin: create / edit ===================== */
export async function createCurriculum(actor: Actor, input: { title: string; categoryId?: string; shortDescription?: string; audience?: string; level?: string }) {
  const title = input.title.trim();
  if (title.length < 4) return { ok: false as const, error: "Enter a curriculum title." };
  const db = await getDb();
  let slug = slugify(title);
  const [dup] = await db.select({ id: schema.curricula.id }).from(schema.curricula).where(eq(schema.curricula.slug, slug));
  if (dup) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const out = await db.transaction(async (tx) => {
    const [mx] = await tx.select({ m: sql<number>`coalesce(max(${schema.curricula.catalogNumber}), 0)::int` }).from(schema.curricula);
    const [c] = await tx.insert(schema.curricula).values({ title, slug, catalogNumber: mx.m + 1, categoryId: input.categoryId || null, shortDescription: input.shortDescription?.trim() ?? "", audience: input.audience || "Teens and adults", level: input.level || "Foundation", status: "draft", createdBy: actor.id }).returning({ id: schema.curricula.id });
    const v = await createBlankVersion(tx, c.id, 1, actor.id);
    await audit(actor, "curriculum.created", { type: "curriculum", id: c.id }, { title }, { db: tx });
    return { id: c.id, versionId: v };
  });
  return { ok: true as const, ...out };
}

async function createBlankVersion(tx: DB | Tx, curriculumId: string, number: number, authorId: string | null) {
  const [v] = await tx.insert(schema.curriculumVersions).values({ curriculumId, versionNumber: number, status: "draft", authorId, provenance: "authored", changeSummary: number === 1 ? "New curriculum." : "" }).returning({ id: schema.curriculumVersions.id });
  await tx.insert(schema.curriculumLessons).values(Array.from({ length: 26 }, (_, i) => {
    const w = i + 1;
    return { versionId: v.id, weekNumber: w, title: `Week ${w} (untitled)`, unitKind: (w === 13 ? "midtest" : w === 25 ? "final" : w === 26 ? "revision" : "teaching") as "teaching", content: emptyContent() };
  }));
  await tx.insert(schema.questionBanks).values({ versionId: v.id, title: "Question bank" });
  return v.id;
}

export async function updateCurriculumMeta(actor: Actor, id: string, patch: Partial<{ title: string; shortDescription: string; fullDescription: string; categoryId: string | null; audience: string; level: string; durationLabel: string; themes: string[]; outcomes: string[]; doctrinalNotes: string; author: string; accessTier: "free" | "standard" | "premium"; visibility: "public" | "registered" | "private"; tags: string[]; coverImage: string | null }>) {
  const db = await getDb();
  await db.update(schema.curricula).set(patch).where(eq(schema.curricula.id, id));
  await audit(actor, "curriculum.meta_updated", { type: "curriculum", id }, { fields: Object.keys(patch) });
}

async function editableVersion(versionId: string) {
  const db = await getDb();
  const [v] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, versionId));
  if (!v) throw new NotFoundError("Version not found.");
  if (!isEditable(v.status)) throw new FrozenError(`Version ${v.versionNumber} is ${v.status} and cannot be edited. Create a new draft version to make changes.`);
  return v;
}

export interface LessonPatch {
  title?: string; summary?: string; theme?: string; primaryScripture?: string[]; additionalScripture?: string[]; memoryVerse?: string; objectives?: string[];
  keyTerms?: { term: string; meaning: string }[]; durationMinutes?: number; content?: Partial<LessonContent>;
}
export async function updateLesson(actor: Actor, versionId: string, week: number, patch: LessonPatch) {
  await editableVersion(versionId);
  const db = await getDb();
  const [l] = await db.select().from(schema.curriculumLessons).where(and(eq(schema.curriculumLessons.versionId, versionId), eq(schema.curriculumLessons.weekNumber, week)));
  if (!l) throw new NotFoundError("Lesson not found.");
  const { content, ...rest } = patch;
  await db.update(schema.curriculumLessons).set({ ...rest, ...(content ? { content: { ...l.content, ...content } } : {}) }).where(eq(schema.curriculumLessons.id, l.id));
  await db.update(schema.curriculumVersions).set({ validation: {} }).where(eq(schema.curriculumVersions.id, versionId));
  await audit(actor, "curriculum.lesson_updated", { type: "lesson", id: l.id }, { week, versionId });
}

/** Moves a teaching lesson to another teaching week. Weeks 13, 25 and 26 are fixed assessment/revision units. */
export async function moveLesson(actor: Actor, versionId: string, from: number, to: number) {
  await editableVersion(versionId);
  const fixed = [13, 25, 26];
  if (fixed.includes(from) || fixed.includes(to) || from < 1 || to < 1 || to > 24 || from > 24) throw new AccessError("Only teaching lessons (weeks 1-12 and 14-24) can be reordered.");
  if (from === to) return;
  const db = await getDb();
  await db.transaction(async (tx) => {
    const rows = await tx.select({ id: schema.curriculumLessons.id, w: schema.curriculumLessons.weekNumber }).from(schema.curriculumLessons).where(and(eq(schema.curriculumLessons.versionId, versionId), sql`${schema.curriculumLessons.weekNumber} <= 24`, ne(schema.curriculumLessons.weekNumber, 13)));
    const order = rows.sort((a, b) => a.w - b.w);
    const slots = order.map((r) => r.w);
    const ids = order.map((r) => r.id);
    const fi = slots.indexOf(from), ti = slots.indexOf(to);
    const [moved] = ids.splice(fi, 1);
    ids.splice(ti, 0, moved);
    for (const [i, id] of ids.entries()) await tx.update(schema.curriculumLessons).set({ weekNumber: 100 + slots[i] }).where(eq(schema.curriculumLessons.id, id));
    await tx.update(schema.curriculumLessons).set({ weekNumber: sql`${schema.curriculumLessons.weekNumber} - 100` }).where(and(eq(schema.curriculumLessons.versionId, versionId), sql`${schema.curriculumLessons.weekNumber} > 100`));
    await audit(actor, "curriculum.lesson_moved", { type: "version", id: versionId }, { from, to }, { db: tx });
  });
}

export interface QuestionInput {
  id?: string; weekNumber: number | null; type: QuestionType; text: string; options?: string[]; config: AnswerConfig; explanation: string;
  difficulty: "easy" | "medium" | "hard"; marks: number; scriptureRef?: string; tags?: string[];
}
export async function upsertQuestion(actor: Actor, versionId: string, q: QuestionInput) {
  await editableVersion(versionId);
  if (q.text.trim().length < 8) return { ok: false as const, error: "Enter the question text." };
  const db = await getDb();
  const [bank] = await db.select().from(schema.questionBanks).where(eq(schema.questionBanks.versionId, versionId));
  if (!bank) throw new NotFoundError("Question bank not found.");
  const [lesson] = q.weekNumber ? await db.select({ id: schema.curriculumLessons.id }).from(schema.curriculumLessons).where(and(eq(schema.curriculumLessons.versionId, versionId), eq(schema.curriculumLessons.weekNumber, q.weekNumber))) : [];
  const id = await db.transaction(async (tx) => {
    let qid = q.id;
    const vals = { bankId: bank.id, versionId, lessonId: lesson?.id ?? null, weekNumber: q.weekNumber, type: q.type, text: q.text.trim(), scriptureRef: q.scriptureRef || null, difficulty: q.difficulty, marks: q.marks, topicTags: q.tags ?? [], status: "draft" as const, reviewStatus: "unreviewed" as const };
    if (qid) {
      const [own] = await tx.select({ id: schema.questions.id }).from(schema.questions).where(and(eq(schema.questions.id, qid), eq(schema.questions.versionId, versionId)));
      if (!own) throw new NotFoundError("Question not found in this version.");
      await tx.update(schema.questions).set(vals).where(eq(schema.questions.id, qid));
      await tx.delete(schema.questionOptions).where(eq(schema.questionOptions.questionId, qid));
    } else {
      const [r] = await tx.insert(schema.questions).values({ ...vals, authorId: actor.id }).returning({ id: schema.questions.id });
      qid = r.id;
    }
    if (q.options?.length) await tx.insert(schema.questionOptions).values(q.options.map((text, i) => ({ questionId: qid!, text, sortOrder: i })));
    await tx.insert(schema.questionAnswerKeys).values({ questionId: qid!, config: q.config, explanation: q.explanation }).onConflictDoUpdate({ target: schema.questionAnswerKeys.questionId, set: { config: q.config, explanation: q.explanation } });
    return qid!;
  });
  return { ok: true as const, id };
}
export async function deleteQuestion(actor: Actor, versionId: string, questionId: string) {
  await editableVersion(versionId);
  const db = await getDb();
  await db.delete(schema.questions).where(and(eq(schema.questions.id, questionId), eq(schema.questions.versionId, versionId)));
  await audit(actor, "curriculum.question_deleted", { type: "question", id: questionId });
}
export async function updateBlueprint(actor: Actor, versionId: string, kind: "midtest" | "final", config: typeof schema.assessmentBlueprints.$inferSelect["config"]) {
  await editableVersion(versionId);
  const db = await getDb();
  await db.insert(schema.assessmentBlueprints).values({ versionId, kind, config }).onConflictDoUpdate({ target: [schema.assessmentBlueprints.versionId, schema.assessmentBlueprints.kind], set: { config, reviewStatus: "unreviewed" } });
  await audit(actor, "curriculum.blueprint_updated", { type: "version", id: versionId }, { kind });
}

/* ===================== Workflow: review, approve, publish ===================== */
export async function submitForReview(actor: Actor, versionId: string) {
  const v = await editableVersion(versionId);
  const report = await validateVersion(versionId, { store: true });
  if (!report.ok) return { ok: false as const, error: "The curriculum is not complete yet.", problems: report.problems };
  const db = await getDb();
  await db.update(schema.curriculumVersions).set({ status: "in_review" }).where(eq(schema.curriculumVersions.id, versionId));
  await db.update(schema.curricula).set({ status: "in_review" }).where(and(eq(schema.curricula.id, v.curriculumId), sql`${schema.curricula.currentVersionId} is null`));
  await db.insert(schema.curriculumReviews).values({ versionId, reviewerId: actor.id, decision: "submitted", comments: "Submitted for review." });
  await audit(actor, "curriculum.submitted", { type: "version", id: versionId });
  return { ok: true as const };
}

/** Records a reviewer's decision. APPROVING freezes the version (content hash stored, edits blocked by the database). */
export async function reviewDecision(actor: Actor, versionId: string, decision: "approve" | "request_changes" | "reject", comments: string) {
  const db = await getDb();
  const [v] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, versionId));
  if (!v) throw new NotFoundError("Version not found.");
  if (v.status !== "in_review") throw new AccessError("Only versions that are in review can be decided.");
  if (decision === "approve") {
    const report = await validateVersion(versionId, { store: true });
    if (!report.ok) return { ok: false as const, error: "The curriculum no longer passes the completeness checks.", problems: report.problems };
    const hash = contentHashOf(await loadBundle(versionId));
    await db.transaction(async (tx) => {
      await tx.update(schema.questions).set({ status: "reviewed", reviewStatus: "reviewed", reviewerId: actor.id }).where(eq(schema.questions.versionId, versionId));
      await tx.update(schema.questionBanks).set({ status: "reviewed" }).where(eq(schema.questionBanks.versionId, versionId));
      await tx.update(schema.assessmentBlueprints).set({ reviewStatus: "reviewed" }).where(eq(schema.assessmentBlueprints.versionId, versionId));
      await tx.update(schema.curriculumVersions).set({ status: "approved", reviewerId: actor.id, approvedAt: new Date(), contentHash: hash }).where(eq(schema.curriculumVersions.id, versionId));
      await tx.insert(schema.curriculumReviews).values({ versionId, reviewerId: actor.id, decision: "approved", comments });
      await audit(actor, "curriculum.approved", { type: "version", id: versionId }, { hash }, { db: tx });
    });
  } else {
    const next = decision === "reject" ? "rejected" : "draft";
    await db.update(schema.curriculumVersions).set({ status: next }).where(eq(schema.curriculumVersions.id, versionId));
    await db.insert(schema.curriculumReviews).values({ versionId, reviewerId: actor.id, decision: decision === "reject" ? "rejected" : "changes_requested", comments });
    await audit(actor, `curriculum.${decision}`, { type: "version", id: versionId }, { comments: comments.slice(0, 200) });
  }
  return { ok: true as const };
}

/** Publishes an APPROVED version. The previous published version becomes "superseded" but stays intact for churches already using it. */
export async function publishVersion(actor: Actor, versionId: string) {
  const db = await getDb();
  const [v] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, versionId));
  if (!v) throw new NotFoundError("Version not found.");
  if (v.status !== "approved") throw new AccessError("Only an approved version can be published.");
  const bundle = await loadBundle(versionId);
  if (v.contentHash && v.contentHash !== contentHashOf(bundle)) throw new AccessError("The approved content no longer matches its review record. Create a new version.");
  const prev = await db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.curricula).where(eq(schema.curricula.id, v.curriculumId)).for("update");
    if (c.currentVersionId && c.currentVersionId !== versionId) await tx.update(schema.curriculumVersions).set({ status: "superseded" }).where(eq(schema.curriculumVersions.id, c.currentVersionId));
    await tx.update(schema.curriculumVersions).set({ status: "published", publishedAt: new Date() }).where(eq(schema.curriculumVersions.id, versionId));
    await tx.update(schema.curricula).set({ status: "published", currentVersionId: versionId }).where(eq(schema.curricula.id, v.curriculumId));
    await tx.insert(schema.curriculumReviews).values({ versionId, reviewerId: actor.id, decision: "published", comments: "" });
    await audit(actor, "curriculum.published", { type: "version", id: versionId }, { version: v.versionNumber }, { db: tx });
    return c.currentVersionId;
  });
  if (prev && prev !== versionId) await notifyAdoptionAvailable(v.curriculumId, prev, versionId);
  return { ok: true as const };
}

/** Tells administrators of churches using an earlier version that a newer one exists. Nothing is changed for them. */
async function notifyAdoptionAvailable(curriculumId: string, oldVersionId: string, newVersionId: string) {
  const db = await getDb();
  const [c] = await db.select({ title: schema.curricula.title }).from(schema.curricula).where(eq(schema.curricula.id, curriculumId));
  const using = await db.select({ orgId: schema.curriculumAssignments.organizationId }).from(schema.curriculumAssignments)
    .where(and(eq(schema.curriculumAssignments.versionId, oldVersionId), inArray(schema.curriculumAssignments.status, ["active", "draft"])));
  for (const orgId of new Set(using.map((u) => u.orgId))) {
    const admins = await db.select({ id: schema.organizationMemberships.userId }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.organizationId, orgId), eq(schema.organizationMemberships.role, "church_admin"), eq(schema.organizationMemberships.status, "active")));
    for (const a of admins) await notify(a.id, { type: "curriculum", title: `A newer version of “${c.title}” is available`, body: "Your active programme has NOT changed. Review what is new and choose whether to adopt it for the weeks not yet taught.", href: "/church/sessions", orgId, dedupeKey: `newver:${newVersionId}` });
  }
}

/** Starts a new editable draft by copying a frozen version (lessons, questions, answer keys, options and blueprints). */
export async function createDraftFromVersion(actor: Actor, fromVersionId: string, changeSummary = "") {
  const db = await getDb();
  const [from] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, fromVersionId));
  if (!from) throw new NotFoundError("Version not found.");
  const siblings = await db.select({ n: schema.curriculumVersions.versionNumber, status: schema.curriculumVersions.status }).from(schema.curriculumVersions).where(eq(schema.curriculumVersions.curriculumId, from.curriculumId));
  const open = siblings.find((s) => isEditable(s.status));
  if (open) return { ok: false as const, error: `Version ${open.n} is already open for editing. Finish or discard it first.` };
  const next = Math.max(...siblings.map((s) => s.n)) + 1;
  const id = await db.transaction(async (tx) => {
    const [v] = await tx.insert(schema.curriculumVersions).values({ curriculumId: from.curriculumId, versionNumber: next, status: "draft", authorId: actor.id, provenance: "authored", changeSummary: changeSummary || `Revision of version ${from.versionNumber}.` }).returning({ id: schema.curriculumVersions.id });
    const lessons = await tx.select().from(schema.curriculumLessons).where(eq(schema.curriculumLessons.versionId, fromVersionId));
    const newLessons = await tx.insert(schema.curriculumLessons).values(lessons.map(({ id: _i, versionId: _v, createdAt: _c, updatedAt: _u, ...rest }) => ({ ...rest, versionId: v.id }))).returning({ id: schema.curriculumLessons.id, w: schema.curriculumLessons.weekNumber });
    const idByWeek = new Map(newLessons.map((l) => [l.w, l.id]));
    const [bank] = await tx.select().from(schema.questionBanks).where(eq(schema.questionBanks.versionId, fromVersionId));
    const [newBank] = await tx.insert(schema.questionBanks).values({ versionId: v.id, title: bank?.title ?? "Question bank", description: bank?.description ?? "" }).returning({ id: schema.questionBanks.id });
    const qs = await tx.select().from(schema.questions).where(eq(schema.questions.versionId, fromVersionId));
    for (const q of qs) {
      const [nq] = await tx.insert(schema.questions).values({ bankId: newBank.id, versionId: v.id, lessonId: q.weekNumber ? idByWeek.get(q.weekNumber) ?? null : null, weekNumber: q.weekNumber, type: q.type, text: q.text, scriptureRef: q.scriptureRef, difficulty: q.difficulty, marks: q.marks, topicTags: q.topicTags, status: "draft", reviewStatus: "unreviewed", authorId: actor.id, version: q.version + 1 }).returning({ id: schema.questions.id });
      const opts = await tx.select().from(schema.questionOptions).where(eq(schema.questionOptions.questionId, q.id));
      if (opts.length) await tx.insert(schema.questionOptions).values(opts.map((o) => ({ questionId: nq.id, text: o.text, sortOrder: o.sortOrder, meta: o.meta })));
      const [k] = await tx.select().from(schema.questionAnswerKeys).where(eq(schema.questionAnswerKeys.questionId, q.id));
      if (k) await tx.insert(schema.questionAnswerKeys).values({ questionId: nq.id, config: k.config, explanation: k.explanation });
    }
    const bps = await tx.select().from(schema.assessmentBlueprints).where(eq(schema.assessmentBlueprints.versionId, fromVersionId));
    if (bps.length) await tx.insert(schema.assessmentBlueprints).values(bps.map((b) => ({ versionId: v.id, kind: b.kind, config: b.config, version: b.version + 1 })));
    await audit(actor, "curriculum.draft_created", { type: "version", id: v.id }, { from: fromVersionId }, { db: tx });
    return v.id;
  });
  return { ok: true as const, id };
}

export async function discardDraftVersion(actor: Actor, versionId: string) {
  const v = await editableVersion(versionId);
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.curriculumVersions).where(eq(schema.curriculumVersions.curriculumId, v.curriculumId));
  if (n <= 1) throw new AccessError("The only version of a curriculum cannot be discarded.");
  const [used] = await db.select({ id: schema.curriculumAssignments.id }).from(schema.curriculumAssignments).where(eq(schema.curriculumAssignments.versionId, versionId)).limit(1);
  if (used) throw new AccessError("A church is using this version.");
  await db.delete(schema.curriculumVersions).where(eq(schema.curriculumVersions.id, versionId));
  await audit(actor, "curriculum.draft_discarded", { type: "version", id: versionId });
}

export async function archiveCurriculum(actor: Actor, id: string, archive = true) {
  const db = await getDb();
  const [c] = await db.select().from(schema.curricula).where(eq(schema.curricula.id, id));
  if (!c) throw new NotFoundError();
  await db.update(schema.curricula).set({ status: archive ? "archived" : c.currentVersionId ? "published" : "draft" }).where(eq(schema.curricula.id, id));
  await audit(actor, archive ? "curriculum.archived" : "curriculum.restored", { type: "curriculum", id });
}

/** Duplicates the newest version of a curriculum into a brand-new curriculum with its own draft v1. */
export async function duplicateCurriculum(actor: Actor, id: string) {
  const db = await getDb();
  const [c] = await db.select().from(schema.curricula).where(eq(schema.curricula.id, id));
  if (!c) throw new NotFoundError();
  const [latest] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.curriculumId, id)).orderBy(desc(schema.curriculumVersions.versionNumber)).limit(1);
  const slug = `${c.slug}-copy-${Date.now().toString(36).slice(-4)}`;
  const [mx] = await db.select({ m: sql<number>`coalesce(max(${schema.curricula.catalogNumber}), 0)::int` }).from(schema.curricula);
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = c;
  const [nc] = await db.insert(schema.curricula).values({ ...rest, title: `${c.title} (copy)`, slug, catalogNumber: mx.m + 1, status: "draft", currentVersionId: null, createdBy: actor.id }).returning({ id: schema.curricula.id });
  if (latest) {
    const versionId = await copyVersionInto(actor, latest.id, nc.id);
    await audit(actor, "curriculum.duplicated", { type: "curriculum", id: nc.id }, { from: id });
    return { ok: true as const, id: nc.id, versionId };
  }
  return { ok: true as const, id: nc.id };
}
/** Copies the content of one version into version 1 of another curriculum. */
async function copyVersionInto(actor: Actor, fromVersionId: string, curriculumId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [v] = await tx.insert(schema.curriculumVersions).values({ curriculumId, versionNumber: 1, status: "draft", authorId: actor.id, changeSummary: "Duplicated from another curriculum." }).returning({ id: schema.curriculumVersions.id });
    const lessons = await tx.select().from(schema.curriculumLessons).where(eq(schema.curriculumLessons.versionId, fromVersionId));
    const nl = await tx.insert(schema.curriculumLessons).values(lessons.map(({ id: _i, versionId: _v, createdAt: _c, updatedAt: _u, ...rest }) => ({ ...rest, versionId: v.id }))).returning({ id: schema.curriculumLessons.id, w: schema.curriculumLessons.weekNumber });
    const idByWeek = new Map(nl.map((l) => [l.w, l.id]));
    const [bank] = await tx.insert(schema.questionBanks).values({ versionId: v.id, title: "Question bank" }).returning({ id: schema.questionBanks.id });
    for (const q of await tx.select().from(schema.questions).where(eq(schema.questions.versionId, fromVersionId))) {
      const [nq] = await tx.insert(schema.questions).values({ bankId: bank.id, versionId: v.id, lessonId: q.weekNumber ? idByWeek.get(q.weekNumber) ?? null : null, weekNumber: q.weekNumber, type: q.type, text: q.text, scriptureRef: q.scriptureRef, difficulty: q.difficulty, marks: q.marks, topicTags: q.topicTags, authorId: actor.id }).returning({ id: schema.questions.id });
      const opts = await tx.select().from(schema.questionOptions).where(eq(schema.questionOptions.questionId, q.id));
      if (opts.length) await tx.insert(schema.questionOptions).values(opts.map((o) => ({ questionId: nq.id, text: o.text, sortOrder: o.sortOrder })));
      const [k] = await tx.select().from(schema.questionAnswerKeys).where(eq(schema.questionAnswerKeys.questionId, q.id));
      if (k) await tx.insert(schema.questionAnswerKeys).values({ questionId: nq.id, config: k.config, explanation: k.explanation });
    }
    const bps = await tx.select().from(schema.assessmentBlueprints).where(eq(schema.assessmentBlueprints.versionId, fromVersionId));
    if (bps.length) await tx.insert(schema.assessmentBlueprints).values(bps.map((b) => ({ versionId: v.id, kind: b.kind, config: b.config })));
    return v.id;
  });
}

/* ===================== Completeness report across the catalogue ===================== */
export interface CompletenessRow {
  n: number | null; id: string; title: string; status: string; versionId: string | null; versionNumber: number | null; versionStatus: string | null;
  lessonsComplete: number; lessonsPresent: number; words: number; questions: number; ok: boolean; problems: string[]; weekFlags: ("ok" | "bad")[];
}
export async function completenessReport(opts: { deepScripture?: boolean } = {}): Promise<{ rows: CompletenessRow[]; totals: { curricula: number; withContent: number; passing: number; lessonsComplete: number; lessonsExpected: number; words: number; published: number } }> {
  const db = await getDb();
  const all = await db.select().from(schema.curricula).orderBy(asc(schema.curricula.catalogNumber));
  const rows: CompletenessRow[] = [];
  for (const c of all) {
    const [v] = await db.select().from(schema.curriculumVersions).where(eq(schema.curriculumVersions.curriculumId, c.id)).orderBy(desc(schema.curriculumVersions.versionNumber)).limit(1);
    if (!v) { rows.push({ n: c.catalogNumber, id: c.id, title: c.title, status: c.status, versionId: null, versionNumber: null, versionStatus: null, lessonsComplete: 0, lessonsPresent: 0, words: 0, questions: 0, ok: false, problems: ["No lesson content has been authored yet."], weekFlags: Array(26).fill("bad") }); continue; }
    const r = await validateVersion(v.id);
    rows.push({ n: c.catalogNumber, id: c.id, title: c.title, status: c.status, versionId: v.id, versionNumber: v.versionNumber, versionStatus: v.status, lessonsComplete: r.lessonsComplete, lessonsPresent: r.lessonsPresent, words: r.words, questions: r.questions, ok: r.ok, problems: [...r.problems, ...(opts.deepScripture ? r.scriptureProblems : [])], weekFlags: r.weeks.map((w) => (w.ok ? "ok" : "bad")) });
  }
  const withContent = rows.filter((r) => r.versionId);
  return { rows, totals: { curricula: rows.length, withContent: withContent.length, passing: rows.filter((r) => r.ok).length, lessonsComplete: rows.reduce((n, r) => n + r.lessonsComplete, 0), lessonsExpected: rows.length * 26, words: rows.reduce((n, r) => n + r.words, 0), published: rows.filter((r) => r.status === "published").length } };
}

/** Bulk path for the product owner: approve and publish every in-review version that passes validation. */
export async function approveAndPublishAllValid(actor: Actor) {
  const db = await getDb();
  const rows = await db.select({ v: schema.curriculumVersions, title: schema.curricula.title }).from(schema.curriculumVersions).innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumVersions.curriculumId)).where(eq(schema.curriculumVersions.status, "in_review"));
  const done: string[] = [], skipped: { title: string; reason: string }[] = [];
  for (const { v, title } of rows) {
    const r = await reviewDecision(actor, v.id, "approve", "Bulk approval by the Super Admin after review.");
    if (!r.ok) { skipped.push({ title, reason: r.error }); continue; }
    await publishVersion(actor, v.id);
    done.push(title);
  }
  return { done, skipped };
}

export { validateLesson, getSetting };

/** Builds the lesson as a learner or teacher would see it, for the Super Admin's preview. Nothing is scheduled or stored. */
export async function previewLessonView(versionId: string, week: number, asTeacher: boolean) {
  const db = await getDb();
  const [row] = await db.select({ l: schema.curriculumLessons, v: schema.curriculumVersions, c: schema.curricula }).from(schema.curriculumLessons)
    .innerJoin(schema.curriculumVersions, eq(schema.curriculumVersions.id, schema.curriculumLessons.versionId)).innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumVersions.curriculumId))
    .where(and(eq(schema.curriculumLessons.versionId, versionId), eq(schema.curriculumLessons.weekNumber, week)));
  if (!row) throw new NotFoundError("Lesson not found.");
  const { teacherGuidance, discussion, ...rest } = row.l.content;
  return {
    id: row.l.id, assignmentId: "", week, date: null, type: row.l.unitKind, status: "available" as const, curriculum: { title: row.c.title, slug: row.c.slug }, versionNumber: row.v.versionNumber,
    lesson: { title: row.l.title, summary: row.l.summary, theme: row.l.theme, scripture: row.l.primaryScripture, more: row.l.additionalScripture, memoryVerse: row.l.memoryVerse, objectives: row.l.objectives, keyTerms: row.l.keyTerms, minutes: row.l.durationMinutes, unitWeek: week },
    content: { ...rest, ...(asTeacher ? { teacherGuidance } : {}), discussion: discussion.map((d) => (asTeacher ? { q: d.q, guidance: d.guidance } : { q: d.q })) },
    isTeacherView: asTeacher, myProgress: null, related: [], classIds: [],
  };
}
