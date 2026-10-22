"use server";
import { redirect } from "next/navigation";
import { run, s, n, b, lines, type FormState } from "@/server/action-util";
import { requirePlatform, actorOf } from "@/server/guards";
import * as cur from "@/server/services/curriculum";
import * as admin from "@/server/services/admin";
import * as billing from "@/server/services/billing";
import * as accessCodes from "@/server/services/access-codes";
import * as cms from "@/server/services/cms";
import { getSetting } from "@/server/settings";
import { toMinor } from "@/lib/money";
import type { QuestionInput } from "@/server/services/curriculum";
import type { AnswerConfig, QuestionType } from "@/lib/lesson-types";
import type { PlatformRole, SiteSection } from "@/server/db/schema";
import { importCurriculumText, importQuestionsCsv, saveImportedCurriculum } from "@/server/services/import";

const fail = (error: string): FormState => ({ ok: false, error });
const actor = async (perm: Parameters<typeof requirePlatform>[0]) => { const u = await requirePlatform(perm); return { u, a: await actorOf(u) }; };

/* ---------- curricula ---------- */
export async function createCurriculumAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("curriculum.write"); const r = await cur.createCurriculum(a, { title: s(fd, "title"), categoryId: s(fd, "categoryId") || undefined, shortDescription: s(fd, "shortDescription"), audience: s(fd, "audience"), level: s(fd, "level") }); if (!r.ok) return fail(r.error); return { redirect: `/admin/curricula/${r.id}` }; });
}
export async function updateMetaAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("curriculum.write");
    await cur.updateCurriculumMeta(a, s(fd, "id"), { title: s(fd, "title"), shortDescription: s(fd, "shortDescription"), fullDescription: s(fd, "fullDescription"), categoryId: s(fd, "categoryId") || null, audience: s(fd, "audience"), level: s(fd, "level"), durationLabel: s(fd, "durationLabel"), themes: lines(fd, "themes"), outcomes: lines(fd, "outcomes"), doctrinalNotes: s(fd, "doctrinalNotes"), author: s(fd, "author"), accessTier: s(fd, "accessTier") as "free", visibility: s(fd, "visibility") as "public", tags: s(fd, "tags").split(",").map((t) => t.trim()).filter(Boolean) });
    return { message: "Curriculum details saved." };
  });
}
export async function saveLessonAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("curriculum.write");
    const idx = <T,>(prefix: string, make: (i: number) => T | null, max = 10) => Array.from({ length: max }, (_, i) => make(i)).filter((x): x is T => x !== null);
    await cur.updateLesson(a, s(fd, "versionId"), n(fd, "week"), {
      title: s(fd, "title"), summary: s(fd, "summary"), theme: s(fd, "theme"), primaryScripture: lines(fd, "primaryScripture"), additionalScripture: lines(fd, "additionalScripture"), memoryVerse: s(fd, "memoryVerse"), objectives: lines(fd, "objectives"),
      keyTerms: idx("kt", (i) => (s(fd, `kt_t_${i}`) ? { term: s(fd, `kt_t_${i}`), meaning: s(fd, `kt_m_${i}`) } : null)), durationMinutes: n(fd, "durationMinutes", 45),
      content: {
        introduction: s(fd, "introduction"), context: s(fd, "context"), observations: s(fd, "observations"), application: s(fd, "application"), activity: s(fd, "activity"), takeHome: s(fd, "takeHome"), prayer: s(fd, "prayer"), teacherGuidance: s(fd, "teacherGuidance"), assessmentNote: s(fd, "assessmentNote"),
        teachingPoints: idx("tp", (i) => (s(fd, `tp_h_${i}`) ? { heading: s(fd, `tp_h_${i}`), body: s(fd, `tp_b_${i}`) } : null)), discussion: idx("dq", (i) => (s(fd, `dq_q_${i}`) ? { q: s(fd, `dq_q_${i}`), guidance: s(fd, `dq_g_${i}`) } : null)), supplementary: lines(fd, "supplementary"),
      },
    });
    return { message: "Lesson saved." };
  });
}
export async function moveLessonAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("curriculum.write"); await cur.moveLesson(a, s(fd, "versionId"), n(fd, "from"), n(fd, "to")); return { message: "Lesson moved." }; });
}
export async function submitReviewAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("curriculum.write"); const r = await cur.submitForReview(a, s(fd, "versionId")); if (!r.ok) return fail(`${r.error} ${r.problems.slice(0, 4).join(" ")}`); return { message: "Submitted for review." }; });
}
export async function reviewAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("curriculum.review");
    const d = s(fd, "decision") as "approve" | "request_changes" | "reject";
    const r = await cur.reviewDecision(a, s(fd, "versionId"), d, s(fd, "comments"));
    if (!r.ok) return fail(`${r.error} ${r.problems.slice(0, 4).join(" ")}`);
    return { message: d === "approve" ? "Approved. This version is now frozen and can be published." : "Decision recorded." };
  });
}
export async function publishAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("curriculum.publish"); await cur.publishVersion(a, s(fd, "versionId")); return { message: "Published. Churches can now select this version. Churches already teaching an earlier version are not affected." }; });
}
export async function approveAllAction(_: FormState | null): Promise<FormState> {
  return run(async () => { const { a } = await actor("curriculum.publish"); const r = await cur.approveAndPublishAllValid(a); return { message: `${r.done.length} curriculum version(s) approved and published.${r.skipped.length ? ` ${r.skipped.length} skipped because they fail validation.` : ""}` }; });
}
export async function reviewAllAction(_: FormState | null): Promise<FormState> {
  return run(async () => { const { a } = await actor("curriculum.review"); const r = await cur.approveAllValid(a); return { message: `${r.done.length} curriculum version(s) reviewed and approved.${r.skipped.length ? ` ${r.skipped.length} skipped: ${r.skipped.slice(0, 3).map((x) => `${x.title} (${x.reason})`).join("; ")}.` : ""} Use Publish all to make them available to churches.` }; });
}
export async function publishAllAction(_: FormState | null): Promise<FormState> {
  return run(async () => { const { a } = await actor("curriculum.publish"); const r = await cur.publishAllApproved(a); return { message: `${r.done.length} curriculum version(s) published.${r.skipped.length ? ` ${r.skipped.length} skipped: ${r.skipped.slice(0, 3).map((x) => `${x.title} (${x.reason})`).join("; ")}.` : ""} Churches already teaching an earlier version are not affected.` }; });
}
export async function newDraftAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("curriculum.write"); const r = await cur.createDraftFromVersion(a, s(fd, "versionId"), s(fd, "summary")); if (!r.ok) return fail(r.error); return { redirect: `/admin/curricula/${s(fd, "id")}/v/${r.id}` }; });
}
export async function discardDraftAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("curriculum.write"); await cur.discardDraftVersion(a, s(fd, "versionId")); return { redirect: `/admin/curricula/${s(fd, "id")}` }; });
}
export async function archiveAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("curriculum.publish"); await cur.archiveCurriculum(a, s(fd, "id"), s(fd, "archive") !== "0"); return { message: s(fd, "archive") !== "0" ? "Archived." : "Restored." }; });
}
export async function duplicateAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("curriculum.write"); const r = await cur.duplicateCurriculum(a, s(fd, "id")); return { redirect: `/admin/curricula/${r.id}` }; });
}
export async function categoryAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("curriculum.write");
    const { getDb, schema } = await import("@/server/db"); const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const name = s(fd, "name"); if (name.length < 3) return fail("Enter a category name.");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (s(fd, "id")) await db.update(schema.curriculumCategories).set({ name, description: s(fd, "description"), sortOrder: n(fd, "sortOrder") }).where(eq(schema.curriculumCategories.id, s(fd, "id")));
    else await db.insert(schema.curriculumCategories).values({ name, slug, description: s(fd, "description"), sortOrder: n(fd, "sortOrder", 99) });
    const { audit } = await import("@/server/audit"); await audit(a, "curriculum.category_saved", { type: "category", id: slug });
    return { message: "Category saved." };
  });
}

