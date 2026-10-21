import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, PasswordInput } from "@/components/forms";
import { registerChurchAction } from "@/app/actions/auth";
import { getSetting } from "@/server/settings";
import { Alert } from "@/components/ui";
import { COUNTRIES, NG_STATES, ORG_TYPES, TIMEZONES } from "@/lib/text";
import { searchChurches } from "@/server/services/auth";

export const metadata: Metadata = { title: "Register your church" };
export const dynamic = "force-dynamic";

export default async function RegisterChurch({ searchParams }: { searchParams: Promise<{ claim?: string; q?: string }> }) {
  const sp = await searchParams;
  const [f, cur] = await Promise.all([getSetting("features"), getSetting("currencies")]);
  if (!f.churchRegistrationOpen) return <Alert tone="warn">Church registration is currently closed. Please contact the Academy.</Alert>;
  const matches = sp.q ? (await searchChurches(sp.q, 6)).filter((c) => c.status === "unverified") : [];
  const claim = sp.claim ? (await searchChurches(sp.q ?? "", 20)).find((c) => c.id === sp.claim && c.status === "unverified") : undefined;
  return (
    <div className="card card-pad mx-auto max-w-2xl">
      <h1 className="text-2xl">Register your church</h1>
      <p className="mt-1 text-sm text-mist">Create your church&apos;s private workspace and its first administrator account. {f.requireChurchApproval ? "New churches are reviewed by the Academy before they go live." : "Your church is ready to use straight away."}</p>
      {!claim && (
        <form className="mt-4 rounded-xl border border-line p-3 text-sm" role="search"><label className="label" htmlFor="q">Is your church already listed by a member?</label>
          <div className="flex gap-2"><input id="q" name="q" defaultValue={sp.q} className="input" placeholder="Search by name" /><button className="btn btn-light">Search</button></div>
          {matches.map((m) => <p key={m.id} className="mt-2">{m.name} ({[m.city, m.state].filter(Boolean).join(", ")}) · <Link className="font-semibold" href={`/register/church?claim=${m.id}&q=${encodeURIComponent(sp.q ?? "")}`}>This is my church: claim it</Link></p>)}
        </form>
      )}
      {claim && <div className="mt-4"><Alert tone="info">You are claiming the listing <strong>{claim.name}</strong>. Members who have already registered will wait for your approval. <Link href="/register/church">Cancel</Link></Alert></div>}
      <ActionForm action={registerChurchAction} submit="Register church" className="mt-4" submitClass="w-full">
        {claim && <input type="hidden" name="claimOrgId" value={claim.id} />}
        <fieldset className="space-y-3"><legend className="font-display text-lg text-navy">The church</legend>
          <div><label className="label" htmlFor="churchName">Church or ministry name</label><input id="churchName" name="churchName" className="input" required minLength={3} defaultValue={claim?.name} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="type">Type</label><select id="type" name="type" className="input">{ORG_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div><label className="label" htmlFor="denomination">Denomination (optional)</label><input id="denomination" name="denomination" className="input" /></div>
            <div><label className="label" htmlFor="country">Country</label><select id="country" name="country" className="input" defaultValue="Nigeria">{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label" htmlFor="state">State / region</label><input id="state" name="state" className="input" list="ng-states" defaultValue={claim ? "" : ""} /><datalist id="ng-states">{NG_STATES.map((s) => <option key={s} value={s} />)}</datalist></div>
            <div><label className="label" htmlFor="city">City or locality</label><input id="city" name="city" className="input" /></div>
            <div><label className="label" htmlFor="phone">Telephone (optional)</label><input id="phone" name="phone" className="input" type="tel" /></div>
          </div>
          <div><label className="label" htmlFor="address">Address (optional)</label><input id="address" name="address" className="input" /></div>
          <div><label className="label" htmlFor="contactEmail">Official church email</label><input id="contactEmail" name="contactEmail" type="email" className="input" required /></div>
        </fieldset>
        <fieldset className="space-y-3"><legend className="font-display text-lg text-navy">Preferences</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor="language">Language</label><select id="language" name="language" className="input"><option value="en">English</option></select></div>
            <div><label className="label" htmlFor="timezone">Time zone</label><select id="timezone" name="timezone" className="input" defaultValue="Africa/Lagos">{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div><label className="label" htmlFor="currency">Currency</label><select id="currency" name="currency" className="input" defaultValue={f.defaultCurrency}>{cur.map((c) => <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}</select></div>
          </div>
        </fieldset>
        <fieldset className="space-y-3"><legend className="font-display text-lg text-navy">Administrator account</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="adminName">Your full name</label><input id="adminName" name="adminName" className="input" required autoComplete="name" /></div>
            <div><label className="label" htmlFor="adminEmail">Your email</label><input id="adminEmail" name="adminEmail" type="email" className="input" required autoComplete="email" /></div>
          </div>
          <div><label className="label" htmlFor="password">Password</label><PasswordInput id="password" autoComplete="new-password" minLength={12} /><p className="hint">Administrators need at least 12 characters with a letter and a number.</p></div>
        </fieldset>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="acceptTerms" className="mt-1 h-4 w-4" required /> <span>I accept the <Link href="/p/terms">terms of service</Link> and <Link href="/p/privacy">privacy notice</Link> on behalf of this church.</span></label>
      </ActionForm>
    </div>
  );
}
