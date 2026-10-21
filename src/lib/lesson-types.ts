/** Structured lesson content stored in curriculum_lessons.content. Every field is validated by lib/completeness.ts. */
export interface DiscussionItem { q: string; guidance: string }
export interface TeachingPoint { heading: string; body: string }
export interface KeyTerm { term: string; meaning: string }
export interface ExtraSection { heading: string; body: string }

export interface LessonContent {
  introduction: string;
  context: string;            // biblical and historical context
  observations: string;       // exegetical observations
  teachingPoints: TeachingPoint[];
  discussion: DiscussionItem[];
  application: string;
  activity: string;           // group activity or reflection exercise
  takeHome: string;
  prayer: string;
  teacherGuidance: string;    // visible to teachers only
  supplementary: string[];    // recommended supplementary materials
  assessmentNote: string;     // weekly assessment blueprint (what the weekly check covers)
  /** Derived revision map for review weeks (generated from the curriculum's own lessons). */
  revisionMap?: { week: number; title: string; keyIdea: string; memoryVerse: string }[];
  extra?: ExtraSection[];
}

export type QuestionType = "mcq" | "multi" | "tf" | "fill" | "short" | "scripture_ref" | "matching" | "essay" | "scenario";
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple choice (single answer)", multi: "Multiple select", tf: "True or false", fill: "Fill in the blank", short: "Short answer",
  scripture_ref: "Scripture reference", matching: "Matching", essay: "Essay", scenario: "Scenario application",
};
export const OBJECTIVE_TYPES: QuestionType[] = ["mcq", "multi", "tf", "fill", "scripture_ref", "matching"];

/** Answer configuration (stored ONLY in question_answer_keys). */
export type AnswerConfig =
  | { type: "mcq" | "scripture_ref"; correct: number }                       // index into options
  | { type: "multi"; correct: number[] }
  | { type: "tf"; correct: boolean }
  | { type: "fill"; accepted: string[]; caseSensitive?: boolean }
  | { type: "short"; keywords: string[]; minKeywords?: number; autoGrade?: boolean; rubric: string }
  | { type: "matching"; pairs: [string, string][] }
  | { type: "essay" | "scenario"; rubric: string; keyPoints: string[] };

export interface AssessmentBlueprintConfig {
  coversWeeks: [number, number][];
  outcomes: string[];
  topics: string[];
  types: { type: QuestionType; count: number; marksEach: number }[];
  difficulty: { easy: number; medium: number; hard: number };
  durationMinutes: number;
  passPercent: number;
  totalMarks: number;
}
