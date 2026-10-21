import { randomUUID } from "node:crypto";
import Link from "next/link";
import type { Metadata } from "next";
import { eq, and } from "drizzle-orm";
import { requireOrg } from "@/server/guards";
import { getDb, schema } from "@/server/db";
import { previewSchedule, sessionDefaults } from "@/server/services/schedule";
import { listClasses } from "@/server/services/church";
import { listCatalog } from "@/server/services/curriculum";
import { curriculumTierAllowed } from "@/server/services/entitlements";
import { ActionForm } from "@/components/forms";
import { createProgrammeAction } from "@/app/actions/staff";
import { Alert, Card, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/text";
import { isIsoDate, weekdayOf } from "@/lib/schedule";
import { AccessError, NotFoundError } from "@/server/org";

export const metadata: Metadata = { title: "New programme" };
export const dynamic = "force-dynamic";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TYPE_LABEL: Record<string, string> = { teaching: "Teaching", midtest: "Mid-session test", final: "Final examination", revision: "Revision" };

export default async function NewProgramme({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await requireOrg("sessions.manage");
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();
  const type = (sp.type === "jul_dec" || sp.type === "custom" ? sp.type : "jan_jun") as "jan_jun" | "jul_dec" | "custom";
  const def = type === "custom" ? { start: sp.start ?? "", end: sp.end ?? "", name: "" } : sessionDefaults(type, year);
  const start = sp.start && sp.type === type ? sp.start : def.start, end = sp.end && sp.type === type ? sp.end : def.end;
  const [cat, classes, db] = await Promise.all([listCatalog({ pageSize: 60 }), listClasses(ctx), getDb()]);
  const weekday = Number(sp.weekday ?? 0);
  const sessionName = sp.name || def.name || "Custom session";
  let preview: Awaited<ReturnType<typeof previewSchedule>> | null = null, err = "";
  const existing = sp.curriculum ? (await db.select().from(schema.curricula).where(and(eq(schema.curricula.id, sp.curriculum)))).at(0) : undefined;
  if (sp.curriculum && sp.go) {
    try {
      const holidays = (sp.holidays ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [date, ...d] = l.split(/[\s,]+/); return { date, description: d.join(" ") }; });
      preview = await previewSchedule(ctx, { sessionName, year, sessionType: type, startDate: start, endDate: end, weekday, curriculumId: sp.curriculum, midtestWeek: Number(sp.midtest) || 13, finalWeek: Number(sp.final) || 25, revisionWeek: Number(sp.revision) || 26, shortfallPolicy: (sp.policy as "extend") || "extend", holidays });
    } catch (e) { if (e instanceof AccessError || e instanceof NotFoundError) err = e.message; else if ((e as Error).name === "EntitlementError") err = (e as Error).message; else throw e; }
  }
  const allowed = await Promise.all(cat.rows.map(({ c }) => curriculumTierAllowed(ctx.orgId, c.accessTier)));
  const key = randomUUID();
  const p = preview?.proposal;
  return (
    <>
      <PageHeader crumbs={[{ label: "Academic sessions", href: "/church/sessions" }, { label: "New programme" }]} title="New programme" sub="Choose a curriculum and a session. The Academy proposes the dates for all 26 weeks; you confirm or adjust them before anything starts." />
      <Card>
        <form className="space-y-4" aria-label="Programme details">
          <input type="hidden" name="go" value="1" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="curriculum">Curriculum</label><select id="curriculum" name="curriculum" className="input" defaultValue={sp.curriculum ?? ""} required><option value="" disabled>Choose a curriculum…</option>{cat.rows.map(({ c }, i) => <option key={c.id} value={c.id} disabled={!allowed[i]}>{c.catalogNumber}. {c.title}{!allowed[i] ? " (needs a higher plan)" : ""}</option>)}</select></div>
            <div><label className="label" htmlFor="type">Session</label><select id="type" name="type" className="input" defaultValue={type}><option value="jan_jun">January to June</option><option value="jul_dec">July to December</option><option value="custom">Custom dates</option></select></div>
            <div><label className="label" htmlFor="year">Academic year</label><input id="year" name="year" type="number" min={2020} max={2100} className="input" defaultValue={year} /></div>
            <div><label className="label" htmlFor="weekday">Teaching day</label><select id="weekday" name="weekday" className="input" defaultValue={weekday}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></div>
            <div><label className="label" htmlFor="start">Start date</label><input id="start" name="start" type="date" className="input" defaultValue={start} /></div>
            <div><label className="label" htmlFor="end">End date</label><input id="end" name="end" type="date" className="input" defaultValue={end} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="name">Session name</label><input id="name" name="name" className="input" defaultValue={sessionName} /></div>
          </div>
          <details open={!!(sp.holidays || sp.midtest)}><summary className="cursor-pointer font-semibold text-brand">Holidays, special services and assessment weeks</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="holidays">Dates to skip (one per line: YYYY-MM-DD and a note)</label><textarea id="holidays" name="holidays" className="input" rows={4} defaultValue={sp.holidays} placeholder={"2027-04-04 Easter Sunday\n2027-05-30 Convention"} /></div>
              <div className="grid grid-cols-3 gap-3"><div><label className="label" htmlFor="midtest">Test week</label><input id="midtest" name="midtest" type="number" min={1} max={26} defaultValue={sp.midtest ?? 13} className="input" /></div><div><label className="label" htmlFor="final">Exam week</label><input id="final" name="final" type="number" min={1} max={26} defaultValue={sp.final ?? 25} className="input" /></div><div><label className="label" htmlFor="revision">Revision week</label><input id="revision" name="revision" type="number" min={1} max={26} defaultValue={sp.revision ?? 26} className="input" /></div>
                <div className="col-span-3"><label className="label" htmlFor="policy">If the calendar has fewer than 26 dates</label><select id="policy" name="policy" className="input" defaultValue={sp.policy ?? "extend"}><option value="extend">Extend past the end date so every lesson is taught</option><option value="combine">Combine some teaching lessons on one date</option><option value="unscheduled">Leave the last lessons unscheduled for now</option></select></div></div>
            </div>
          </details>
          <button className="btn btn-primary">Propose the 26-week schedule</button>
        </form>
      </Card>

      {err && <div className="mt-4"><Alert tone="error">{err}</Alert></div>}
      {p && (
        <div className="mt-6 space-y-4">
          {p.errors.map((e) => <Alert key={e} tone="error">{e}</Alert>)}
          {p.warnings.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}
          {p.errors.length === 0 && (
            <Card>
              <h2 className="text-lg">Proposed schedule for {existing?.title}</h2>
              <p className="text-sm text-mist">{p.eligibleCount} {DAYS[weekday]}s are available between {fmtDate(start)} and {fmtDate(end)}. The programme will be pinned to the curriculum&apos;s current published version, so later improvements never change it unless you choose to adopt them.</p>
              <ActionForm action={createProgrammeAction} submit="Create programme" className="mt-4" noticeAbove>
                {["sessionName:" + sessionName, "year:" + year, "sessionType:" + type, "startDate:" + start, "endDate:" + end, "weekday:" + weekday, "curriculumId:" + sp.curriculum, "midtestWeek:" + (sp.midtest ?? 13), "finalWeek:" + (sp.final ?? 25), "revisionWeek:" + (sp.revision ?? 26), "shortfallPolicy:" + (sp.policy ?? "extend"), "holidays:" + (sp.holidays ?? ""), "key:" + key].map((kv) => { const i = kv.indexOf(":"); return <input key={kv} type="hidden" name={kv.slice(0, i)} value={kv.slice(i + 1)} />; })}
                <div className="overflow-x-auto"><table className="table"><thead><tr><th>Week</th><th>Lesson</th><th>Type</th><th>Date (editable)</th></tr></thead><tbody>
                  {p.slots.map((s) => (<tr key={s.slot}><td>{s.slot}</td><td>Lesson unit {s.unitWeek}</td><td>{TYPE_LABEL[s.type]}{s.combinedWithSlot && <span className="badge ml-1">shares date</span>}{s.beyondEnd && <span className="badge badge-warn ml-1">after end date</span>}</td>
                    <td><label className="sr-only" htmlFor={`d${s.slot}`}>Date for week {s.slot}</label><input id={`d${s.slot}`} name={`date_${s.slot}`} type="date" className="input !min-h-9 !w-auto !py-1" defaultValue={s.date ?? ""} />{s.date && isIsoDate(s.date) && <span className="ml-2 text-xs text-mist">{DAYS[weekdayOf(s.date)]}</span>}</td></tr>))}
                </tbody></table></div>
                {classes.length > 0 && <fieldset><legend className="label">Classes that will follow this programme</legend><div className="flex flex-wrap gap-4 text-sm">{classes.map((c) => <label key={c.id} className="flex items-center gap-2"><input type="checkbox" name="classIds" value={c.id} className="h-4 w-4" /> {c.name} ({c.learners})</label>)}</div></fieldset>}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activate" defaultChecked className="h-4 w-4" /> Activate now (learners and teachers are notified). Untick to save as a draft first.</label>
              </ActionForm>
            </Card>
          )}
        </div>
      )}
      <p className="mt-6 text-sm"><Link href="/church/library">Browse the curriculum library</Link></p>
    </>
  );
}
