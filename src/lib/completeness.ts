import { parseRange } from "@/lib/bible";
import type { LessonContent } from "@/lib/lesson-types";

/**
 * CONTENT COMPLETENESS RULES
 * A lesson only counts as complete when every teaching field holds real material above a minimum size, every Scripture reference parses,
 * nothing is placeholder text, and no paragraph is copy-pasted from another lesson in the same curriculum.
 */
export interface LessonLike {
  weekNumber: number; title: string; summary: string; theme: string; unitKind?: string;
  primaryScripture: string[]; additionalScripture: string[]; memoryVerse: string; objectives: string[];
  keyTerms: { term: string; meaning: string }[]; durationMinutes: number; content: LessonContent;
}

export const MIN = {
  title: 4, summary: 120, theme: 10, objective: 25, objectives: 3, term: 20, terms: 3,
  introduction: 250, context: 250, observations: 200, pointBody: 280, points: 3, pointHeading: 6,
  discussion: 4, discussionQ: 20, guidance: 80, application: 200, activity: 120, takeHome: 80, prayer: 60, teacherGuidance: 150, assessmentNote: 40,
  totalWords: 450,
};

const PLACEHOLDER = /\b(lorem ipsum|todo|tbd|placeholder|coming soon|to be added|insert here|xxx+)\b/i;
export const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Every free-text paragraph of a lesson, for duplicate and word counting. */
export function lessonTexts(l: LessonLike): string[] {
  const c = l.content;
  return [l.summary, c.introduction, c.context, c.observations, c.application, c.activity, c.takeHome, c.prayer, c.teacherGuidance,
    ...c.teachingPoints.map((p) => p.body), ...c.discussion.map((d) => d.guidance)].filter(Boolean);
}
export const lessonWords = (l: LessonLike) => lessonTexts(l).reduce((n, t) => n + words(t), 0);

export function validateLesson(l: LessonLike): string[] {
  const p: string[] = [];
  const c = l.content;
  if (!c) return ["Lesson has no content."];
  const need = (ok: boolean, msg: string) => { if (!ok) p.push(msg); };
  need((l.title ?? "").trim().length >= MIN.title, "Title is missing.");
  need((l.summary ?? "").length >= MIN.summary, `Summary is too short (needs ${MIN.summary}+ characters).`);
  need((l.theme ?? "").length >= MIN.theme, "Central theme is missing.");
  need(l.primaryScripture.length >= 1, "No primary Scripture reference.");
  for (const r of [...l.primaryScripture, ...l.additionalScripture]) need(!!parseRange(r), `Scripture reference "${r}" is not valid.`);
  need(!!parseRange(l.memoryVerse), "Memory verse reference is missing or invalid.");
  need(l.objectives.length >= MIN.objectives && l.objectives.every((o) => o.length >= MIN.objective), `Needs ${MIN.objectives}+ learning objectives of ${MIN.objective}+ characters.`);
  need(l.keyTerms.length >= MIN.terms && l.keyTerms.every((t) => t.term && t.meaning.length >= MIN.term), `Needs ${MIN.terms}+ key terms with definitions.`);
  need((c.introduction ?? "").length >= MIN.introduction, "Introduction is too short.");
  need((c.context ?? "").length >= MIN.context, "Biblical and historical context is too short.");
  need((c.observations ?? "").length >= MIN.observations, "Exegetical observations are too short.");
  need(c.teachingPoints?.length >= MIN.points && c.teachingPoints.every((t) => t.heading.length >= MIN.pointHeading && t.body.length >= MIN.pointBody), `Needs ${MIN.points}+ teaching points of ${MIN.pointBody}+ characters each.`);
  need(c.discussion?.length >= MIN.discussion && c.discussion.every((d) => d.q.length >= MIN.discussionQ && d.guidance.length >= MIN.guidance), `Needs ${MIN.discussion}+ discussion questions, each with facilitator guidance.`);
  need((c.application ?? "").length >= MIN.application, "Practical application is too short.");
  need((c.activity ?? "").length >= MIN.activity, "Group activity is too short.");
  need((c.takeHome ?? "").length >= MIN.takeHome, "Take-home assignment is too short.");
  need((c.prayer ?? "").length >= MIN.prayer, "Prayer or reflection points are missing.");
  need((c.teacherGuidance ?? "").length >= MIN.teacherGuidance, "Teacher guidance is too short.");
  need((c.assessmentNote ?? "").length >= MIN.assessmentNote, "Weekly assessment blueprint note is missing.");
  need(!!c.supplementary?.length, "No supplementary materials listed.");
  need(l.durationMinutes >= 20 && l.durationMinutes <= 120, "Estimated duration must be 20 to 120 minutes.");
  need(lessonWords(l) >= MIN.totalWords, `Teaching material is only ${lessonWords(l)} words (needs ${MIN.totalWords}+).`);
  const all = [l.title, ...lessonTexts(l), ...c.teachingPoints.map((t) => t.heading), ...c.discussion.map((d) => d.q)].join(" \n ");
  need(!PLACEHOLDER.test(all), "Contains placeholder text.");
  return p;
}

