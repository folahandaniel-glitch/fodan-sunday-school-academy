import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db";
import * as s from "../db/schema";
import { CATALOG, CATEGORIES } from "@/content/catalog";
import { CONTENT } from "@/content/registry";
import { buildBlueprints, buildLessons, type BuiltLesson } from "@/content/build";
import { PAGES, FOUNDER_SECTION } from "./site";
import { sha256 } from "../crypto";
import { lessonsHashOf } from "../fingerprint";
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
  // Packages. Exactly five: Free (30 days, no code needed) and Silver, Bronze, Gold, Premium (USD per year). The Super Admin can edit any of them and add more.
  const plans = [
    { code: "free", name: "Free", description: "Start with the essentials for 30 days, with no access code needed.", status: "active" as const, interval: "free" as const, sort: 0, priceMinor: 0, trialDays: 30,
      ent: { maxLearners: 100, maxClasses: 5, maxActiveSessions: 1, maxAdmins: 2, examsPerSession: 4, curriculumTier: 0, downloads: 1, certificates: 0, advancedReports: 0, customBranding: 0, aiAssist: 0, storageMb: 50 }, hi: ["Free for 30 days, no access code needed", "Up to 100 learners", "Up to 5 classes", "One active session", "Mid-session test and final examination", "Community forum"] },
    { code: "silver", name: "Silver", description: "Small and growing churches: more learners and classes, certificates and downloadable lesson materials.", status: "active" as const, interval: "yearly" as const, sort: 1, priceMinor: 1000, trialDays: 0,
      ent: { maxLearners: 250, maxClasses: 15, maxActiveSessions: 1, maxAdmins: 3, examsPerSession: 8, curriculumTier: 1, downloads: 1, certificates: 1, advancedReports: 0, customBranding: 0, aiAssist: 0, storageMb: 250 }, hi: ["Up to 250 learners", "Up to 15 classes", "Certificates", "Downloadable lesson materials", "Core and standard curricula"] },
    { code: "bronze", name: "Bronze", description: "Established churches: two active sessions, more administrators and advanced reports.", status: "active" as const, interval: "yearly" as const, sort: 2, priceMinor: 1500, trialDays: 0,
      ent: { maxLearners: 600, maxClasses: 40, maxActiveSessions: 2, maxAdmins: 5, examsPerSession: 12, curriculumTier: 1, downloads: 1, certificates: 1, advancedReports: 1, customBranding: 0, aiAssist: 0, storageMb: 500 }, hi: ["Up to 600 learners", "Up to 40 classes", "Two active sessions", "Advanced reports", "Certificates"] },
    { code: "gold", name: "Gold", description: "Large churches: high limits, church branding and every curriculum tier.", status: "active" as const, interval: "yearly" as const, sort: 3, priceMinor: 2000, trialDays: 0,
      ent: { maxLearners: 1500, maxClasses: 100, maxActiveSessions: 4, maxAdmins: 10, examsPerSession: 24, curriculumTier: 2, downloads: 1, certificates: 1, advancedReports: 1, customBranding: 1, aiAssist: 0, storageMb: 2000 }, hi: ["Up to 1,500 learners", "Up to 100 classes", "Four active sessions", "Church branding", "All curricula"] },
    { code: "premium", name: "Premium", description: "Large churches and networks: no limits, advanced reports, church branding and AI-assisted tools.", status: "active" as const, interval: "yearly" as const, sort: 4, priceMinor: 2500, trialDays: 0,
      ent: { maxLearners: null, maxClasses: null, maxActiveSessions: null, maxAdmins: null, examsPerSession: null, curriculumTier: 2, downloads: 1, certificates: 1, advancedReports: 1, customBranding: 1, aiAssist: 1, storageMb: 5000 }, hi: ["Unlimited learners and classes", "Unlimited active sessions", "Advanced reports", "Church branding", "AI-assisted tools", "All curricula"] },
  ];
  for (const p of plans) {
    const [row] = await db.insert(s.subscriptionPlans).values({ code: p.code, name: p.name, description: p.description, status: p.status, billingInterval: p.interval, priceMinor: p.priceMinor, currency: p.priceMinor ? "USD" : "NGN", trialDays: p.trialDays, sortOrder: p.sort, display: { highlights: p.hi } }).onConflictDoNothing({ target: s.subscriptionPlans.code }).returning({ id: s.subscriptionPlans.id });
    if (!row) continue;
    for (const [k, v] of Object.entries(p.ent)) await db.insert(s.planEntitlements).values({ planId: row.id, featureKey: k, limitValue: v as number | null });
  }
  // One-time alignment of databases seeded earlier to the agreed package list (names, prices, status, 30-day Free start, features). Runs once, so later edits by the Super Admin are kept.
  const [flag] = await db.select().from(s.settings).where(eq(s.settings.key, "seed.packages.v1"));
  if (!flag) {
    for (const p of plans) {
      const vals = { name: p.name, description: p.description, status: p.status, billingInterval: p.interval, priceMinor: p.priceMinor, currency: p.priceMinor ? "USD" : "NGN", trialDays: p.trialDays, sortOrder: p.sort, display: { highlights: p.hi } };
      const [row] = await db.update(s.subscriptionPlans).set(vals).where(eq(s.subscriptionPlans.code, p.code)).returning({ id: s.subscriptionPlans.id });
      if (!row) continue;
      await db.delete(s.planEntitlements).where(eq(s.planEntitlements.planId, row.id));
      for (const [k, v] of Object.entries(p.ent)) await db.insert(s.planEntitlements).values({ planId: row.id, featureKey: k, limitValue: v as number | null });
    }
    await db.insert(s.settings).values({ key: "seed.packages.v1", value: { done: true } as never }).onConflictDoNothing();
  }
  // The earlier three-tier draft 'standard' plan is superseded: remove it when nothing uses it, otherwise retire it.
  await db.delete(s.subscriptionPlans).where(sql`${s.subscriptionPlans.code} = 'standard' and not exists (select 1 from organization_subscriptions os where os.plan_id = ${s.subscriptionPlans.id}) and not exists (select 1 from church_access_codes c where c.plan_id = ${s.subscriptionPlans.id}) and not exists (select 1 from payment_transactions t where t.plan_id = ${s.subscriptionPlans.id})`);
  await db.update(s.subscriptionPlans).set({ status: "retired" }).where(sql`${s.subscriptionPlans.code} = 'standard'`);
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
  // Databases seeded earlier: add the founder section to the home page once, and refresh two sentences about pricing so they match the final packages.
  const [home] = await db.select().from(s.sitePages).where(eq(s.sitePages.slug, "home"));
  if (home && !home.seo?.founderSeeded && !home.sections.some((x) => x.id === "founder")) {
    const at = home.sections.findIndex((x) => x.id === "cats");
    const next = [...home.sections]; next.splice(at >= 0 ? at : Math.max(home.sections.length - 1, 0), 0, FOUNDER_SECTION);
    await db.update(s.sitePages).set({ sections: next, seo: { ...(home.seo ?? {}), founderSeeded: true } }).where(eq(s.sitePages.id, home.id));
  }
  const REWORD: [string, string][] = [
    ["Registering a church is free. Choose a curriculum, set your opening Sunday and begin.", "Registering a church is free, and every church starts with 30 free days. Choose a curriculum, set your opening Sunday and begin."],
    ["Registration is free and the free plan covers a limited number of learners and classes. Paid plans with more capacity and features are configured by the Academy and appear on the Pricing page when available.", "Every church starts free for 30 days, with no access code needed. After that you choose a yearly package (Silver, Bronze, Gold or Premium) or enter an access code from the Academy. The Pricing page shows what each package includes."],
  ];
  for (const pg of await db.select().from(s.sitePages)) {
    let json = JSON.stringify(pg.sections), changed = false;
    for (const [a, b] of REWORD) { const ja = JSON.stringify(a).slice(1, -1), jb = JSON.stringify(b).slice(1, -1); if (json.includes(ja)) { json = json.split(ja).join(jb); changed = true; } }
    if (changed) await db.update(s.sitePages).set({ sections: JSON.parse(json) }).where(eq(s.sitePages.id, pg.id));
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
    // Approval replaces the stored fingerprint, so also compare the lesson text itself; otherwise every deploy re-adds an unchanged approved curriculum as a new version.
    if (latest) {
      const rows = await db.select().from(s.curriculumLessons).where(eq(s.curriculumLessons.versionId, latest.id));
      if (rows.length === lessons.length && lessonsHashOf(rows.sort((a, b) => a.weekNumber - b.weekNumber)) === lessonsHashOf(lessons)) { report.skipped.push(entry.n); continue; }
    }
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
