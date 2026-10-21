import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { audit, type Actor } from "../audit";
import { sha256 } from "../crypto";
import { parseRange } from "@/lib/bible";
import { getPassages } from "../bible-data";
import { AccessError, NotFoundError } from "../org";
import { createCurriculum, updateLesson, upsertQuestion, type QuestionInput } from "./curriculum";
import type { AnswerConfig } from "@/lib/lesson-types";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = [".docx", ".txt", ".md", ".pdf"];

export interface ImportedWeek { week: number; title: string; text: string; scripture: string[]; flags: string[] }
export interface ImportPreview { title: string; weeks: ImportedWeek[]; missingWeeks: number[]; duplicates: number[]; characters: number; format: string }

/** Finds references like "John 3:16-18" in running text and keeps only those that resolve to real Bible text. */
export function findScripture(text: string): string[] {
  const re = /\b((?:[1-3]\s?)?[A-Z][a-z]+(?:\s+of\s+[A-Z][a-z]+)?)\s+(\d{1,3})(?::(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?)?/g;
  const found = new Set<string>();
  for (const m of text.matchAll(re)) {
    const ref = m[0].replace(/\s+/g, " ").trim();
    if (parseRange(ref) && getPassages(ref, "bsb").length) found.add(ref);
  }
  return [...found].slice(0, 12);
}

export function parseCurriculumText(text: string, fallbackTitle: string): ImportPreview {
  const clean = text.replace(/\r\n/g, "\n");
  const lines = clean.split("\n");
  const head = /^\s*(?:#+\s*)?(?:week|lesson|unit)\s*(\d{1,2})\b\s*[:.\-–—)]?\s*(.*)$/i;
  const idx: { line: number; week: number; title: string }[] = [];
  lines.forEach((l, i) => { const m = head.exec(l); if (m && Number(m[1]) >= 1 && Number(m[1]) <= 26 && l.trim().length < 140) idx.push({ line: i, week: Number(m[1]), title: m[2].trim() }); });
  const weeks: ImportedWeek[] = idx.map((h, k) => {
    const body = lines.slice(h.line + 1, k + 1 < idx.length ? idx[k + 1].line : lines.length).join("\n").trim();
    const flags: string[] = [];
    if (body.length < 400) flags.push("Very little text under this heading: it is probably not a complete lesson.");
    if (!h.title) flags.push("No title after the heading.");
    return { week: h.week, title: h.title || `Week ${h.week}`, text: body, scripture: findScripture(h.title + "\n" + body), flags };
  });
  const seen = new Map<number, number>();
  for (const w of weeks) seen.set(w.week, (seen.get(w.week) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, c]) => c > 1).map(([w]) => w);
  const missingWeeks = Array.from({ length: 26 }, (_, i) => i + 1).filter((w) => !seen.has(w));
  const first = lines.find((l) => l.trim().length > 3)?.replace(/^#+\s*/, "").trim().slice(0, 120);
  return { title: first && !head.test(first) ? first : fallbackTitle, weeks, missingWeeks, duplicates, characters: clean.length, format: "" };
}

async function extractText(file: { name: string; bytes: Buffer }) {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (ext === ".docx") { const mammoth = await import("mammoth"); return (await mammoth.extractRawText({ buffer: file.bytes })).value; }
  if (ext === ".txt" || ext === ".md") return file.bytes.toString("utf8");
  if (ext === ".pdf") {
    try {
      const { extractText: pdfText } = await import("unpdf");
      const r = await pdfText(new Uint8Array(file.bytes), { mergePages: true });
      const t = Array.isArray(r.text) ? r.text.join("\n") : r.text;
      if (t.trim().length < 200) throw new AccessError("This PDF contains almost no selectable text. It may be a scanned document, which needs OCR. Please convert it to text or DOCX first.");
      return t;
    } catch (e) { if (e instanceof AccessError) throw e; throw new AccessError("The PDF could not be read. Please try a DOCX or text version."); }
  }
  throw new AccessError("Unsupported file type.");
}

export async function importCurriculumText(actor: Actor, file: { name: string; type: string; bytes: Buffer }) {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!ALLOWED.includes(ext)) return { ok: false as const, error: "Upload a .docx, .pdf, .txt or .md file." };
  if (file.bytes.length === 0 || file.bytes.length > MAX_BYTES) return { ok: false as const, error: "The file must be between 1 byte and 8 MB." };
  if (ext === ".docx" && !(file.bytes[0] === 0x50 && file.bytes[1] === 0x4b)) return { ok: false as const, error: "That is not a valid Word document." };
  if (ext === ".pdf" && file.bytes.subarray(0, 5).toString() !== "%PDF-") return { ok: false as const, error: "That is not a valid PDF." };
  let text: string;
  try { text = await extractText(file); } catch (e) { if (e instanceof AccessError) return { ok: false as const, error: e.message }; return { ok: false as const, error: "The file could not be read. It may be damaged." }; }
  const preview = parseCurriculumText(text, file.name.replace(/\.[^.]+$/, ""));
  preview.format = ext.slice(1);
  const warnings: string[] = [];
  if (preview.weeks.length === 0) warnings.push("No 'Week N' or 'Lesson N' headings were found. Add headings such as 'Week 1: Title' and try again.");
  if (preview.missingWeeks.length) warnings.push(`Weeks not found: ${preview.missingWeeks.join(", ")}.`);
  if (preview.duplicates.length) warnings.push(`These weeks appear more than once: ${preview.duplicates.join(", ")}.`);
  const db = await getDb();
  const [row] = await db.insert(schema.contentImports).values({ uploadedBy: actor.id, filename: file.name.slice(0, 200), mime: file.type || "application/octet-stream", size: file.bytes.length, checksum: sha256(file.bytes), extracted: preview as unknown as Record<string, unknown>, warnings }).returning({ id: schema.contentImports.id });
  await audit(actor, "import.previewed", { type: "import", id: row.id }, { file: file.name, weeks: preview.weeks.length });
  return { ok: true as const, importId: row.id };
}

export async function getImport(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new NotFoundError();
  const db = await getDb();
  const [r] = await db.select().from(schema.contentImports).where(eq(schema.contentImports.id, id));
  if (!r) throw new NotFoundError("Import not found.");
  return { ...r, preview: r.extracted as unknown as ImportPreview };
}

/** Saves an import as a DRAFT curriculum. Imported text is filed under the lesson introduction for the author to restructure; it can never be published until it passes the completeness rules and review. */
export async function saveImportedCurriculum(actor: Actor, importId: string, title: string) {
  const imp = await getImport(importId);
  if (imp.status === "saved_as_draft") return { ok: false as const, error: "This import was already saved as a draft." };
  const t = title.trim() || imp.preview.title;
  const c = await createCurriculum(actor, { title: t });
  if (!c.ok) return c;
  for (const w of imp.preview.weeks) {
    if (w.week < 1 || w.week > 26) continue;
    await updateLesson(actor, c.versionId, w.week, { title: w.title.slice(0, 160), primaryScripture: w.scripture.slice(0, 4), content: { introduction: w.text.slice(0, 6000) } });
  }
  const db = await getDb();
  await db.update(schema.curriculumVersions).set({ provenance: `imported:${imp.preview.format}`, changeSummary: `Imported from ${imp.filename}. Needs restructuring and review.` }).where(eq(schema.curriculumVersions.id, c.versionId));
  await db.update(schema.contentImports).set({ status: "saved_as_draft", curriculumId: c.id }).where(eq(schema.contentImports.id, importId));
  await audit(actor, "import.saved_as_draft", { type: "curriculum", id: c.id }, { importId });
  return { ok: true as const, id: c.id };
}

/* ---------- CSV question import ---------- */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((c) => c.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export const QUESTION_CSV_TEMPLATE = "week,type,question,option1,option2,option3,option4,correct,explanation,difficulty,marks,scripture,keywords\n1,mcq,\"Which book begins the Bible?\",Genesis,Exodus,Psalms,Matthew,1,\"Genesis is the first book of the Bible.\",easy,1,Genesis 1:1,\n1,tf,\"The Bible has sixty-six books.\",,,,,true,\"The Protestant Bible has 66 books.\",easy,1,,\n2,short,\"Explain what inspiration means.\",,,,,,\"Look for: God guided the writers by the Holy Spirit.\",hard,5,2 Timothy 3:16,inspired|holy spirit|god\n";

export async function importQuestionsCsv(actor: Actor, versionId: string, csv: string) {
  if (csv.length > 2_000_000) return { imported: 0, errors: ["File too large."] };
  const rows = parseCsv(csv);
  if (rows.length < 2) return { imported: 0, errors: ["No data rows found."] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (r: string[], k: string) => (r[head.indexOf(k)] ?? "").trim();
  let imported = 0; const errors: string[] = [];
  for (const [i, r] of rows.slice(1).entries()) {
    try {
      const type = col(r, "type").toLowerCase();
      const text = col(r, "question");
      const options = ["option1", "option2", "option3", "option4", "option5"].map((k) => col(r, k)).filter(Boolean);
      let config: AnswerConfig;
      if (type === "mcq") { const c = Number(col(r, "correct")); if (options.length < 2 || !(c >= 1 && c <= options.length)) throw new Error("needs 2+ options and a correct option number"); config = { type: "mcq", correct: c - 1 }; }
      else if (type === "tf") { const v = col(r, "correct").toLowerCase(); if (v !== "true" && v !== "false") throw new Error("correct must be true or false"); config = { type: "tf", correct: v === "true" }; }
      else if (type === "fill") config = { type: "fill", accepted: col(r, "keywords").split("|").map((x) => x.trim()).filter(Boolean) };
      else if (type === "short") config = { type: "short", keywords: col(r, "keywords").split("|").map((x) => x.trim()).filter(Boolean), rubric: col(r, "explanation") };
      else throw new Error(`unsupported type "${type}" (use mcq, tf, fill or short)`);
      if (config.type === "fill" && config.accepted.length === 0) throw new Error("fill needs accepted answers in the keywords column");
      const diff = ["easy", "medium", "hard"].includes(col(r, "difficulty")) ? (col(r, "difficulty") as "easy") : "medium";
      const q: QuestionInput = { weekNumber: Number(col(r, "week")) || null, type: type as "mcq", text, options: type === "tf" ? ["True", "False"] : options, config, explanation: col(r, "explanation") || "See marking guide.", difficulty: diff, marks: Math.max(1, Number(col(r, "marks")) || 1), scriptureRef: col(r, "scripture") };
      const res = await upsertQuestion(actor, versionId, q);
      if (!res.ok) throw new Error(res.error);
      imported++;
    } catch (e) { errors.push(`Row ${i + 2}: ${(e as Error).message}`); }
  }
  await audit(actor, "import.questions", { type: "version", id: versionId }, { imported, skipped: errors.length });
  return { imported, errors };
}
