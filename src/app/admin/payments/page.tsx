import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { requirePlatform } from "@/server/guards";
import { getDb, schema } from "@/server/db";
import { activeProvider } from "@/server/services/billing";
import { Alert, PageHeader, StatusBadge, Table } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "Payments and invoices" };
export const dynamic = "force-dynamic";

export default async function Payments() {
  await requirePlatform("payments.view");
  const db = await getDb();
  const [tx, inv, hooks] = await Promise.all([
    db.select({ t: schema.paymentTransactions, org: schema.organizations.name }).from(schema.paymentTransactions).innerJoin(schema.organizations, eq(schema.organizations.id, schema.paymentTransactions.organizationId)).orderBy(desc(schema.paymentTransactions.createdAt)).limit(100),
    db.select({ i: schema.invoices, org: schema.organizations.name }).from(schema.invoices).innerJoin(schema.organizations, eq(schema.organizations.id, schema.invoices.organizationId)).orderBy(desc(schema.invoices.issuedAt)).limit(50),
    db.select().from(schema.paymentWebhookEvents).orderBy(desc(schema.paymentWebhookEvents.createdAt)).limit(20),
  ]);
  const p = activeProvider();
  return (
    <>
      <PageHeader title="Payments and invoices" sub="Paid plans are activated only after the payment provider verifies the payment; a browser redirect alone never grants access." />
      {p ? <div className="mb-4"><Alert tone={p.name === "simulator" ? "warn" : "ok"}>Payment provider: <strong>{p.name}</strong>{p.name === "simulator" ? " (development simulator: not real money)" : ""}. Webhook address: <code>/api/payments/webhook/paystack</code></Alert></div> : <div className="mb-4"><Alert tone="warn">No payment provider is configured. Set <code>PAYSTACK_SECRET_KEY</code> in the environment, then register the webhook address above in your Paystack dashboard. Churches can still use the free plan.</Alert></div>}
      <h2 className="mb-2 text-lg">Transactions</h2>
      <Table caption="Transactions"><thead><tr><th>When</th><th>Church</th><th>Reference</th><th>Amount</th><th>Provider</th><th>Status</th><th>Verification</th></tr></thead><tbody>{tx.map(({ t, org }) => <tr key={t.id}><td className="text-xs">{fmtDateTime(t.createdAt)}</td><td>{org}</td><td className="font-mono text-xs">{t.providerReference}</td><td>{formatMoney(t.amountMinor, t.currency)}</td><td>{t.provider}</td><td><StatusBadge status={t.status} /></td><td><StatusBadge status={t.verificationStatus} /></td></tr>)}{tx.length === 0 && <tr><td colSpan={7} className="text-mist">No transactions yet.</td></tr>}</tbody></Table>
      <h2 className="mb-2 mt-6 text-lg">Invoices</h2>
      <Table caption="Invoices"><thead><tr><th>Number</th><th>Church</th><th>Issued</th><th>Total</th><th>Status</th></tr></thead><tbody>{inv.map(({ i, org }) => <tr key={i.id}><td className="font-mono text-xs">{i.invoiceNumber}</td><td>{org}</td><td className="text-xs">{fmtDateTime(i.issuedAt)}</td><td>{formatMoney(i.totalMinor, i.currency)}</td><td><StatusBadge status={i.paymentStatus} /></td></tr>)}{inv.length === 0 && <tr><td colSpan={5} className="text-mist">No invoices yet.</td></tr>}</tbody></Table>
      <h2 className="mb-2 mt-6 text-lg">Webhook events</h2>
      <Table caption="Webhook events"><thead><tr><th>When</th><th>Provider</th><th>Event</th><th>Signature</th><th>Processing</th></tr></thead><tbody>{hooks.map((h) => <tr key={h.id}><td className="text-xs">{fmtDateTime(h.createdAt)}</td><td>{h.provider}</td><td className="font-mono text-xs">{h.providerEventId.slice(0, 40)}</td><td><StatusBadge status={h.verificationStatus === "verified" ? "success" : "rejected"} /></td><td><StatusBadge status={h.processingStatus} /></td></tr>)}{hooks.length === 0 && <tr><td colSpan={5} className="text-mist">None received.</td></tr>}</tbody></Table>
    </>
  );
}
