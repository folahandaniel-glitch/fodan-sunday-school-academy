import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { allPlans } from "@/server/services/billing";
import { FEATURE_LABELS } from "@/server/services/entitlements";
import { ActionForm } from "@/components/forms";
import { savePlanAction } from "@/app/actions/admin";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { formatMoney, minorUnits } from "@/lib/money";

export const metadata: Metadata = { title: "Subscription plans" };
export const dynamic = "force-dynamic";
const NUM = ["maxLearners", "maxClasses", "maxActiveSessions", "maxAdmins", "examsPerSession", "storageMb"];
const BOOL = ["downloads", "certificates", "advancedReports", "customBranding", "aiAssist"];

function PlanForm({ p }: { p?: Awaited<ReturnType<typeof allPlans>>[number] }) {
  const ent = (k: string) => p?.entitlements.find((e) => e.featureKey === k);
  const cur = p?.currency ?? "NGN", id = p?.id ?? "new";
  return (
    <ActionForm action={savePlanAction} submit={p ? "Save plan" : "Create plan"} className="mt-3">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><label className="label" htmlFor={`n${id}`}>Name</label><input id={`n${id}`} name="name" className="input" defaultValue={p?.name} required /></div>
        <div><label className="label" htmlFor={`s${id}`}>Status</label><select id={`s${id}`} name="status" className="input" defaultValue={p?.status ?? "draft"}><option value="draft">Draft (hidden)</option><option value="active">Active</option><option value="retired">Retired</option></select></div>
        <div><label className="label" htmlFor={`i${id}`}>Billing interval</label><select id={`i${id}`} name="interval" className="input" defaultValue={p?.billingInterval ?? "yearly"}><option value="free">Free</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="biannual">Every 6 months</option><option value="yearly">Yearly</option></select></div>
        <div><label className="label" htmlFor={`p${id}`}>Price ({cur})</label><input id={`p${id}`} name="price" className="input" inputMode="decimal" defaultValue={p ? (p.priceMinor / 10 ** minorUnits(cur)).toString() : "0"} /></div>
        <div><label className="label" htmlFor={`c${id}`}>Currency</label><select id={`c${id}`} name="currency" className="input" defaultValue={cur}>{["NGN", "USD", "GBP", "GHS", "KES", "ZAR"].map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="label" htmlFor={`t${id}`}>Trial days</label><input id={`t${id}`} name="trialDays" type="number" min={0} className="input" defaultValue={p?.trialDays ?? 0} /></div>
        <div><label className="label" htmlFor={`ct${id}`}>Curriculum access</label><select id={`ct${id}`} name="e_curriculumTier" className="input" defaultValue={ent("curriculumTier")?.limitValue ?? 0}><option value="0">Free-tier curricula</option><option value="1">Up to Standard-tier</option><option value="2">All curricula</option></select></div>
        <div className="sm:col-span-4"><label className="label" htmlFor={`d${id}`}>Description</label><input id={`d${id}`} name="description" className="input" defaultValue={p?.description} /></div>
        <div className="sm:col-span-4"><label className="label" htmlFor={`h${id}`}>Highlights shown on the pricing page (one per line)</label><textarea id={`h${id}`} name="highlights" className="input" rows={4} defaultValue={p?.display.highlights.join("\n")} /></div>
      </div>
      <fieldset><legend className="label">Limits (leave blank for unlimited)</legend><div className="grid gap-3 sm:grid-cols-3">{NUM.map((k) => <div key={k}><label className="label" htmlFor={`${k}${id}`}>{FEATURE_LABELS[k]}</label><input id={`${k}${id}`} name={`e_${k}`} type="number" min={0} className="input" defaultValue={ent(k)?.limitValue ?? ""} /></div>)}</div></fieldset>
      <fieldset><legend className="label">Features</legend><div className="flex flex-wrap gap-4 text-sm">{BOOL.map((k) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name={`e_${k}`} className="h-4 w-4" defaultChecked={(ent(k)?.limitValue ?? 0) > 0} /> {FEATURE_LABELS[k]}</label>)}</div></fieldset>
    </ActionForm>
  );
}

export default async function Plans() {
  await requirePlatform("plans.manage");
  const plans = await allPlans();
  return (
    <>
      <PageHeader title="Subscription plans" sub="Define the actual prices, limits and features. A paid plan needs a price before it can be activated. Money is stored in minor units (kobo, cents)." />
      <div className="space-y-4">
        {plans.map((p) => (<Card key={p.id}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl">{p.name} <span className="text-sm font-normal text-mist">· {p.priceMinor ? formatMoney(p.priceMinor, p.currency) : "no price"} · code {p.code}</span></h2><StatusBadge status={p.status} /></div><details><summary className="mt-2 cursor-pointer text-sm font-semibold text-brand">Edit</summary><PlanForm p={p} /></details></Card>))}
      </div>
      <Card className="mt-6"><h2 className="text-lg">Create a plan</h2><PlanForm /></Card>
    </>
  );
}
