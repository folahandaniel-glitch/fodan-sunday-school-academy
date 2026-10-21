import type { Metadata } from "next";
import { sql, eq, desc } from "drizzle-orm";
import { requirePlatform } from "@/server/guards";
import { getDb, schema } from "@/server/db";
import { Card, PageHeader, Progress, Table } from "@/components/ui";

export const metadata: Metadata = { title: "Usage analytics" };
export const dynamic = "force-dynamic";

export default async function Analytics() {
  await requirePlatform("reports.platform");
  const db = await getDb();
  const [usage, byMonth, topChurches] = await Promise.all([
    db.select({ title: schema.curricula.title, programmes: sql<number>`count(*)::int` }).from(schema.curriculumAssignments).innerJoin(schema.curricula, eq(schema.curricula.id, schema.curriculumAssignments.curriculumId)).where(sql`${schema.curriculumAssignments.status} <> 'cancelled'`).groupBy(schema.curricula.title).orderBy(desc(sql`count(*)`)).limit(15),
    db.select({ m: sql<string>`to_char(date_trunc('month', created_at), 'YYYY-MM')`, n: sql<number>`count(*)::int` }).from(schema.organizations).groupBy(sql`1`).orderBy(sql`1 desc`).limit(12),
    db.select({ name: schema.organizations.name, learners: sql<number>`(select count(*)::int from organization_memberships m where m.organization_id = ${schema.organizations.id} and m.role = 'learner' and m.status = 'active')`, results: sql<number>`(select count(*)::int from assessment_results r where r.organization_id = ${schema.organizations.id})` }).from(schema.organizations).orderBy(desc(sql`2`)).limit(10),
  ]);
  const max = Math.max(1, ...usage.map((u) => u.programmes));
  return (
    <>
      <PageHeader title="Usage analytics" sub="Counts only. Individual learner records are not shown here, and every figure is calculated from live records." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="text-lg">Most used curricula (programmes started)</h2>{usage.length === 0 ? <p className="mt-2 text-sm text-mist">No programmes yet.</p> : <ul className="mt-3 space-y-2">{usage.map((u) => <li key={u.title}><div className="flex justify-between text-sm"><span>{u.title}</span><span>{u.programmes}</span></div><Progress value={(u.programmes / max) * 100} label={u.title} /></li>)}</ul>}</Card>
        <Card><h2 className="text-lg">Churches registered per month</h2><Table caption="Registrations"><thead><tr><th>Month</th><th>Churches</th></tr></thead><tbody>{byMonth.map((r) => <tr key={r.m}><td>{r.m}</td><td>{r.n}</td></tr>)}</tbody></Table></Card>
        <Card className="lg:col-span-2"><h2 className="text-lg">Largest churches by learners</h2><Table caption="Churches"><thead><tr><th>Church</th><th>Learners</th><th>Released results</th></tr></thead><tbody>{topChurches.map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.learners}</td><td>{c.results}</td></tr>)}</tbody></Table></Card>
      </div>
    </>
  );
}
