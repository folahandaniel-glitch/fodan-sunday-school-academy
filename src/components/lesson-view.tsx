import { ScriptureBlock } from "./scripture";
import { Badge } from "./ui";
import type { LessonView } from "@/server/services/teaching";
import type { TranslationId } from "@/lib/bible";
import { fmtDate } from "@/lib/text";

const TYPE_LABEL: Record<string, string> = { midtest: "Mid-session test week", final: "Final examination week", revision: "Revision week" };

/** Renders a lesson. `teacher` content (facilitator guidance, teacher notes) is only present in the data when the server allowed it. */
export function LessonBody({ v, tr = "bsb" }: { v: LessonView; tr?: TranslationId }) {
  const c = v.content, l = v.lesson;
  return (
    <article className="space-y-8">
      <header className="print-block">
        <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">{v.curriculum.title} · Week {v.week} {v.date && <>· {fmtDate(v.date)}</>}</p>
        <h1 className="mt-1 text-3xl">{l.title}</h1>
        <p className="mt-2 text-lg text-mist">{l.theme}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs"><Badge tone="info">{l.minutes} minutes</Badge>{v.type !== "teaching" && <Badge tone="warn">{TYPE_LABEL[v.type]}</Badge>}<Badge>Curriculum version {v.versionNumber}</Badge></div>
        <p className="mt-4">{l.summary}</p>
      </header>

      <section className="print-block"><h2 className="text-xl">Scripture for this lesson</h2><div className="mt-2"><ScriptureBlock refs={l.scripture} translation={tr} /></div>
        {l.more.length > 0 && <p className="mt-2 text-sm text-mist"><strong>Supporting passages:</strong> {l.more.join("; ")}</p>}</section>

      <section className="print-block"><h2 className="text-xl">Learning objectives</h2><p className="text-sm text-mist">By the end of this lesson you should be able to:</p><ul className="mt-2 list-disc space-y-1 pl-5">{l.objectives.map((o) => <li key={o}>{o}</li>)}</ul></section>

      <section className="print-block"><h2 className="text-xl">Key terms</h2><dl className="mt-2 grid gap-2 sm:grid-cols-2">{l.keyTerms.map((k) => (<div key={k.term} className="rounded-lg bg-ivory p-3"><dt className="font-semibold text-navy">{k.term}</dt><dd className="text-sm text-mist">{k.meaning}</dd></div>))}</dl></section>

      <section><h2 className="text-xl">Introduction</h2><p className="mt-2 whitespace-pre-line">{c.introduction}</p></section>
      <section><h2 className="text-xl">Background and context</h2><p className="mt-2 whitespace-pre-line">{c.context}</p><h3 className="mt-4 text-lg">Observations on the text</h3><p className="mt-1 whitespace-pre-line">{c.observations}</p></section>

      <section><h2 className="text-xl">Main teaching points</h2>
        <ol className="mt-3 space-y-4">{c.teachingPoints.map((p, i) => (<li key={i} className="card card-pad print-block"><h3 className="text-lg"><span className="mr-2 text-gold-700">{i + 1}.</span>{p.heading}</h3><p className="mt-2 whitespace-pre-line">{p.body}</p></li>))}</ol></section>

      {c.revisionMap && (
        <section className="print-block"><h2 className="text-xl">Revision map</h2><p className="text-sm text-mist">One line for each lesson, with its memory verse reference. Say the main idea aloud for each.</p>
          <table className="table mt-2"><thead><tr><th>Week</th><th>Lesson</th><th>Main idea</th><th>Memory verse</th></tr></thead><tbody>{c.revisionMap.map((r) => <tr key={r.week}><td>{r.week}</td><td className="font-semibold">{r.title}</td><td>{r.keyIdea}</td><td>{r.memoryVerse}</td></tr>)}</tbody></table></section>
      )}

      <section className="print-block"><h2 className="text-xl">Discussion questions</h2>
        <ol className="mt-2 list-decimal space-y-3 pl-5">{c.discussion.map((d, i) => (<li key={i}><p className="font-semibold text-navy">{d.q}</p>{d.guidance && <p className="mt-1 rounded-lg bg-gold-50 p-3 text-sm"><strong>Facilitator guidance:</strong> {d.guidance}</p>}</li>))}</ol></section>

      <section className="print-block"><h2 className="text-xl">Practical application</h2><p className="mt-2 whitespace-pre-line">{c.application}</p></section>
      <section className="print-block"><h2 className="text-xl">Memory verse</h2><div className="mt-2"><ScriptureBlock refs={[l.memoryVerse]} translation={tr} /></div></section>
      <section className="print-block"><h2 className="text-xl">Group activity or reflection</h2><p className="mt-2 whitespace-pre-line">{c.activity}</p></section>
      <section className="print-block"><h2 className="text-xl">Take-home assignment</h2><p className="mt-2 whitespace-pre-line">{c.takeHome}</p></section>
      <section className="print-block"><h2 className="text-xl">Prayer and reflection</h2><p className="mt-2 whitespace-pre-line">{c.prayer}</p></section>
      <section className="print-block"><h2 className="text-xl">Weekly check</h2><p className="mt-2">{c.assessmentNote}</p></section>
      {c.supplementary.length > 0 && <section className="print-block"><h2 className="text-xl">Recommended materials</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{c.supplementary.map((s) => <li key={s}>{s}</li>)}</ul></section>}

      {c.teacherGuidance && (
        <section className="print-block rounded-2xl border-2 border-gold bg-gold-50 p-5"><h2 className="text-xl">Teacher guidance <Badge tone="warn">Teachers only</Badge></h2><p className="mt-2 whitespace-pre-line">{c.teacherGuidance}</p></section>
      )}
    </article>
  );
}