/* ---------- questions and blueprints ---------- */
export async function saveQuestionAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("curriculum.write");
    const type = s(fd, "type") as QuestionType;
    const options = lines(fd, "options");
    let config: AnswerConfig;
    if (type === "mcq" || type === "scripture_ref") config = { type, correct: Math.max(0, n(fd, "correct") - 1) };
    else if (type === "multi") config = { type, correct: s(fd, "correctMulti").split(/[,\s]+/).map(Number).filter(Boolean).map((x) => x - 1) };
    else if (type === "tf") config = { type, correct: s(fd, "tfCorrect") === "true" };
    else if (type === "fill") config = { type, accepted: lines(fd, "accepted"), caseSensitive: b(fd, "caseSensitive") };
    else if (type === "short") config = { type, keywords: lines(fd, "keywords"), rubric: s(fd, "rubric") };
    else if (type === "matching") config = { type, pairs: lines(fd, "pairs").map((l) => l.split("=>").map((x) => x.trim()) as [string, string]) };
    else config = { type: type as "essay", rubric: s(fd, "rubric"), keyPoints: lines(fd, "keywords") };
    const q: QuestionInput = { id: s(fd, "id") || undefined, weekNumber: n(fd, "week") || null, type, text: s(fd, "text"), options: type === "tf" ? ["True", "False"] : options, config, explanation: s(fd, "explanation") || s(fd, "rubric"), difficulty: s(fd, "difficulty") as "easy", marks: n(fd, "marks", 1), scriptureRef: s(fd, "scriptureRef"), tags: s(fd, "tags").split(",").map((t) => t.trim()).filter(Boolean) };
    if ((type === "mcq" || type === "scripture_ref") && options.length < 2) return fail("Give at least two options, one per line.");
    const r = await cur.upsertQuestion(a, s(fd, "versionId"), q);
    if (!r.ok) return fail(r.error);
    return { message: "Question saved." };
  });
}
export async function deleteQuestionAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("curriculum.write"); await cur.deleteQuestion(a, s(fd, "versionId"), s(fd, "id")); });
}
export async function saveBlueprintAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("curriculum.write");
    const kind = s(fd, "kind") as "midtest" | "final";
    const mcq = n(fd, "mcq"), tf = n(fd, "tf"), short = n(fd, "short"), shortMarks = n(fd, "shortMarks", 5);
    const cover: [number, number][] = kind === "midtest" ? [[1, 12]] : [[1, 12], [14, 24]];
    await cur.updateBlueprint(a, s(fd, "versionId"), kind, {
      coversWeeks: cover, outcomes: lines(fd, "outcomes"), topics: lines(fd, "topics"),
      types: [{ type: "mcq", count: mcq, marksEach: 1 }, { type: "tf", count: tf, marksEach: 1 }, { type: "short", count: short, marksEach: shortMarks }],
      difficulty: { easy: n(fd, "easy", 30), medium: n(fd, "medium", 50), hard: n(fd, "hard", 20) }, durationMinutes: n(fd, "duration", 45), passPercent: n(fd, "pass", 50), totalMarks: mcq + tf + short * shortMarks,
    });
    return { message: "Blueprint saved." };
  });
}
export async function validateAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { await actor("curriculum.write"); const r = await cur.validateVersion(s(fd, "versionId"), { store: true }); return { message: r.ok ? "All completeness checks pass." : `${r.problems.length} problem(s): ${r.problems.slice(0, 3).join(" ")}` }; });
}

