/** Canon metadata and reference parsing (pure; no data loading). Book index = canonical order, 0-based. */
export interface BookMeta { i: number; slug: string; name: string; abbr: string; ot: boolean; group: string; genre: string; chapters?: number }

const RAW: [string, string, string, string, string][] = [
  ["genesis", "Genesis", "Gen", "Law", "Law and narrative"], ["exodus", "Exodus", "Exo", "Law", "Law and narrative"], ["leviticus", "Leviticus", "Lev", "Law", "Law"], ["numbers", "Numbers", "Num", "Law", "Law and narrative"], ["deuteronomy", "Deuteronomy", "Deu", "Law", "Law (covenant renewal sermons)"],
  ["joshua", "Joshua", "Jos", "History", "Historical narrative"], ["judges", "Judges", "Jdg", "History", "Historical narrative"], ["ruth", "Ruth", "Rut", "History", "Historical narrative"], ["1-samuel", "1 Samuel", "1Sa", "History", "Historical narrative"], ["2-samuel", "2 Samuel", "2Sa", "History", "Historical narrative"],
  ["1-kings", "1 Kings", "1Ki", "History", "Historical narrative"], ["2-kings", "2 Kings", "2Ki", "History", "Historical narrative"], ["1-chronicles", "1 Chronicles", "1Ch", "History", "Historical narrative"], ["2-chronicles", "2 Chronicles", "2Ch", "History", "Historical narrative"], ["ezra", "Ezra", "Ezr", "History", "Historical narrative"],
  ["nehemiah", "Nehemiah", "Neh", "History", "Historical narrative"], ["esther", "Esther", "Est", "History", "Historical narrative"],
  ["job", "Job", "Job", "Wisdom & Poetry", "Wisdom poetry"], ["psalms", "Psalms", "Psa", "Wisdom & Poetry", "Hebrew poetry (prayer and praise)"], ["proverbs", "Proverbs", "Pro", "Wisdom & Poetry", "Wisdom sayings"], ["ecclesiastes", "Ecclesiastes", "Ecc", "Wisdom & Poetry", "Wisdom reflection"], ["song-of-solomon", "Song of Solomon", "Sng", "Wisdom & Poetry", "Love poetry"],
  ["isaiah", "Isaiah", "Isa", "Major Prophets", "Prophecy"], ["jeremiah", "Jeremiah", "Jer", "Major Prophets", "Prophecy"], ["lamentations", "Lamentations", "Lam", "Major Prophets", "Lament poetry"], ["ezekiel", "Ezekiel", "Eze", "Major Prophets", "Prophecy"], ["daniel", "Daniel", "Dan", "Major Prophets", "Narrative and apocalyptic"],
  ["hosea", "Hosea", "Hos", "Minor Prophets", "Prophecy"], ["joel", "Joel", "Joe", "Minor Prophets", "Prophecy"], ["amos", "Amos", "Amo", "Minor Prophets", "Prophecy"], ["obadiah", "Obadiah", "Oba", "Minor Prophets", "Prophecy"], ["jonah", "Jonah", "Jon", "Minor Prophets", "Prophetic narrative"],
  ["micah", "Micah", "Mic", "Minor Prophets", "Prophecy"], ["nahum", "Nahum", "Nah", "Minor Prophets", "Prophecy"], ["habakkuk", "Habakkuk", "Hab", "Minor Prophets", "Prophecy and prayer"], ["zephaniah", "Zephaniah", "Zep", "Minor Prophets", "Prophecy"], ["haggai", "Haggai", "Hag", "Minor Prophets", "Prophecy"],
  ["zechariah", "Zechariah", "Zec", "Minor Prophets", "Prophecy and visions"], ["malachi", "Malachi", "Mal", "Minor Prophets", "Prophecy"],
  ["matthew", "Matthew", "Mat", "Gospels & Acts", "Gospel"], ["mark", "Mark", "Mar", "Gospels & Acts", "Gospel"], ["luke", "Luke", "Luk", "Gospels & Acts", "Gospel"], ["john", "John", "Jhn", "Gospels & Acts", "Gospel"], ["acts", "Acts", "Act", "Gospels & Acts", "Historical narrative"],
  ["romans", "Romans", "Rom", "Pauline Letters", "Letter"], ["1-corinthians", "1 Corinthians", "1Co", "Pauline Letters", "Letter"], ["2-corinthians", "2 Corinthians", "2Co", "Pauline Letters", "Letter"], ["galatians", "Galatians", "Gal", "Pauline Letters", "Letter"], ["ephesians", "Ephesians", "Eph", "Pauline Letters", "Letter"],
  ["philippians", "Philippians", "Phl", "Pauline Letters", "Letter"], ["colossians", "Colossians", "Col", "Pauline Letters", "Letter"], ["1-thessalonians", "1 Thessalonians", "1Th", "Pauline Letters", "Letter"], ["2-thessalonians", "2 Thessalonians", "2Th", "Pauline Letters", "Letter"],
  ["1-timothy", "1 Timothy", "1Ti", "Pauline Letters", "Pastoral letter"], ["2-timothy", "2 Timothy", "2Ti", "Pauline Letters", "Pastoral letter"], ["titus", "Titus", "Tit", "Pauline Letters", "Pastoral letter"], ["philemon", "Philemon", "Phm", "Pauline Letters", "Letter"],
  ["hebrews", "Hebrews", "Heb", "General Letters & Revelation", "Sermon-letter"], ["james", "James", "Jas", "General Letters & Revelation", "Letter (wisdom)"], ["1-peter", "1 Peter", "1Pe", "General Letters & Revelation", "Letter"], ["2-peter", "2 Peter", "2Pe", "General Letters & Revelation", "Letter"],
  ["1-john", "1 John", "1Jo", "General Letters & Revelation", "Letter"], ["2-john", "2 John", "2Jo", "General Letters & Revelation", "Letter"], ["3-john", "3 John", "3Jo", "General Letters & Revelation", "Letter"], ["jude", "Jude", "Jde", "General Letters & Revelation", "Letter"], ["revelation", "Revelation", "Rev", "General Letters & Revelation", "Apocalyptic letter-prophecy"],
];

