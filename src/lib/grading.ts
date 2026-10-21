import { parseRange } from "@/lib/bible";
import type { AnswerConfig } from "@/lib/lesson-types";

export interface GradeScaleEntry { min: number; grade: string; label?: string }

/** Rounds to 2 decimals using a single, consistent rule (half away from zero). */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const percent = (score: number, total: number) => (total > 0 ? round2((score / total) * 100) : 0);

export function gradeFor(pct: number, scale: GradeScaleEntry[]): string {
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  return (sorted.find((g) => pct >= g.min) ?? sorted[sorted.length - 1])?.grade ?? "-";
}

export const normText = (s: string, caseSensitive = false) => {
  let t = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().replace(/[.,;:!?]+$/g, "");
  if (!caseSensitive) t = t.toLowerCase();
  return t;
};

export interface GradeOutcome {
  /** Marks awarded automatically; null when a human must decide. */
  awarded: number | null;
  status: "auto" | "pending";
  /** Suggested marks for subjective answers (keyword match); never final. */
  suggested?: number;
}

/** Objective answers resolve to the option INDEX the learner picked (translated from shuffled option ids by the caller). */
export function gradeAnswer(cfg: AnswerConfig, answer: unknown, marks: number): GradeOutcome {
  const blank = answer === null || answer === undefined || answer === "" || (Array.isArray(answer) && answer.length === 0);
  if (blank) return { awarded: 0, status: "auto" };
  switch (cfg.type) {
    case "mcq":
      return { awarded: Number(answer) === cfg.correct ? marks : 0, status: "auto" };
    case "scripture_ref": {
      // The learner may type a reference; picking an option index is also supported.
      if (typeof answer === "number") return { awarded: answer === cfg.correct ? marks : 0, status: "auto" };
      return { awarded: null, status: "pending" };
    }
    case "multi": {
      const given = new Set((Array.isArray(answer) ? answer : []).map(Number));
      const right = new Set(cfg.correct);
      let wrong = 0, hit = 0;
      for (const g of given) right.has(g) ? hit++ : wrong++;
      // Each correct pick earns a share; each wrong pick removes one share; never below zero.
      const share = marks / right.size;
      return { awarded: Math.max(0, round2(share * hit - share * wrong)), status: "auto" };
    }
    case "tf": {
      const v = answer === true || answer === "true" ? true : answer === false || answer === "false" ? false : null;
      return { awarded: v !== null && v === cfg.correct ? marks : 0, status: "auto" };
    }
    case "fill": {
      const a = normText(String(answer), cfg.caseSensitive);
      const ok = cfg.accepted.some((x) => normText(x, cfg.caseSensitive) === a);
      // A miss is never final on its own: a teacher confirms near-misses (spelling, synonyms).
      return ok ? { awarded: marks, status: "auto" } : { awarded: null, status: "pending" };
    }
    case "short": {
      const text = normText(String(answer));
      const hits = cfg.keywords.filter((k) => text.includes(normText(k))).length;
      const need = Math.max(1, cfg.minKeywords ?? Math.ceil(cfg.keywords.length / 2));
      const suggested = round2(marks * Math.min(1, hits / need));
      return { awarded: null, status: "pending", suggested };
    }
    case "matching": {
      const given = (answer ?? {}) as Record<string, string>;
      const hit = cfg.pairs.filter(([l, r]) => normText(given[l] ?? "") === normText(r)).length;
      return { awarded: round2((marks * hit) / cfg.pairs.length), status: "auto" };
    }
    case "essay":
    case "scenario":
      return { awarded: null, status: "pending" };
  }
}

/** True when a typed Scripture reference equals any accepted reference (parsed, so "Jn 3:16" equals "John 3:16"). */
export function sameReference(a: string, accepted: string[]) {
  const ra = parseRange(a);
  if (!ra) return false;
  return accepted.some((x) => { const rb = parseRange(x); return !!rb && rb.book === ra.book && rb.c1 === ra.c1 && rb.c2 === ra.c2 && rb.v1 === ra.v1 && rb.v2 === ra.v2; });
}