/* ---------- import ---------- */
export async function importPreviewAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("curriculum.write");
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) return fail("Choose a file to import.");
    const r = await importCurriculumText(a, { name: f.name, type: f.type, bytes: Buffer.from(await f.arrayBuffer()) });
    if (!r.ok) return fail(r.error);
    return { redirect: `/admin/import?preview=${r.importId}` };
  });
}
export async function importSaveAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("curriculum.write");
    const r = await saveImportedCurriculum(a, s(fd, "importId"), s(fd, "title"));
    if (!r.ok) return fail(r.error);
    return { redirect: `/admin/curricula/${r.id}` };
  });
}
export async function importQuestionsAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("curriculum.write");
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) return fail("Choose a CSV file.");
    const r = await importQuestionsCsv(a, s(fd, "versionId"), await f.text());
    return { message: `${r.imported} question(s) imported.${r.errors.length ? ` ${r.errors.length} row(s) skipped: ${r.errors.slice(0, 3).join(" ")}` : ""}` };
  });
}

/* ---------- churches, users ---------- */
export async function churchStatusAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("churches.manage"); const r = await admin.setChurchStatus(a, s(fd, "id"), s(fd, "status") as "active", s(fd, "reason")); if (!r.ok) return fail(r.error); return { message: "Church status updated." }; });
}
export async function mergeChurchAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("churches.manage"); const r = await admin.mergeUnverifiedChurch(a, s(fd, "from"), s(fd, "into")); if (!r.ok) return fail(r.error); return { message: `Merged. ${r.moved} member(s) moved and are waiting for the church administrator's approval.`, redirect: `/admin/churches/${s(fd, "into")}` }; });
}
export async function userStatusAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("users.manage"); await admin.setUserStatus(a, s(fd, "id"), s(fd, "status") as "active"); });
}
export async function userRoleAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("users.manage"); await admin.setPlatformRole(a, s(fd, "id"), s(fd, "role") as PlatformRole); return { message: "Role updated and the person's sessions were ended." }; });
}
export async function userResetAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("users.manage"); const t = await admin.adminResetPassword(a, s(fd, "id")); return { message: `Temporary password (shown once): ${t}` }; });
}
export async function userRevokeAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("users.manage"); await admin.revokeUserSessions(a, s(fd, "id")); return { message: "All sessions ended." }; });
}
export async function staffUserAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("users.manage"); const r = await admin.createStaffUser(a, { fullName: s(fd, "fullName"), email: s(fd, "email"), role: s(fd, "role") as PlatformRole }); if (!r.ok) return fail(r.error); return { message: `Account created. One-time temporary password: ${r.temporaryPassword}` }; });
}

