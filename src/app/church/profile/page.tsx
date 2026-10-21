import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { getOrgProfile } from "@/server/services/church";
import { ActionForm } from "@/components/forms";
import { profileOrgAction } from "@/app/actions/staff";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { COUNTRIES, ORG_TYPES, TIMEZONES } from "@/lib/text";
import { can } from "@/server/org";

export const metadata: Metadata = { title: "Church profile" };
export const dynamic = "force-dynamic";

export default async function ChurchProfile() {
  const { ctx } = await requireOrg("classes.view");
  const o = await getOrgProfile(ctx);
  const edit = can(ctx, "org.profile.edit");
  return (
    <>
      <PageHeader title="Church profile" sub="This is your church's identity inside the Academy." actions={<StatusBadge status={o.status} />} />
      <Card>
        <ActionForm action={profileOrgAction} submit="Save profile" hideSubmit={!edit}>
          <fieldset disabled={!edit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="name">Church name</label><input id="name" name="name" className="input" defaultValue={o.name} required /></div>
              <div><label className="label" htmlFor="type">Type</label><select id="type" name="type" className="input" defaultValue={o.type}>{ORG_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className="label" htmlFor="denomination">Denomination</label><input id="denomination" name="denomination" className="input" defaultValue={o.denomination ?? ""} /></div>
              <div><label className="label" htmlFor="country">Country</label><select id="country" name="country" className="input" defaultValue={o.country}>{COUNTRIES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className="label" htmlFor="state">State / region</label><input id="state" name="state" className="input" defaultValue={o.state ?? ""} /></div>
              <div><label className="label" htmlFor="city">City or locality</label><input id="city" name="city" className="input" defaultValue={o.city ?? ""} /></div>
              <div><label className="label" htmlFor="contactEmail">Official email</label><input id="contactEmail" name="contactEmail" type="email" className="input" defaultValue={o.contactEmail ?? ""} /></div>
              <div><label className="label" htmlFor="phone">Telephone</label><input id="phone" name="phone" className="input" defaultValue={o.phone ?? ""} /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="address">Address</label><input id="address" name="address" className="input" defaultValue={o.address ?? ""} /></div>
              <div><label className="label" htmlFor="timezone">Time zone</label><select id="timezone" name="timezone" className="input" defaultValue={o.timezone}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className="label" htmlFor="currency">Currency</label><select id="currency" name="currency" className="input" defaultValue={o.currency}>{["NGN", "USD", "GBP", "GHS", "KES", "ZAR"].map((t) => <option key={t}>{t}</option>)}</select></div>
            </div>
            {edit && <button className="btn btn-primary">Save profile</button>}
          </fieldset>
        </ActionForm>
      </Card>
    </>
  );
}
