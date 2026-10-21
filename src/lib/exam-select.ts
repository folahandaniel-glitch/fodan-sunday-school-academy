import type { AssessmentBlueprintConfig, QuestionType } from "@/lib/lesson-types";

export interface PoolQuestion { id: string; week: number | null; type: QuestionType; difficulty: "easy" | "medium" | "hard"; marks: number }
export interface Selection { chosen: { id: string; marks: number }[]; warnings: string[]; byWeek: Record<number, number>; byDifficulty: Record<string, number>; totalMarks: number }

export const weeksCovered = (cover: [number, number][]) => new Set(cover.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)));

/**
 * Draws questions to match a blueprint: the requested count per question type, spread evenly across the covered weeks (so the final
 * examination draws from BOTH halves of the curriculum), steering towards the blueprint's difficulty mix. Deterministic for a given rng.
 */
export function selectQuestions(pool: PoolQuestion[], bp: AssessmentBlueprintConfig, rng: () => number): Selection {
  const weeks = weeksCovered(bp.coversWeeks);
  const eligible = pool.filter((q) => q.week !== null && weeks.has(q.week));
  const warnings: string[] = [];
  const totalCount = bp.types.reduce((n, t) => n + t.count, 0);
  const need = { easy: Math.round((bp.difficulty.easy / 100) * totalCount), medium: Math.round((bp.difficulty.medium / 100) * totalCount), hard: 0 };
  need.hard = Math.max(0, totalCount - need.easy - need.medium);
  const chosen: Selection["chosen"] = [];
  const used = new Set<string>();
  const weekUse: Record<number, number> = {};
  for (const t of bp.types) {
    const cands = eligible.filter((q) => q.type === t.type);
    if (cands.length < t.count) warnings.push(`Only ${cands.length} approved ${t.type} question(s) are available for the covered weeks; the blueprint asks for ${t.count}.`);
    for (let k = 0; k < t.count; k++) {
      const left = cands.filter((q) => !used.has(q.id));
      if (!left.length) break;
      const minUse = Math.min(...left.map((q) => weekUse[q.week!] ?? 0));
      let next = left.filter((q) => (weekUse[q.week!] ?? 0) === minUse);
      const levels: ("easy" | "medium" | "hard")[] = ["easy", "medium", "hard"];
      const pref = levels.sort((a, b) => need[b] - need[a]).find((d) => next.some((q) => q.difficulty === d));
      if (pref) next = next.filter((q) => q.difficulty === pref);
      const q = next[Math.floor(rng() * next.length)];
      used.add(q.id); chosen.push({ id: q.id, marks: t.marksEach }); weekUse[q.week!] = (weekUse[q.week!] ?? 0) + 1; need[q.difficulty] = Math.max(0, need[q.difficulty] - 1);
    }
  }
  const byDifficulty: Record<string, number> = {};
  for (const c of chosen) { const q = pool.find((p) => p.id === c.id)!; byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] ?? 0) + 1; }
  return { chosen, warnings, byWeek: weekUse, byDifficulty, totalMarks: chosen.reduce((n, c) => n + c.marks, 0) };
}

export type ExamProblem = string;
export function validateExamConfig(e: { title: string; durationSeconds: number; passPercent: number; attemptLimit: number; opensAt: Date | null; closesAt: Date | null; totalMarks: number }, questionCount: number, questionMarks: number): ExamProblem[] {
  const p: string[] = [];
  if (e.title.trim().length < 3) p.push("Enter an examination title.");
  if (questionCount < 1) p.push("Add at least one question.");
  if (e.durationSeconds < 60 || e.durationSeconds > 6 * 3600) p.push("Duration must be between 1 minute and 6 hours.");
  if (e.passPercent < 1 || e.passPercent > 100) p.push("Pass mark must be between 1% and 100%.");
  if (e.attemptLimit < 1 || e.attemptLimit > 10) p.push("Attempts must be between 1 and 10.");
  if (e.opensAt && e.closesAt && e.closesAt <= e.opensAt) p.push("The closing time must be after the opening time.");
  if (e.closesAt && e.opensAt && (e.closesAt.getTime() - e.opensAt.getTime()) / 1000 < Math.min(e.durationSeconds, 300)) p.push("The availability window is shorter than the examination duration.");
  if (Math.abs(e.totalMarks - questionMarks) > 0.001) p.push("Total marks do not match the questions' marks.");
  return p;
}
