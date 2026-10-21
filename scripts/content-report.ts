// Content completeness report for the authored curricula (no database needed).
// Run: npm run content:report   (add --write to refresh docs/CONTENT_REPORT.md, --verbose for every problem)
import fs from "node:fs";
import { CATALOG } from "../src/content/catalog";
import { CONTENT } from "../src/content/registry";
import { buildBlueprints, buildLessons } from "../src/content/build";
import { validateCurriculum, lessonWords } from "../src/lib/completeness";
import { getPassages } from "../src/server/bible-data";

const verbose = process.argv.includes("--verbose");
const write = process.argv.includes("--write");
const rows: string[] = [];
let ok = 0, lessonsOk = 0, words = 0, qs = 0, withContent = 0;
const problemsAll: string[] = [];

for (const e of CATALOG) {
  const seeds = CONTENT[e.n];
  if (!seeds) { rows.push(`| ${e.n} | ${e.title} | not yet authored | 0/26 | 0 | 0 |`); continue; }
  withContent++;
  const lessons = buildLessons(seeds);
  const questions = lessons.flatMap((l) => l.questions.map((q) => ({ weekNumber: q.week, type: q.type, hasKey: true, hasExplanation: !!q.explanation })));
  const bps = buildBlueprints(e, lessons).map((b) => ({ kind: b.kind, totalMarks: b.config.totalMarks, durationMinutes: b.config.durationMinutes, passPercent: b.config.passPercent, types: b.config.types }));
  const r = validateCurriculum(lessons, questions, bps);
  const sp: string[] = [];
  for (const l of lessons) for (const ref of [...l.primaryScripture, ...l.additionalScripture, l.memoryVerse]) if (getPassages(ref, "bsb").length === 0) sp.push(`Week ${l.weekNumber}: ${ref}`);
  // Answer-key sanity: each MCQ has exactly 4 distinct options and a valid correct index.
  const keyProblems: string[] = [];
  for (const l of lessons) for (const q of l.questions) {
    if (q.type === "mcq") { if (new Set(q.options).size !== 4) keyProblems.push(`Week ${l.weekNumber}: MCQ options not 4 distinct`); if (q.config.type === "mcq" && (q.config.correct < 0 || q.config.correct > 3)) keyProblems.push(`Week ${l.weekNumber}: bad key`); }
  }
  const all = [...r.problems, ...sp.map((s) => "Scripture does not resolve: " + s), ...keyProblems];
  if (r.lessonsPresent === 26 && all.length === 0) ok++;
  lessonsOk += r.lessonsComplete; words += r.words; qs += r.questions;
  rows.push(`| ${e.n} | ${e.title} | ${all.length ? "NEEDS WORK" : "passes"} | ${r.lessonsComplete}/26 | ${r.words.toLocaleString()} | ${r.questions} |`);
  if (all.length) problemsAll.push(`### ${e.n}. ${e.title}\n` + all.slice(0, verbose ? 200 : 8).map((p) => `- ${p}`).join("\n") + (r.weeks.filter((w) => !w.ok).length ? "\n" + r.weeks.filter((w) => !w.ok).slice(0, verbose ? 26 : 5).map((w) => `- Week ${w.week}: ${w.problems.join(" ")}`).join("\n") : ""));
}

const md = `# Content completeness report

Generated ${new Date().toISOString().slice(0, 10)} by \`npm run content:report\`.

| Measure | Value |
|---|---|
| Curricula in catalogue | ${CATALOG.length} |
| Curricula with authored content | ${withContent} |
| Curricula passing every completeness rule | ${ok} |
| Lesson units complete | ${lessonsOk} of ${CATALOG.length * 26} |
| Teaching words in complete lessons | ${words.toLocaleString()} |
| Questions in banks | ${qs.toLocaleString()} |

"Passes" means: 26 units present; every unit has a title, summary, theme, Scripture that resolves to real Bible text, memory verse, 3+ objectives, 3+ key terms, introduction, context, exegetical observations, 3+ teaching points, 4+ discussion questions with facilitator guidance, application, activity, take-home, prayer, teacher guidance and assessment note above minimum sizes; no placeholder text; no paragraph repeated across lessons; both blueprints present; and enough approved questions to draw a mid-session test (weeks 1-12) and a final examination (both halves). **It does not mean the content has been theologically reviewed.** Every curriculum waits for a human reviewer before it can be published to churches.

| # | Curriculum | Status | Units complete | Words | Questions |
|---|---|---|---|---|---|
${rows.join("\n")}

${problemsAll.length ? "## Problems\n\n" + problemsAll.join("\n\n") : "No problems found in authored curricula."}
`;
console.log(md.split("\n").slice(0, 12).join("\n"));
console.log(rows.join("\n"));
if (problemsAll.length) console.log("\nPROBLEMS\n" + problemsAll.join("\n\n"));
if (write) { fs.mkdirSync("docs", { recursive: true }); fs.writeFileSync("docs/CONTENT_REPORT.md", md); }
process.exit(problemsAll.length ? 1 : 0);
