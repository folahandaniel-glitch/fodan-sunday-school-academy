import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatform } from "@/server/guards";
import { allPlans } from "@/server/services/billing";
import { listAccessCodes } from "@/server/services/access-codes";
import { ActionForm } from "@/components/forms";
import { generateAccessCodesAction, revokeAccessCodeAction } from "@/app/actions/admin";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Church access codes" };
export const dynamic = "force-dynamic";

export default async function AccessCodes({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requirePlatform("plans.manage");
  const sp = await searchParams;
  const [plans, codes] = await Promise.all([allPlans(), listAccessCodes()]);
  const fresh = (sp.new ?? "").split(",").filter(Boolean);
  const offered = plans.filter((p) => p.status !== "retired");
  return (
    <>
      <PageHeader title="Church access codes" sub="Give a church a code that sets its package when it registers. Once registered, the church receives its own member code, which its members enter when they join. Packages (features, limits and prices) are edited under Subscription Plans." />
      {fresh.length > 0 && (
        <div className="mb-4"><Alert tone="ok">
          <p className="font-semibold">{fresh.length === 1 ? "Your new code" : `${fresh.length} new codes`} (copy and send to the church{fresh.length === 1 ? "" : "es"}):</p>
          <ul className="mt-2 space-y-1 font-mono text-base">{fresh.map((c) => <li key={c}>{c}</li>)}</ul>
        </Alert></div>
      )}
      <Card>
        <h2 className="text-lg">Generate codes</h2>
        <ActionForm action={generateAccessCodesAction} submit="Generate" className="mt-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2"><label className="label" htmlFor="planId">Package</label>
              <select id="planId" name="planId" className="input" required>{offered.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status === "draft" ? " (hidden from pricing page)" : ""}</option>)}</select></div>
            <div><label className="label" htmlFor="quantity">How many codes</label><input id="quantity" name="quantity" type="number" min={1} max={100} defaultValue={1} className="input" required /></div>
            <div><label className="label" htmlFor="maxUses">Churches per code</label><input id="maxUses" name="maxUses" type="number" min={1} max={1000} defaultValue={1} className="input" required /></div>
            <div><label className="label" htmlFor="durationDays">Package length (days)</label><input id="durationDays" name="durationDays" type="number" min={1} max={3650} defaultValue={365} className="input" /><p className="hint">Leave blank for no end date.</p></div>
            <div><label className="label" htmlFor="redeemBy">Use code before (optional)</label><input id="redeemBy" name="redeemBy" type="date" className="input" /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="note">Note for your records</label><input id="note" name="note" className="input" maxLength={200} placeholder="e.g. Issued to Grace Chapel, Ibadan" /></div>
          </div>
        </ActionForm>
      </Card>
      <Card className="mt-6">
        <h2 className="text-lg">All codes</h2>
        {codes.length === 0 ? <p className="mt-2 text-sm text-mist">No codes yet.</p> : (
          <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr className="border-b border-line text-mist"><th className="py-2 pr-3">Code</th><th className="pr-3">Package</th><th className="pr-3">Status</th><th className="pr-3">Used</th><th className="pr-3">Length</th><th className="pr-3">Note / churches</th><th /></tr></thead>
            <tbody>{codes.map((c) => (
              <tr key={c.id} className="border-b border-line align-top">
                <td className="py-2 pr-3 font-mono">{c.code}</td><td className="pr-3">{c.planName}</td>
                <td className="pr-3"><Badge tone={c.state === "available" ? "ok" : c.state === "used" ? "info" : "bad"}>{c.state}</Badge></td>
                <td className="pr-3">{c.usedCount}/{c.maxUses}</td><td className="pr-3">{c.durationDays ? `${c.durationDays} days` : "No end date"}</td>
                <td className="pr-3">{c.note}{c.churches.length > 0 && <span className="block text-mist">Used by: {c.churches.join(", ")}</span>}{c.redeemBy && <span className="block text-mist">Use before {c.redeemBy.toISOString().slice(0, 10)}</span>}</td>
                <td>{c.state === "available" && <form action={revokeAccessCodeAction}><input type="hidden" name="id" value={c.id} /><button className="btn btn-light text-xs">Withdraw</button></form>}</td>
              </tr>))}</tbody></table></div>
        )}
        <p className="mt-3 text-sm text-mist">Withdrawing a code stops it being used; churches that already registered keep their package. To change a package&apos;s features or add a new one, go to <Link href="/admin/plans">Subscription Plans</Link>.</p>
      </Card>
    </>
  );
}
