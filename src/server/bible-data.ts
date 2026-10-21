import "server-only";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { BOOKS, hasText, parseRanges, plainVerse, rangeLabel, type Range, type TranslationId } from "@/lib/bible";

type Text = string[][][]; // [book][chapter][verse]
const cache = new Map<string, Text>();

function load(t: TranslationId): Text {
  let v = cache.get(t);
  if (!v) {
    const file = path.join(process.cwd(), "data", "bible", `${t}.json.gz`);
    v = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")) as Text;
    cache.set(t, v);
  }
  return v;
}

export const chapterCount = (book: number) => load("kjv")[book].length;
export function chapterVerses(t: TranslationId, book: number, chapter: number): string[] {
  if (!hasText(t, book)) return [];
  return (load(t)[book]?.[chapter - 1] ?? []).map(plainVerse);
}

export interface PassageVerse { chapter: number; n: number; text: string }
export interface Passage { label: string; translation: TranslationId; verses: PassageVerse[]; range: Range }

export function getRange(r: Range, t: TranslationId): Passage {
  const verses: PassageVerse[] = [];
  const maxC = chapterCount(r.book);
  for (let c = r.c1; c <= Math.min(r.c2, maxC); c++) {
    const all = chapterVerses(t, r.book, c);
    const from = c === r.c1 && r.v1 ? r.v1 : 1;
    const to = c === r.c2 && r.v2 ? Math.min(r.v2, all.length) : all.length;
    for (let v = from; v <= to; v++) if (all[v - 1]) verses.push({ chapter: c, n: v, text: all[v - 1] });
  }
  return { label: rangeLabel(r), translation: t, verses, range: r };
}

/** Text for a free-text reference ("John 3:16; John 3:18"). Returns null segments that cannot be resolved (never invents text). */
export function getPassages(ref: string, t: TranslationId): Passage[] {
  return parseRanges(ref).map((r) => getRange(r, t)).filter((p) => p.verses.length > 0);
}

/** Single verse text, or null. */
export function verseText(ref: string, t: TranslationId = "kjv"): string | null {
  const p = getPassages(ref, t);
  if (!p.length) return null;
  return p.map((x) => x.verses.map((v) => v.text).join(" ")).join(" ");
}

export function searchBible(q: string, t: TranslationId, limit = 40): { ref: string; text: string }[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 3) return [];
  const out: { ref: string; text: string }[] = [];
  const data = load(t);
  for (let b = 0; b < data.length && out.length < limit; b++) {
    for (let c = 0; c < data[b].length && out.length < limit; c++) {
      for (let v = 0; v < data[b][c].length; v++) {
        const text = plainVerse(data[b][c][v]);
        if (text.toLowerCase().includes(needle)) {
          out.push({ ref: `${BOOKS[b].name} ${c + 1}:${v + 1}`, text });
          if (out.length >= limit) break;
        }
      }
    }
  }
  return out;
}