/** Paragraphs repeated verbatim across lessons of the same curriculum. Returns the weeks involved. */
export function findDuplicateText(lessons: LessonLike[]): { weeks: number[]; sample: string }[] {
  const seen = new Map<string, Set<number>>();
  for (const l of lessons) {
    for (const t of [...lessonTexts(l), ...l.content.discussion.map((d) => d.q)]) {
      if (t.length < 90) continue;
      const k = norm(t);
      (seen.get(k) ?? seen.set(k, new Set()).get(k)!).add(l.weekNumber);
    }
  }
  return [...seen.entries()].filter(([, w]) => w.size > 1).map(([k, w]) => ({ weeks: [...w].sort((a, b) => a - b), sample: k.slice(0, 90) }));
}

export interface QuestionLite { weekNumber: number | null; type: string; hasKey: boolean; hasExplanation: boolean }
export interface BlueprintLite { kind: string; totalMarks: number; durationMinutes: number; passPercent: number; types: { count: number }[] }

export interface CurriculumReport {
  ok: boolean; lessonsPresent: number; lessonsComplete: number; words: number; questions: number;
  weeks: { week: number; ok: boolean; words: number; problems: string[] }[];
  problems: string[];
}

/** Whole-curriculum check used by the publish gate and the completeness report. */
export function validateCurriculum(lessons: LessonLike[], questions: QuestionLite[], blueprints: BlueprintLite[]): CurriculumReport {
  const problems: string[] = [];
  const byWeek = new Map(lessons.map((l) => [l.weekNumber, l]));
  const weeks: CurriculumReport["weeks"] = [];
  for (let w = 1; w <= 26; w++) {
    const l = byWeek.get(w);
    if (!l) { weeks.push({ week: w, ok: false, words: 0, problems: ["Lesson is missing."] }); continue; }
    const pr = validateLesson(l);
    weeks.push({ week: w, ok: pr.length === 0, words: lessonWords(l), problems: pr });
  }
  const extra = lessons.filter((l) => l.weekNumber < 1 || l.weekNumber > 26);
  if (extra.length) problems.push("Lessons outside weeks 1-26 exist.");
  const kinds: Record<number, string> = { 13: "midtest", 25: "final", 26: "revision" };
  for (const [w, k] of Object.entries(kinds)) { const l = byWeek.get(Number(w)); if (l && l.unitKind && l.unitKind !== k) problems.push(`Week ${w} must be the ${k} unit.`); }
  const dups = findDuplicateText(lessons);
  if (dups.length) problems.push(`${dups.length} paragraph(s) are repeated across lessons (weeks ${[...new Set(dups.flatMap((d) => d.weeks))].join(", ")}).`);
  for (const k of ["midtest", "final"]) {
    const b = blueprints.find((x) => x.kind === k);
    if (!b) { problems.push(`Missing ${k === "midtest" ? "mid-session test" : "final examination"} blueprint.`); continue; }
    if (b.totalMarks <= 0 || b.durationMinutes <= 0 || b.passPercent <= 0 || !b.types.length) problems.push(`The ${k} blueprint is incomplete.`);
  }
  const firstHalf = questions.filter((q) => q.weekNumber && q.weekNumber <= 12).length;
  const secondHalf = questions.filter((q) => q.weekNumber && q.weekNumber >= 14 && q.weekNumber <= 24).length;
  if (firstHalf < 24) problems.push(`Question bank has only ${firstHalf} questions for weeks 1-12 (needs 24+ to build a mid-session test).`);
  if (secondHalf < 22) problems.push(`Question bank has only ${secondHalf} questions for weeks 14-24 (needs 22+ so the final covers both halves).`);
  if (questions.some((q) => !q.hasKey)) problems.push("Some questions have no answer key.");
  if (questions.some((q) => !q.hasExplanation)) problems.push("Some questions have no explanation or rubric.");
  const lessonsComplete = weeks.filter((w) => w.ok).length;
  if (lessonsComplete < 26) problems.push(`${26 - lessonsComplete} lesson unit(s) are incomplete.`);
  return { ok: problems.length === 0, lessonsPresent: lessons.length, lessonsComplete, words: weeks.reduce((n, w) => n + w.words, 0), questions: questions.length, weeks, problems };
}