/* ---------- plans and billing ---------- */
export async function savePlanAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("plans.manage");
    const currency = s(fd, "currency") || "NGN";
    const price = toMinor(s(fd, "price") || "0", currency);
    if (price === null) return fail("Enter the price as a number, for example 25000 or 25000.50.");
    const ent: Record<string, number | null> = {};
    for (const k of ["maxLearners", "maxClasses", "maxActiveSessions", "maxAdmins", "examsPerSession", "storageMb"]) ent[k] = s(fd, `e_${k}`) === "" ? null : n(fd, `e_${k}`);
    for (const k of ["downloads", "certificates", "advancedReports", "customBranding", "aiAssist"]) ent[k] = b(fd, `e_${k}`) ? 1 : 0;
    ent.curriculumTier = n(fd, "e_curriculumTier");
    const r = await billing.savePlan(a, s(fd, "id") || null, { name: s(fd, "name"), description: s(fd, "description"), status: s(fd, "status") as "draft", billingInterval: s(fd, "interval") as "yearly", priceMinor: price, currency, trialDays: n(fd, "trialDays"), highlights: lines(fd, "highlights"), entitlements: ent });
    if (!r.ok) return fail(r.error);
    return { message: "Plan saved." };
  });
}
export async function grantPlanAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("plans.manage"); await billing.grantPlan(a, s(fd, "orgId"), s(fd, "planId"), Math.max(1, n(fd, "days", 365)), s(fd, "source") === "scholarship" ? "scholarship" : "admin_grant"); return { message: "Plan granted." }; });
}

