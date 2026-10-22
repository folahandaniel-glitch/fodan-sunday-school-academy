import Link from "next/link";
import { BookOpen, CalendarDays, ShieldCheck, ClipboardCheck, Users, Lock, Building2, Award, BarChart3, GraduationCap, type LucideIcon } from "lucide-react";
import { Markdown } from "./markdown";
import type { SiteSection } from "@/server/db/schema";
import { ContactForm } from "./contact-form";
import { listCategories } from "@/server/services/curriculum";
import { publicPlans } from "@/server/services/billing";
import { formatMoney } from "@/lib/money";
import { Logo } from "./logo";

const ICONS: Record<string, LucideIcon> = { book: BookOpen, calendar: CalendarDays, shield: ShieldCheck, clipboard: ClipboardCheck, users: Users, lock: Lock, building: Building2, award: Award, chart: BarChart3, cap: GraduationCap };
type D = Record<string, unknown>;
const t = (d: D, k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
const arr = (d: D, k: string) => (Array.isArray(d[k]) ? (d[k] as D[]) : []);

async function Section({ s }: { s: SiteSection }) {
  const d = s.data as D;
  switch (s.type) {
    case "hero":
      return (
        <section className="hero-bg text-white">
          <div className="container-page grid items-center gap-8 py-14 sm:py-20 lg:grid-cols-[1.4fr_1fr]">
            <div>
              {t(d, "eyebrow") && <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-gold">{t(d, "eyebrow")}</p>}
              <h1 className="!text-white text-3xl sm:text-5xl">{t(d, "title")}</h1>
              <p className="mt-4 max-w-2xl text-lg text-white/85">{t(d, "subtitle")}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                {t(d, "primaryLabel") && <Link className="btn btn-gold" href={t(d, "primaryHref") || "/register/church"}>{t(d, "primaryLabel")}</Link>}
                {t(d, "secondaryLabel") && <Link className="btn btn-ghost-light" href={t(d, "secondaryHref") || "/library"}>{t(d, "secondaryLabel")}</Link>}
              </div>
            </div>
            <div className="hidden justify-center lg:flex"><Logo placement="login" height={230} className="drop-shadow-xl" alt="" /></div>
          </div>
        </section>
      );
    case "features":
      return (
        <section className="container-page py-12">
          <h2 className="mb-6 text-2xl sm:text-3xl">{t(d, "title")}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {arr(d, "items").map((it, i) => { const Icon = ICONS[t(it, "icon")] ?? BookOpen; return (
              <div key={i} className="card card-pad"><span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand"><Icon size={22} aria-hidden /></span><h3 className="text-lg">{t(it, "title")}</h3><p className="mt-1 text-sm text-mist">{t(it, "body")}</p></div>); })}
          </div>
        </section>
      );
    case "steps":
      return (
        <section className="bg-ivory py-12"><div className="container-page">
          <h2 className="mb-6 text-2xl sm:text-3xl">{t(d, "title")}</h2>
          <ol className="grid gap-4 md:grid-cols-2">
            {arr(d, "items").map((it, i) => (<li key={i} className="card card-pad flex gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy font-display text-gold" aria-hidden>{i + 1}</span><div><h3 className="text-lg">{t(it, "title")}</h3><p className="mt-1 text-sm text-mist">{t(it, "body")}</p></div></li>))}
          </ol>
        </div></section>
      );
    case "text":
      return (<section className="container-page max-w-3xl py-12"><h1 className="mb-4 text-3xl">{t(d, "title")}</h1><Markdown text={t(d, "body")} /></section>);
    case "categories": {
      const cats = await listCategories();
      return (
        <section className="container-page py-12">
          <h2 className="mb-6 text-2xl sm:text-3xl">{t(d, "title")}</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cats.map(({ c, total }) => (<Link key={c.id} href={`/library?category=${c.slug}`} className="card card-pad card-hover no-underline"><h3 className="text-lg">{c.name}</h3><p className="mt-1 text-sm text-mist">{c.description}</p><p className="mt-3 text-xs font-semibold text-brand">{total} curricula</p></Link>))}
          </div>
        </section>
      );
    }
    case "faq":
      return (
        <section className="container-page max-w-3xl py-12">
          <h1 className="mb-6 text-3xl">{t(d, "title")}</h1>
          <div className="space-y-3">{arr(d, "items").map((it, i) => (<details key={i} className="card card-pad group"><summary className="cursor-pointer font-semibold text-navy">{t(it, "q")}</summary><p className="mt-2 text-mist">{t(it, "a")}</p></details>))}</div>
        </section>
      );
    case "cta":
      return (<section className="container-page py-12"><div className="hero-bg rounded-2xl p-8 text-center text-white sm:p-12"><h2 className="!text-white text-2xl sm:text-3xl">{t(d, "title")}</h2><p className="mx-auto mt-2 max-w-xl text-white/85">{t(d, "body")}</p><Link className="btn btn-gold mt-6" href={t(d, "href") || "/register/church"}>{t(d, "label")}</Link></div></section>);
    case "contact":
      return (<section className="container-page max-w-2xl py-12"><h1 className="mb-2 text-3xl">{t(d, "title")}</h1><p className="mb-6 text-mist">{t(d, "body")}</p><ContactForm /></section>);
    case "founder":
      return (
        <section className="bg-ivory py-12"><div className="container-page grid items-center gap-8 md:grid-cols-[280px_1fr]">
          {t(d, "image") && <div className="mx-auto w-full max-w-[280px]"><img src={t(d, "image")} alt={t(d, "imageAlt")} width={560} height={560} loading="lazy" className="aspect-square w-full rounded-2xl border-4 border-white object-cover object-top shadow-lg" /></div>}
          <div>
            {t(d, "eyebrow") && <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-gold-700">{t(d, "eyebrow")}</p>}
            <h2 className="text-2xl sm:text-3xl">{t(d, "name")}</h2>
            {t(d, "role") && <p className="mb-4 font-semibold text-brand">{t(d, "role")}</p>}
            <Markdown text={t(d, "body")} />
          </div>
        </div></section>
      );
    case "pricing": {
      const plans = await publicPlans();
      return (
        <section className="container-page py-12">
          <h1 className="mb-2 text-3xl">{t(d, "title") || "Plans"}</h1>
          <p className="mb-6 max-w-2xl text-mist">{t(d, "body") || "Every church starts free for 30 days with no access code. Choose a yearly package to keep going and unlock more learners, classes and features."}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {plans.map((p) => (
              <div key={p.id} className="card card-pad flex flex-col"><h3 className="text-xl">{p.name}</h3><p className="mt-1 text-sm text-mist">{p.description}</p>
                <p className="mt-4 font-display text-3xl text-navy">{p.priceMinor === 0 ? "Free" : formatMoney(p.priceMinor, p.currency)}{p.priceMinor === 0 && p.trialDays > 0 && <span className="text-sm text-mist"> for {p.trialDays} days</span>}{p.priceMinor > 0 && <span className="text-sm text-mist"> / {p.billingInterval === "yearly" ? "year" : p.billingInterval}</span>}</p>
                <ul className="mt-4 flex-1 space-y-1 text-sm">{p.display.highlights.map((h) => <li key={h}>✓ {h}</li>)}</ul>
                <Link className="btn btn-primary mt-5" href="/register/church">{p.priceMinor === 0 ? "Register your church" : "Register with a code"}</Link></div>))}
          </div>
        </section>
      );
    }
    default: return null;
  }
}

export async function SiteSections({ sections }: { sections: SiteSection[] }) {
  return <>{await Promise.all(sections.filter((s) => !s.hidden).map((s) => <Section key={s.id} s={s} />))}</>;
}
