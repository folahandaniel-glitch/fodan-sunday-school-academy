import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { getSetting } from "@/server/settings";
import { health } from "@/server/services/admin";
import { ActionForm } from "@/components/forms";
import { saveSettingAction } from "@/app/actions/admin";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Integrations and settings" };
export const dynamic = "force-dynamic";

export default async function Settings() {
  await requirePlatform("settings.manage");
  const [f, a, c, d, m, h] = await Promise.all([getSetting("features"), getSetting("assessment"), getSetting("certificate"), getSetting("doctrine"), getSetting("maintenance"), health()]);
  const cb = (k: keyof typeof f, label: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={String(k)} className="h-4 w-4" defaultChecked={Boolean(f[k])} /> {label}</label>;
  return (
    <>
      <PageHeader title="Integrations and settings" sub="Platform-wide behaviour. Secrets (database, payment and email keys) live in the hosting environment and are never shown or stored here." />
      <Card><h2 className="text-lg">Integration status</h2><ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <li>Database: <Badge tone="ok">{h.database}</Badge> <span className="text-xs text-mist">{h.latencyMs} ms</span></li><li>Authentication secret: <Badge tone={h.authSecret === "set" ? "ok" : "bad"}>{h.authSecret}</Badge></li>
        <li>Email provider (Resend): <Badge tone={h.email === "configured" ? "ok" : "warn"}>{h.email}</Badge></li><li>Payments (Paystack): <Badge tone={h.payments === "configured" ? "ok" : "warn"}>{h.payments}</Badge></li>
        <li>AI authoring assistance: <Badge>not enabled</Badge> <span className="text-xs text-mist">manual authoring is complete without it</span></li></ul></Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card><h2 className="text-lg">Registration and access</h2>
          <ActionForm action={saveSettingAction} submit="Save" className="mt-3"><input type="hidden" name="key" value="features" />
            {cb("memberRegistrationOpen", "Member registration open")}{cb("churchRegistrationOpen", "Church registration open")}{cb("requireChurchApproval", "New churches must be approved by the Super Admin")}{cb("allowTypedChurchNames", "Members may type a church name that is not listed")}{cb("requireEmailVerification", "Require email confirmation before sign-in (needs an email provider)")}{cb("forumEnabled", "Community forum open")}{cb("forumRequiresVerifiedEmail", "Forum posting needs a confirmed email")}{cb("requireHumanReview", "Curricula need human review before publication")}
            <div className="grid grid-cols-4 gap-3"><div><label className="label" htmlFor="mfl">Failed sign-ins before lock</label><input id="mfl" name="maxFailedLogins" type="number" min={3} className="input" defaultValue={f.maxFailedLogins} /></div><div><label className="label" htmlFor="lm">Lock minutes</label><input id="lm" name="lockMinutes" type="number" min={1} className="input" defaultValue={f.lockMinutes} /></div><div><label className="label" htmlFor="gd">Plan grace days</label><input id="gd" name="graceDays" type="number" min={0} className="input" defaultValue={f.graceDays} /></div><div><label className="label" htmlFor="dc">Default currency</label><input id="dc" name="defaultCurrency" className="input" defaultValue={f.defaultCurrency} maxLength={3} /></div></div></ActionForm></Card>
        <Card><h2 className="text-lg">Assessment defaults</h2>
          <ActionForm action={saveSettingAction} submit="Save" className="mt-3"><input type="hidden" name="key" value="assessment" /><div><label className="label" htmlFor="dp">Default pass mark %</label><input id="dp" name="defaultPassPercent" type="number" className="input" defaultValue={a.defaultPassPercent} /></div><div><label className="label" htmlFor="gs">Grade scale (one per line: minimum %, grade, label)</label><textarea id="gs" name="gradeScale" rows={7} className="input font-mono text-sm" defaultValue={a.gradeScale.map((g) => `${g.min}, ${g.grade}, ${g.label ?? ""}`).join("\n")} /></div></ActionForm></Card>
        <Card><h2 className="text-lg">Certificate wording</h2>
          <ActionForm action={saveSettingAction} submit="Save" className="mt-3"><input type="hidden" name="key" value="certificate" /><div><label className="label" htmlFor="ct">Title</label><input id="ct" name="title" className="input" defaultValue={c.title} /></div><div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="sn">Signatory</label><input id="sn" name="signatoryName" className="input" defaultValue={c.signatoryName} /></div><div><label className="label" htmlFor="st">Signatory title</label><input id="st" name="signatoryTitle" className="input" defaultValue={c.signatoryTitle} /></div></div><div><label className="label" htmlFor="fn">Footer note</label><input id="fn" name="footerNote" className="input" defaultValue={c.footerNote} /></div></ActionForm></Card>
        <Card><h2 className="text-lg">Doctrinal position</h2>
          <ActionForm action={saveSettingAction} submit="Save" className="mt-3"><input type="hidden" name="key" value="doctrine" /><textarea name="position" rows={6} className="input" defaultValue={d.position} aria-label="Doctrinal position" /></ActionForm></Card>
        <Card className="lg:col-span-2"><h2 className="text-lg">Maintenance mode</h2><p className="text-sm text-mist">Shows a notice to everyone except the Super Admin. Use only for planned work.</p>
          <ActionForm action={saveSettingAction} submit="Save" className="mt-3"><input type="hidden" name="key" value="maintenance" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="suspended" className="h-4 w-4" defaultChecked={m.suspended} /> Maintenance mode on</label><div><label className="label" htmlFor="mm">Message</label><input id="mm" name="message" className="input" defaultValue={m.message} /></div></ActionForm></Card>
      </div>
    </>
  );
}
