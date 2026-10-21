import "server-only";
import { Document, HeadingLevel, Packer, Paragraph, TextRun, AlignmentType, PageBreak, Footer, PageNumber } from "docx";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getPassages } from "../bible-data";
import { NotFoundError } from "../org";
import { getSetting } from "../settings";

const p = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; spacing?: number } = {}) =>
  new Paragraph({ spacing: { after: opts.spacing ?? 140 }, children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? 22, font: "Georgia" })] });
const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) => new Paragraph({ heading: level, spacing: { before: 240, after: 120 }, children: [new TextRun({ text, font: "Georgia" })] });
const bullets = (items: string[]) => items.map((t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: t, size: 22, font: "Georgia" })] }));
const paras = (text: string) => text.split(/\n{2,}|\n/).filter(Boolean).map((t) => p(t));

function scriptureParas(refs: string[]) {
  const out: Paragraph[] = [];
  for (const r of refs) {
    const ps = getPassages(r, "bsb");
    if (!ps.length) { out.push(p(r, { bold: true })); continue; }
    for (const x of ps) { out.push(p(`${x.label} (BSB)`, { bold: true, spacing: 60 })); out.push(p(x.verses.map((v) => `${v.n} ${v.text}`).join(" "), { italics: true })); }
  }
  return out;
}

/** Complete curriculum manual (or teacher guide) as a Word document. Student copies never include teacher guidance or facilitator notes. */
export async function buildCurriculumDocx(versionId: string, mode: "teacher" | "student"): Promise<{ buffer: Buffer; filename: string }> {
  const db = await getDb();
  const [row] = await db.select({ v: schema.curriculumVersions, c: schema.curricula }).from(schema.curriculumVersions).innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumVersions.curriculumId)).where(eq(schema.curriculumVersions.id, versionId));
  if (!row) throw new NotFoundError("Version not found.");
  const lessons = await db.select().from(schema.curriculumLessons).where(eq(schema.curriculumLessons.versionId, versionId)).orderBy(asc(schema.curriculumLessons.weekNumber));
  const brand = await getSetting("brand");
  const teacher = mode === "teacher";
  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: brand.siteName.toUpperCase(), bold: true, size: 28, font: "Georgia", color: "12306B" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, heading: HeadingLevel.TITLE, children: [new TextRun({ text: row.c.title, font: "Georgia" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: teacher ? "Teacher's guide" : "Student notes", size: 28, font: "Georgia" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `26 weeks · Version ${row.v.versionNumber} · ${brand.ministry}`, size: 22, font: "Georgia" })] }),
    new Paragraph({ children: [new PageBreak()] }),
    h("About this course", HeadingLevel.HEADING_1), ...paras(row.c.fullDescription || row.c.shortDescription),
    h("Learning outcomes", HeadingLevel.HEADING_2), ...bullets(row.c.outcomes),
  ];
  for (const l of lessons) {
    const c = l.content;
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(h(`Week ${l.weekNumber}: ${l.title}`, HeadingLevel.HEADING_1), p(l.theme, { italics: true }), ...paras(l.summary));
    children.push(h("Scripture", HeadingLevel.HEADING_2), ...scriptureParas(l.primaryScripture));
    if (l.additionalScripture.length) children.push(p(`Supporting passages: ${l.additionalScripture.join("; ")}`));
    children.push(h("Learning objectives", HeadingLevel.HEADING_2), ...bullets(l.objectives));
    children.push(h("Key terms", HeadingLevel.HEADING_2), ...l.keyTerms.map((k) => p(`${k.term}: ${k.meaning}`)));
    children.push(h("Introduction", HeadingLevel.HEADING_2), ...paras(c.introduction));
    children.push(h("Background and context", HeadingLevel.HEADING_2), ...paras(c.context), h("Observations on the text", HeadingLevel.HEADING_3), ...paras(c.observations));
    children.push(h("Main teaching points", HeadingLevel.HEADING_2));
    c.teachingPoints.forEach((t, i) => children.push(h(`${i + 1}. ${t.heading}`, HeadingLevel.HEADING_3), ...paras(t.body)));
    if (c.revisionMap) { children.push(h("Revision map", HeadingLevel.HEADING_2)); c.revisionMap.forEach((r) => children.push(p(`Week ${r.week}, ${r.title}: ${r.keyIdea} (Memory verse: ${r.memoryVerse})`))); }
    children.push(h("Discussion questions", HeadingLevel.HEADING_2));
    c.discussion.forEach((d, i) => { children.push(p(`${i + 1}. ${d.q}`, { bold: true, spacing: 60 })); if (teacher) children.push(p(`Facilitator guidance: ${d.guidance}`, { italics: true })); });
    children.push(h("Practical application", HeadingLevel.HEADING_2), ...paras(c.application));
    children.push(h("Memory verse", HeadingLevel.HEADING_2), ...scriptureParas([l.memoryVerse]));
    children.push(h("Group activity or reflection", HeadingLevel.HEADING_2), ...paras(c.activity), h("Take-home assignment", HeadingLevel.HEADING_2), ...paras(c.takeHome), h("Prayer and reflection", HeadingLevel.HEADING_2), ...paras(c.prayer));
    if (teacher) children.push(h("Teacher guidance", HeadingLevel.HEADING_2), ...paras(c.teacherGuidance), p(`Weekly check: ${c.assessmentNote}`, { italics: true }));
  }
  const doc = new Document({
    creator: brand.siteName, title: `${row.c.title} (${teacher ? "teacher guide" : "student notes"})`,
    sections: [{ properties: {}, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [`${row.c.title} · ${brand.siteName} · page `, PageNumber.CURRENT], size: 18, font: "Georgia" })] })] }) }, children }],
  });
  const buffer = await Packer.toBuffer(doc);
  return { buffer, filename: `${row.c.slug}-v${row.v.versionNumber}-${mode}.docx` };
}
