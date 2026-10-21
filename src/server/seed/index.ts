import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db";
import * as s from "../db/schema";
import { CATALOG, CATEGORIES } from "@/content/catalog";
import { CONTENT } from "@/content/registry";
import { buildBlueprints, buildLessons, type BuiltLesson } from "@/content/build";
import { PAGES } from "./site";
import { sha256 } from "../crypto";
import { validateCurriculum } from "@/lib/completeness";
import { loadDefaultLogos } from "./logos";

const SEED_LOCK = 7_300_001;
export const SEED_BASELINE_VERSION = 1;

/** Fast, idempotent baseline (categories, plans, pages, forum, templates, catalogue rows) plus authored curriculum content. */
export async function ensureSeed(db: DB) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SEED_LOCK})`);
    await seedBaseline(tx as unknown as DB);
  });
  if (process.env.FSSA_AUTOSEED_CONTENT !== "0") await seedContent(db);
}

async function seedBaseline(db: DB) {
  // Curriculum categories
  for (const [i, c] of CATEGORIES.entries()) {
    await db.insert(s.curriculumCategories).values({ slug: c.slug, name: c.name, description: c.description, sortOrder: i }).onConflictDoNothing({ target: s.curriculumCategories.slug });
  }
  const cats = await db.select().from(s.curriculumCategories);
  const catId = new Map(cats.map((c) => [c.slug, c.id]));
  // 50 catalogue records (content arrives separately, per curriculum)
  for (const e of CATALOG) {
    const slug = e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    await db.insert(s.curricula).values({
      catalogNumber: e.n, slug, title: e.title, shortDescription: e.short, fullDescription: `${e.short}\n\nThis curriculum runs for 26 weeks. It includes a mid-session test (week 13), a final examination (week 25) and a revision week (week 26).`,
      categoryId: catId.get(e.cat), tags: e.tags, audience: e.audience, level: e.level, themes: e.themes, outcomes: e.outcomes, doctrinalNotes: e.note, status: "draft", accessTier: "free", visibility: "public",
    }).onConflictDoNothing({ target: s.curricula.slug });
  }
  // Plans (prices are the Super Admin's decision; paid plans start as hidden drafts)
  const plans = [
    { code: "free", name: "Free", description: "For churches starting out: one active session, a limited number of learners and the essentials.", status: "active" as const, interval: "free" as const, sort: 0,
      ent: { maxLearners: 100, maxClasses: 5, maxActiveSessions: 1, maxAdmins: 2, examsPerSession: 4, curriculumTier: 0, downloads: 1, certificates: 0, advancedReports: 0, customBranding: 0, aiAssist: 0, storageMb: 50 }, hi: ["Up to 100 learners", "Up to 5 classes", "One active session", "Mid-session test and final examination", "Community forum"] },
    { code: "standard", name: "Standard", description: "More learners and classes, certificates and downloadable lesson materials.", status: "draft" as const, interval: "yearly" as const, sort: 1,
      ent: { maxLearners: 500, maxClasses: 25, maxActiveSessions: 2, maxAdmins: 5, examsPerSession: 12, curriculumTier: 1, downloads: 1, certificates: 1, advancedReports: 0, customBranding: 0, aiAssist: 0, storageMb: 500 }, hi: ["Up to 500 learners", "Up to 25 classes", "Certificates", "Standard-tier curricula"] },
    { code: "premium", name: "Premium", description: "Large churches and networks: very high limits, advanced reports and church branding.", status: "draft" as const, interval: "yearly" as const, sort: 2,
      ent: { maxLearners: null, maxClasses: null, maxActiveSessions: null, maxAdmins: null, examsPerSession: null, curriculumTier: 2, downloads: 1, certificates: 1, advancedReports: 1, customBranding: 1, aiAssist: 1, storageMb: 5000 }, hi: ["Unlimited learners and classes", "Advanced reports", "Church branding", "All curricula"] },
  ];
  for (const p of plans) {
    const [row] = await db.insert(s.subscriptionPlans).values({ code: p.code, name: p.name, description: p.description, status: p.status, billingInterval: p.interval, sortOrder: p.sort, display: { highlights: p.hi } }).onConflictDoNothing({ target: s.subscriptionPlans.code }).returning({ id: s.subscriptionPlans.id });
    if (!row) continue;
    for (const [k, v] of Object.entries(p.ent)) await db.insert(s.planEntitlements).values({ planId: row.id, featureKey: k, limitValue: v as number | null });
  }
  // Forum categories
  const forum = [
    ["general", "General discussion", "Open conversation among members of every church.", false], ["teaching-help", "Teaching help", "Ask and share ideas for teaching Sunday school.", false],
    ["prayer", "Prayer requests", "Share requests and pray for one another. Do not post private details about other people.", false], ["testimonies", "Testimonies", "What God is doing in and through you.", false],
    ["announcements", "Announcements", "News from the Academy.", true],
  ] as const;
  for (const [i, f] of forum.entries()) await db.insert(s.forumCategories).values({ slug: f[0], name: f[1], description: f[2], staffOnlyPosting: f[3], sortOrder: i }).onConflictDoNothing({ target: s.forumCategories.slug });
  // Session templates
  const [have] = await db.select({ n: sql<number>`count(*)::int` }).from(s.sessionTemplates).where(sql`${s.sessionTemplates.organizationId} is null`);
  if (!have.n) {
    await db.insert(s.sessionTemplates).values([
      { name: "Standard (test week 13, examination week 25, revision week 26)", description: "The default 26-week sequence.", config: { midtestWeek: 13, finalWeek: 25, revisionWeek: 26 }, isDefault: true },
      { name: "Revision before the examination", description: "Revision in week 25 and the final examination in week 26.", config: { midtestWeek: 13, finalWeek: 26, revisionWeek: 25 } },
    ]);
  }
  // Website pages
  for (const p of PAGES) {
    await db.insert(s.sitePages).values({ slug: p.slug, title: p.title, kind: p.kind, sections: p.sections, seo: p.seo ?? {}, status: "published", publishedAt: new Date() }).onConflictDoNothing({ target: s.sitePages.slug });
  }
  await loadDefaultLogos(db);
}

export interface SeedReport { created: number[]; updated: number[]; versioned: number[]; skipped: number[] }

const hashOf = (lessons: BuiltLesson[]) => sha256(JSON.stringify(lessons.map((l) => [l.weekNumber, l.title, l.summary, l.content, l.objectives, l.questions])));

/**
 * Seeds authored curriculum content. For each curriculum with content:
 *  - no seeded version yet: create version 1 (status in_review when it passes the completeness rules, otherwise draft);
 *  - seeded version exists, unchanged: nothing;
 *  - seeded version exists, content changed: draft/in-review versions are refreshed in place; FROZEN (published) versions are never touched and
 *    the improved content is added as a NEW version awaiting review.
 */
export async function seedContent(db: DB, only?: number[]): Promise<SeedReport> {
  const report: SeedReport = { created: [], updated: [], versioned: [], skipped: [] };
  for (const entry of CATALOG) {
    if (only && !only.includes(entry.n)) continue;
    const seeds = CONTENT[entry.n];
    if (!seeds) continue;
    const lessons = buildLessons(seeds);
    const hash = hashOf(lessons);
    const [cur] = await db.select().from(s.curricula).where(eq(s.curricula.catalogNumber, entry.n));
    if (!cur) continue;
    const versions = await db.select().from(s.curriculumVersions).where(eq(s.curriculumVersions.curriculumId, cur.id));
    const seeded = versions.filter((v) => v.provenance === "seed").sort((a, b) => b.versionNumber - a.versionNumber);
    const latest = seeded[0];
    if (latest?.contentHash === hash) { report.skipped.push(entry.n); continue; }
    if (latest && (latest.status === "draft" || latest.status === "in_review" || latest.status === "rejected")) {
      await db.transaction(async (tx) => {
        await tx.delete(s.questionBanks).where(eq(s.questionBanks.versionId, latest.id));
        await tx.delete(s.assessmentBlueprints).where(eq(s.assessmentBlueprints.versionId, latest.id));
        await tx.delete(s.curriculumLessons).where(eq(s.curriculumLessons.versionId, latest.id));
        await writeVersionContent(tx as unknown as DB, entry, cur.id, latest.id, lessons, hash);
      });
      report.updated.push(entry.n);
      continue;
    }
    const nextNumber = Math.max(0, ...versions.map((v) => v.versionNumber)) + 1;
    await db.transaction(async (tx) => {
      const [v] = await tx.insert(s.curriculumVersions).values({ curriculumId: cur.id, versionNumber: nextNumber, status: "draft", provenance: "seed", changeSummary: latest ? "Content update from the platform's curriculum team (pending review)." : "Initial release of this curriculum (drafted with AI assistance; awaiting human review).", contentHash: hash }).returning({ id: s.curriculumVersions.id });
      await writeVersionContent(tx as unknown as DB, entry, cur.id, v.id, lessons, hash);
    });
    (latest ? report.versioned : report.created).push(entry.n);
  }
  return report;
}

async function writeVersionContent(db: DB, entry: (typeof CATALOG)[number], curriculumId: string, versionId: string, lessons: BuiltLesson[], hash: string) {
  const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  const lessonRows = await db.insert(s.curriculumLessons).values(lessons.map((l) => ({
    versionId, weekNumber: l.weekNumber, title: l.title, summary: l.summary, theme: l.theme, unitKind: l.unitKind, primaryScripture: l.primaryScripture, additionalScripture: l.additionalScripture,
    memoryVerse: l.memoryVerse, objectives: l.objectives, keyTerms: l.keyTerms, durationMinutes: l.durationMinutes, content: l.content,
  }))).returning({ id: s.curriculumLessons.id, week: s.curriculumLessons.weekNumber });
  const lessonId = new Map(lessonRows.map((r) => [r.week, r.id]));
  const [bank] = await db.insert(s.questionBanks).values({ versionId, title: `${entry.title}: question bank`, description: "Questions drafted with the lessons. Each carries an explanation or marking rubric.", status: "draft" }).returning({ id: s.questionBanks.id });
  const all = lessons.flatMap((l) => l.questions);
  for (const part of chunk(all, 60)) {
    const rows = await db.insert(s.questions).values(part.map((q) => ({
      bankId: bank.id, versionId, lessonId: lessonId.get(q.week), weekNumber: q.week, type: q.type, text: q.text, scriptureRef: q.scripture, difficulty: q.difficulty, marks: q.marks, topicTags: q.tags, status: "draft" as const,
    }))).returning({ id: s.questions.id });
    await db.insert(s.questionAnswerKeys).values(part.map((q, i) => ({ questionId: rows[i].id, config: q.config, explanation: q.explanation })));
    const opts = part.flatMap((q, i) => q.options.map((text, j) => ({ questionId: rows[i].id, text, sortOrder: j })));
    if (opts.length) await db.insert(s.questionOptions).values(opts);
  }
  for (const b of buildBlueprints(entry, lessons)) await db.insert(s.assessmentBlueprints).values({ versionId, kind: b.kind, config: b.config });
  const report = validateCurriculum(lessons, all.map((q) => ({ weekNumber: q.week, type: q.type, hasKey: true, hasExplanation: !!q.explanation })), buildBlueprints(entry, lessons).map((b) => ({ kind: b.kind, totalMarks: b.config.totalMarks, durationMinutes: b.config.durationMinutes, passPercent: b.config.passPercent, types: b.config.types })));
  await db.update(s.curriculumVersions).set({
    contentHash: hash, status: report.ok ? "in_review" : "draft", validation: { ok: report.ok, checkedAt: new Date().toISOString(), lessonsComplete: report.lessonsComplete, words: report.words, problems: report.problems },
  }).where(eq(s.curriculumVersions.id, versionId));
  await db.update(s.curricula).set({ status: report.ok ? "in_review" : "draft" }).where(and(eq(s.curricula.id, curriculumId), sql`${s.curricula.currentVersionId} is null`));
}
