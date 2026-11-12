import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicCurriculum } from "@/server/services/curriculum";
import { Badge } from "@/components/ui";
import { getT } from "@/server/ui-text";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await getPublicCurriculum((await params).slug);
  return d ? { title: d.curriculum.title, description: d.curriculum.shortDescription } : { title: "Curriculum" };
}

export default async function CurriculumDetail({ params }: { params: Promise<{ slug: string }> }) {
  const d = await getPublicCurriculum((await params).slug);
  if (!d) notFound();
  const t = await getT();
  const { curriculum: c, lessons, version, blueprints } = d;
  const mid = blueprints.find((b) => b.kind === "midtest")?.config, fin = blueprints.find((b) => b.kind === "final")?.config;
  return (
    <div className="container-page py-10">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-mist"><Link href="/library">{t("Curriculum library")}</Link> / {d.category}</nav>
      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div>
          <h1 className="text-3xl sm:text-4xl">{c.title}</h1>
          <p className="mt-3 text-lg text-mist">{c.shortDescription}</p>
          <div className="mt-4 flex flex-wrap gap-2"><Badge tone="info">{c.level}</Badge><Badge>{c.audience}</Badge><Badge>{c.durationLabel}</Badge><Badge tone="ok">Version {version.versionNumber}</Badge>{c.tags.slice(0, 4).map((t) => <Badge key={t}>{t}</Badge>)}</div>
          <section className="mt-8"><h2 className="text-xl">{t("What learners will be able to do")}</h2><ul className="mt-2 list-disc space-y-1 pl-5">{c.outcomes.map((o) => <li key={o}>{o}</li>)}</ul></section>
          <section className="mt-8"><h2 className="text-xl">{t("Main themes")}</h2><ul className="mt-2 flex flex-wrap gap-2">{c.themes.map((th) => <li key={th} className="badge badge-info">{th}</li>)}</ul></section>
          <section className="mt-8"><h2 className="text-xl">{t("The 26-week outline")}</h2>
            <ol className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
              {lessons.map((l) => (
                <li key={l.week} className="flex gap-3 p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-sm text-gold" aria-hidden>{l.week}</span>
                  <div><p className="font-semibold text-navy">{l.title} {l.kind !== "teaching" && <Badge tone="warn">{l.kind === "midtest" ? t("Mid-session test week") : l.kind === "final" ? t("Final examination week") : t("Revision week")}</Badge>}</p>
                    <p className="text-sm text-mist">{l.theme}</p><p className="text-xs text-mist">{l.scripture.join("; ")}</p></div>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-mist">{t("The full teaching notes, discussion guides and facilitator guidance are available inside a registered church's workspace.")}</p>
          </section>
        </div>
        <aside className="space-y-4">
          <div className="card card-pad"><h2 className="text-lg">{t("Assessment")}</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {mid && <li>{t("Mid-session test: weeks 1 to 12, {marks} marks, {minutes} minutes, pass mark {pass}%.", { marks: mid.totalMarks, minutes: mid.durationMinutes, pass: mid.passPercent })}</li>}
              {fin && <li>{t("Final examination: both halves of the course, {marks} marks, {minutes} minutes, pass mark {pass}%.", { marks: fin.totalMarks, minutes: fin.durationMinutes, pass: fin.passPercent })}</li>}
              <li>{t("Week 26: revision and practice quizzes.")}</li>
            </ul>
            <p className="mt-2 text-xs text-mist">{t("Churches can change the test dates, durations and pass marks.")}</p></div>
          <div className="card card-pad"><h2 className="text-lg">{t("Teaching this course?")}</h2><p className="mt-1 text-sm text-mist">{t("Register your church, choose this curriculum and the Academy will build the six-month schedule.")}</p>
            <Link className="btn btn-primary mt-3 w-full" href="/register/church">{t("Register your church")}</Link><Link className="btn btn-light mt-2 w-full" href="/login">{t("Sign in")}</Link></div>
          {c.doctrinalNotes && <div className="card card-pad"><h2 className="text-lg">{t("Doctrinal note")}</h2><p className="mt-1 text-sm text-mist">{c.doctrinalNotes}</p></div>}
        </aside>
      </div>
    </div>
  );
}
