import type { AnswerConfig, AssessmentBlueprintConfig, LessonContent } from "@/lib/lesson-types";
import type { LessonLike } from "@/lib/completeness";
import type { CatalogEntry } from "./catalog";
import type { LessonSeed } from "./types";

export interface BuiltQuestion {
  week: number; type: "mcq" | "tf" | "short"; text: string; options: string[]; config: AnswerConfig; explanation: string;
  difficulty: "easy" | "medium" | "hard"; marks: number; scripture?: string; tags: string[];
}
export interface BuiltLesson extends LessonLike { unitKind: "teaching" | "midtest" | "final" | "revision"; questions: BuiltQuestion[] }

const kindOf = (w: number) => (w === 13 ? "midtest" : w === 25 ? "final" : w === 26 ? "revision" : "teaching") as BuiltLesson["unitKind"];
const firstSentence = (s: string) => (s.match(/^.+?[.!?](\s|$)/)?.[0] ?? s).trim();

export function buildLessons(seeds: LessonSeed[]): BuiltLesson[] {
  const sorted = [...seeds].sort((a, b) => a.w - b.w);
  return sorted.map((s) => {
    const content: LessonContent = {
      introduction: s.intro, context: s.context, observations: s.observe,
      teachingPoints: s.points.map(([heading, body]) => ({ heading, body })),
      discussion: s.discuss.map(([q, guidance]) => ({ q, guidance })),
      application: s.apply, activity: s.activity, takeHome: s.takeHome, prayer: s.prayer, teacherGuidance: s.teacher, assessmentNote: s.assess,
      supplementary: [
        ...(s.more.length ? [`Read the supporting passages in full and in context: ${s.more.join("; ")}.`] : []),
        "Print the Student Notes and the Teacher Guide for this week from the lesson page (Print or Save as PDF).",
        "Ask the class to bring their own Bible so everyone can find and read the passages aloud.",
      ],
    };
    if (s.w === 13 || s.w === 25 || s.w === 26) {
      const upTo = s.w === 13 ? 12 : 24;
      content.revisionMap = sorted.filter((x) => x.w <= upTo && x.w !== 13).map((x) => ({ week: x.w, title: x.title, keyIdea: firstSentence(x.summary), memoryVerse: x.memory }));
    }
    const questions: BuiltQuestion[] = [];
    const mcq = (m: LessonSeed["mcq1"], difficulty: "easy" | "medium" | "hard") => questions.push({ week: s.w, type: "mcq", text: m[0], options: [...m[1]], config: { type: "mcq", correct: m[2] }, explanation: m[3], difficulty, marks: 1, scripture: s.scripture[0], tags: [s.theme] });
    mcq(s.mcq1, "easy"); mcq(s.mcq2, "medium");
    questions.push({ week: s.w, type: "tf", text: s.tf[0], options: ["True", "False"], config: { type: "tf", correct: s.tf[1] }, explanation: s.tf[2], difficulty: "easy", marks: 1, scripture: s.scripture[0], tags: [s.theme] });
    questions.push({ week: s.w, type: "short", text: s.sa[0], options: [], config: { type: "short", keywords: s.sa[1], rubric: s.sa[2], minKeywords: Math.max(1, Math.ceil(s.sa[1].length / 2)) }, explanation: s.sa[2], difficulty: "hard", marks: 5, scripture: s.scripture[0], tags: [s.theme] });
    return {
      weekNumber: s.w, title: s.title, summary: s.summary, theme: s.theme, unitKind: kindOf(s.w), primaryScripture: s.scripture, additionalScripture: s.more,
      memoryVerse: s.memory, objectives: s.objectives, keyTerms: s.terms.map(([term, meaning]) => ({ term, meaning })), durationMinutes: s.minutes ?? 45, content, questions,
    };
  });
}

export function buildBlueprints(entry: CatalogEntry, lessons: BuiltLesson[]): { kind: "midtest" | "final"; config: AssessmentBlueprintConfig }[] {
  const topics = (from: number, to: number) => lessons.filter((l) => l.weekNumber >= from && l.weekNumber <= to && l.weekNumber !== 13 && l.weekNumber !== 25).map((l) => `Week ${l.weekNumber}: ${l.theme}`);
  return [
    {
      kind: "midtest",
      config: {
        coversWeeks: [[1, 12]], outcomes: entry.outcomes.slice(0, 3), topics: topics(1, 12),
        types: [{ type: "mcq", count: 18, marksEach: 1 }, { type: "tf", count: 6, marksEach: 1 }, { type: "short", count: 3, marksEach: 5 }],
        difficulty: { easy: 40, medium: 40, hard: 20 }, durationMinutes: 45, passPercent: 50, totalMarks: 18 + 6 + 15,
      },
    },
    {
      kind: "final",
      config: {
        coversWeeks: [[1, 12], [14, 24]], outcomes: entry.outcomes, topics: topics(1, 24),
        types: [{ type: "mcq", count: 30, marksEach: 1 }, { type: "tf", count: 10, marksEach: 1 }, { type: "short", count: 4, marksEach: 5 }],
        difficulty: { easy: 30, medium: 45, hard: 25 }, durationMinutes: 90, passPercent: 50, totalMarks: 30 + 10 + 20,
      },
    },
  ];
}