export const BOOKS: BookMeta[] = RAW.map(([slug, name, abbr, group, genre], i) => ({ i, slug, name, abbr, ot: i < 39, group, genre }));
export const bookBySlug = (slug: string) => BOOKS.find((b) => b.slug === slug);

const norm = (s: string) => s.toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
const ALIASES: Record<string, number> = {};
BOOKS.forEach((b) => { for (const k of [b.name, b.abbr, b.slug.replace(/-/g, " ")]) ALIASES[norm(k)] = b.i; });
Object.assign(ALIASES, { gn: 0, ex: 1, lv: 2, nm: 3, dt: 4, jsh: 5, jg: 6, ru: 7, "1sam": 8, "2sam": 9, "1kgs": 10, "2kgs": 11, "1chr": 12, "2chr": 13, ps: 18, psalm: 18, prov: 19, eccl: 20, song: 21, songofsongs: 21, is: 22, jer: 23, ezek: 25, dn: 26, jn: 42, matt: 39, mt: 39, mk: 40, lk: 41, rm: 44, "1cor": 45, "2cor": 46, gl: 47, phil: 49, php: 49, "1thess": 51, "2thess": 52, "1tim": 53, "2tim": 54, heb: 57, jm: 58, "1pet": 59, "2pet": 60, "1jn": 61, "2jn": 62, "3jn": 63, rv: 65, revelations: 65, rth: 7, rut: 7 });

const ONE_CHAPTER = new Set([30, 56, 62, 63, 64]); // Obadiah, Philemon, 2 John, 3 John, Jude

/** A passage range. Whole chapter(s) when v1/v2 are undefined. */
export interface Range { book: number; c1: number; v1?: number; c2: number; v2?: number }

/** Parses one passage: "John 3:16", "Ps 23", "Gen 1:1-2:3", "Gen 1-2", "1 Cor 13:4-7". Null if invalid. */
export function parseRange(input: string): Range | null {
  const m = input.trim().match(/^((?:[1-3]\s*)?[A-Za-z][A-Za-z.\s]*?)\s*(\d+)(?::(\d+))?(?:\s*[-–—]\s*(?:(\d+):)?(\d+))?$/);
  if (!m) return null;
  const book = ALIASES[norm(m[1])];
  if (book === undefined) return null;
  const [, , a, b, c, d] = m;
  if (ONE_CHAPTER.has(book) && !b && Number(a) > 1) return { book, c1: 1, v1: Number(a), c2: 1, v2: d ? Number(d) : Number(a) };
  if (b === undefined) return { book, c1: Number(a), c2: d ? Number(d) : Number(a) }; // chapter or chapter range
  if (c) return { book, c1: Number(a), v1: Number(b), c2: Number(c), v2: Number(d) }; // 1:1-2:3
  return { book, c1: Number(a), v1: Number(b), c2: Number(a), v2: d ? Number(d) : Number(b) };
}

/** Splits "Luke 2:1-20; John 3:16" into ranges, ignoring invalid pieces. */
export function parseRanges(input: string): Range[] {
  return input.split(/\s*;\s*/).map(parseRange).filter((r): r is Range => !!r);
}

export function rangeLabel(r: Range): string {
  const n = BOOKS[r.book].name;
  if (r.v1 === undefined) return r.c1 === r.c2 ? `${n} ${r.c1}` : `${n} ${r.c1}-${r.c2}`;
  if (r.c1 === r.c2) return `${n} ${r.c1}:${r.v1}${r.v2 && r.v2 !== r.v1 ? `-${r.v2}` : ""}`;
  return `${n} ${r.c1}:${r.v1}-${r.c2}:${r.v2}`;
}

/** The book index a free-text reference starts with, or -1. */
export function bookOfRef(ref: string): number {
  const r = parseRanges(ref)[0];
  return r ? r.book : -1;
}

export const TRANSLATIONS = [
  { id: "kjv", name: "KJV", full: "King James Version", lang: "en", licence: "Public domain" },
  { id: "bsb", name: "BSB", full: "Berean Standard Bible", lang: "en", licence: "Public domain (dedicated 2023)" },
  { id: "asv", name: "ASV", full: "American Standard Version (1901)", lang: "en", licence: "Public domain" },
] as const;
export type TranslationId = (typeof TRANSLATIONS)[number]["id"];
export const isTranslation = (x: string | undefined | null): x is TranslationId => TRANSLATIONS.some((t) => t.id === x);
export const hasText = (_t: TranslationId, _book: number) => true;

/** Removes Strong's tags {H123} and <em> markup from stored verse text. */
export const plainVerse = (s: string) => s.replace(/\{[HG]\d+\}/g, "").replace(/<\/?em>/g, "").replace(/\s+([,.;:!?])/g, "$1").replace(/\s+/g, " ").trim();

