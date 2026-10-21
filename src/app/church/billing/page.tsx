import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { billingOverview, publicPlans } from "@/server/services/billing";
import { FEATURE_LABELS } from "@/server/services/entitlements";
import { checkoutAction } from "@/app/actions/staff";
import { SubmitButton } from "@/components/forms";
import { Alert, Card, PageHeader, Progress, StatusBadge, Table } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/text";
import { can } from "@/server/org";

export const metadata: Metadata = { title: "Subscription and billing" };
export const dynamic = "force-dynamic";

export default async function Billing({ searchParams }: { searchParams: Promise<{ error?: string; paid?: string }> }) {
  const { ctx } = await requireOrg("billing.manage");
  const sp = await searchParams;
  const [b, plans] = await Promise.all([billingOverview(ctx), publicPlans()]);
  const ent = b.plan.entitlements;
  const lim = (k: string) => ent[k];
  return (
    <>
      <PageHeader title="Subscription and billing" sub={`Current plan: ${b.plan.name}${b.plan.endAt ? ` (until ${fmtDate(b.plan.endAt)})` : ""}`} />
      {sp.error && <div className="mb-4"><Alert tone="error">{sp.error}</Alert></div>}
      {sp.paid && <div className="mb-4"><Alert tone="ok">Payment confirmed. Your plan is active.</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="text-lg">Usage against your plan</h2>
          <ul className="mt-3 space-y-3 text-sm">
            <li><div className="flex justify-between"><span>Learners</span><span>{b.usage.learners} / {lim("maxLearners") ?? "unlimited"}</span></div>{lim("maxLearners") ? <Progress value={(b.usage.learners / lim("maxLearners")!) * 100} label="Learners" /> : null}</li>
            <li><div className="flex justify-between"><span>Active classes</span><span>{b.usage.classes} / {lim("maxClasses") ?? "unlimited"}</span></div>{lim("maxClasses") ? <Progress value={(b.usage.classes / lim("maxClasses")!) * 100} label="Classes" /> : null}</li>
          </ul>
          <h3 className="mt-5 text-base">Included features</h3>
          <ul className="mt-1 grid grid-cols-2 gap-1 text-sm">{Object.entries(ent).map(([k, v]) => <li key={k}>{(v === null || v > 0) ? "✓" : "✗"} {FEATURE_LABELS[k] ?? k}{v !== null && v > 1 ? ` (${v})` : ""}</li>)}</ul></Card>
        <Card><h2 className="text-lg">Available plans</h2>
          {plans.filter((p) => p.priceMinor > 0).length === 0 ? <p className="mt-2 text-sm text-mist">No paid plans are available yet. The Academy will announce them here.</p> : (
            <ul className="mt-3 space-y-3">{plans.filter((p) => p.priceMinor > 0).map((p) => (
              <li key={p.id} className="rounded-xl border border-line p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-navy">{p.name} <span className="font-normal text-mist">· {formatMoney(p.priceMinor, p.currency)} / {p.billingInterval}</span></p><p className="text-xs text-mist">{p.description}</p></div>
                {can(ctx, "billing.manage") && (b.providerReady ? <form action={checkoutAction}><input type="hidden" name="planId" value={p.id} /><SubmitButton className="btn-gold btn-sm" pendingLabel="Opening checkout…">{b.plan.code === p.code ? "Renew" : "Choose plan"}</SubmitButton></form> : <span className="text-xs text-mist">Online payment is not configured yet</span>)}</div></li>))}</ul>
          )}</Card>
      </div>
      <h2 className="mb-2 mt-6 text-lg">Payment history</h2>
      {b.transactions.length === 0 ? <p className="text-sm text-mist">No payments yet.</p> : <Table caption="Payments"><thead><tr><th>Date</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead><tbody>{b.transactions.map((t) => <tr key={t.id}><td>{fmtDate(t.createdAt)}</td><td className="font-mono text-xs">{t.providerReference}</td><td>{formatMoney(t.amountMinor, t.currency)}</td><td><StatusBadge status={t.status} /></td></tr>)}</tbody></Table>}
      {b.invoices.length > 0 && (<><h2 className="mb-2 mt-6 text-lg">Invoices</h2><Table caption="Invoices"><thead><tr><th>Number</th><th>Issued</th><th>Description</th><th>Total</th><th>Status</th></tr></thead><tbody>{b.invoices.map((i) => <tr key={i.id}><td className="font-mono text-xs">{i.invoiceNumber}</td><td>{fmtDate(i.issuedAt)}</td><td>{i.description}</td><td>{formatMoney(i.totalMinor, i.currency)}</td><td><StatusBadge status={i.paymentStatus} /></td></tr>)}</tbody></Table></>)}
    </>
  );
}