/* ---------- website and branding ---------- */
export async function savePageAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("site.edit");
    let sections: SiteSection[];
    try { sections = JSON.parse(s(fd, "sections")) as SiteSection[]; } catch { return fail("The sections could not be read. Check the structure and try again."); }
    await cms.savePageDraft(a, s(fd, "slug"), sections, { title: s(fd, "title"), seo: { title: s(fd, "seoTitle"), description: s(fd, "seoDescription") } });
    if (b(fd, "publish")) await cms.publishPage(a, s(fd, "slug"));
    return { message: b(fd, "publish") ? "Saved and published." : "Draft saved. Publish to make it live." };
  });
}
export async function publishPageAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("site.edit"); await cms.publishPage(a, s(fd, "slug")); return { message: "Published." }; });
}
export async function newPageAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("site.edit"); const r = await cms.createPage(a, s(fd, "slug"), s(fd, "title"), s(fd, "kind") === "legal" ? "legal" : "page"); if (!r.ok) return fail(r.error); return { redirect: `/admin/site/${r.slug}` }; });
}
export async function saveBrandAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("branding.edit");
    const r = await cms.saveBrand(a, { siteName: s(fd, "siteName"), shortName: s(fd, "shortName"), tagline: s(fd, "tagline"), ministry: s(fd, "ministry"), sponsor: s(fd, "sponsor"), primary: s(fd, "primary"), secondary: s(fd, "secondary"), accent: s(fd, "accent"), leaf: s(fd, "leaf"), ivory: s(fd, "ivory") });
    if (!r.ok) return fail(r.error);
    return { message: "Branding saved. The new colours apply everywhere." };
  });
}
export async function uploadLogoAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("branding.edit");
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) return fail("Choose an image file (SVG, PNG, JPEG or WebP).");
    await cms.uploadLogo(a, s(fd, "label"), { name: f.name, type: f.type, bytes: Buffer.from(await f.arrayBuffer()) });
    return { message: "Logo uploaded. Assign it to the places where it should appear." };
  });
}
export async function placementAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("branding.edit"); await cms.setPlacement(a, s(fd, "logoId"), s(fd, "placement"), s(fd, "on") === "1"); return { message: "Placement updated." }; });
}
export async function removeLogoAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("branding.edit"); await cms.removeLogo(a, s(fd, "id")); });
}
export async function saveSettingAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("settings.manage");
    const key = s(fd, "key");
    if (key === "features") {
      const cur = await getSetting("features");
      await cms.saveSettingGroup(a, "features", { ...cur, memberRegistrationOpen: b(fd, "memberRegistrationOpen"), churchRegistrationOpen: b(fd, "churchRegistrationOpen"), requireChurchAccessCode: b(fd, "requireChurchAccessCode"), requireChurchApproval: b(fd, "requireChurchApproval"), requireEmailVerification: b(fd, "requireEmailVerification"), allowTypedChurchNames: b(fd, "allowTypedChurchNames"), forumEnabled: b(fd, "forumEnabled"), forumRequiresVerifiedEmail: b(fd, "forumRequiresVerifiedEmail"), requireHumanReview: b(fd, "requireHumanReview"), maxFailedLogins: n(fd, "maxFailedLogins", 6), lockMinutes: n(fd, "lockMinutes", 15), graceDays: n(fd, "graceDays", 7), defaultCurrency: s(fd, "defaultCurrency") || "NGN" });
    } else if (key === "contact") await cms.saveSettingGroup(a, "contact", { email: s(fd, "email"), phone: s(fd, "phone"), whatsapp: s(fd, "whatsapp"), address: s(fd, "address"), hours: s(fd, "hours"), website: s(fd, "website") });
    else if (key === "social") await cms.saveSettingGroup(a, "social", { facebook: s(fd, "facebook"), youtube: s(fd, "youtube"), instagram: s(fd, "instagram"), x: s(fd, "x"), tiktok: s(fd, "tiktok"), whatsapp: s(fd, "whatsapp"), telegram: s(fd, "telegram") });
    else if (key === "nav") await cms.saveSettingGroup(a, "nav", lines(fd, "items").map((l) => { const [label, href] = l.split("|").map((x) => x.trim()); return { label, href }; }).filter((x) => x.label && x.href?.startsWith("/")));
    else if (key === "footer") { const f = await getSetting("footer"); await cms.saveSettingGroup(a, "footer", { ...f, about: s(fd, "about"), copyright: s(fd, "copyright"), links: lines(fd, "links").map((l) => { const [label, href] = l.split("|").map((x) => x.trim()); return { label, href }; }).filter((x) => x.label && x.href?.startsWith("/")) }); }
    else if (key === "announcement") await cms.saveSettingGroup(a, "announcement", { enabled: b(fd, "enabled"), text: s(fd, "text"), href: s(fd, "href") });
    else if (key === "maintenance") await cms.saveSettingGroup(a, "maintenance", { suspended: b(fd, "suspended"), message: s(fd, "message") });
    else if (key === "assessment") { const cur = await getSetting("assessment"); await cms.saveSettingGroup(a, "assessment", { ...cur, defaultPassPercent: n(fd, "defaultPassPercent", 50), gradeScale: lines(fd, "gradeScale").map((l) => { const [min, grade, label] = l.split(/[,|]/).map((x) => x.trim()); return { min: Number(min), grade, label }; }).filter((g) => Number.isFinite(g.min) && g.grade) }); }
    else if (key === "certificate") await cms.saveSettingGroup(a, "certificate", { title: s(fd, "title"), signatoryName: s(fd, "signatoryName"), signatoryTitle: s(fd, "signatoryTitle"), footerNote: s(fd, "footerNote") });
    else if (key === "doctrine") await cms.saveSettingGroup(a, "doctrine", { position: s(fd, "position") });
    else return fail("Unknown setting group.");
    return { message: "Saved." };
  });
}

/* ---------- operations ---------- */
export async function runJobsAction(_: FormState | null): Promise<FormState> {
  return run(async () => { await actor("jobs.view"); await admin.enqueueJob("maintenance", {}, { idempotencyKey: `manual:${Date.now()}` }); const r = await admin.runDueJobs(5); return { message: `Ran ${r.ran} job(s), ${r.failed} failed.` }; });
}
export async function retryJobAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => { const { a } = await actor("settings.manage"); await admin.retryJob(a, s(fd, "id")); });
}
export async function goHome() { redirect("/admin"); }

/* ---------- church access codes ---------- */
export async function generateAccessCodesAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { a } = await actor("plans.manage");
    const days = s(fd, "durationDays");
    const by = s(fd, "redeemBy");
    const r = await accessCodes.generateAccessCodes(a, {
      planId: s(fd, "planId"), quantity: n(fd, "quantity") || 1, durationDays: days === "" ? null : Number(days), maxUses: n(fd, "maxUses") || 1,
      redeemBy: by ? new Date(by + "T23:59:59") : null, note: s(fd, "note"),
    });
    if (!r.ok) return fail(r.error);
    return { redirect: "/admin/access-codes?new=" + encodeURIComponent(r.codes.join(",")) };
  });
}
export async function revokeAccessCodeAction(fd: FormData) {
  const { a } = await actor("plans.manage");
  await accessCodes.revokeAccessCode(a, s(fd, "id"));
  redirect("/admin/access-codes");
}
