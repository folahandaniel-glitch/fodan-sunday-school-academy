import { sha256 } from "./crypto";

/** JSON with object keys sorted, so the same data always gives the same text however the database or JavaScript ordered it. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

/** Fingerprint of the lesson text alone; the seeder uses it to tell whether authored content really changed. */
export function lessonsHashOf(lessons: { weekNumber: number; title: string; summary: string; content: unknown; objectives: unknown }[]) {
  return sha256(stableStringify(lessons.map((l) => [l.weekNumber, l.title, l.summary, l.content, l.objectives])));
}
