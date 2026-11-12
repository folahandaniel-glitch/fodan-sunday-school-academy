import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { getSetting } from "@/server/settings";
import { ActionForm } from "@/components/forms";
import { WordingFilter } from "@/components/wording-filter";
import { saveWordingAction } from "@/app/actions/admin";
import { Card, PageHeader } from "@/components/ui";
import { UI_TEXT_CATALOG } from "@/lib/ui-text-catalog";

export const metadata: Metadata = { title: "Interface wording" };
export const dynamic = "force-dynamic";

export default async function Wording() {
  await requirePlatform("site.edit");
  const { overrides } = await getSetting("uiText");
  let i = 0;
  const total = UI_TEXT_CATALOG.reduce((n, g) => n + g.items.length, 0);
  const changed = Object.keys(overrides).length;
  return (
    <>
      <PageHeader crumbs={[{ label: "Website content", href: "/admin/site" }, { label: "Interface wording" }]} title="Interface wording" sub="Change the words used in the menus, buttons, headings, sign-in and registration screens and portal pages. The current wording is shown in each box; clear a box to go back to the original. Text in braces, such as {site}, is filled in automatically and should be kept." />
      <Card>
        <p className="text-sm text-mist">{total} texts in {UI_TEXT_CATALOG.length} groups. {changed} currently replaced. Each save is recorded in the audit log.</p>
        <div className="mt-3 max-w-md"><WordingFilter label="Find a text" placeholder="Type part of the wording" /></div>
        <ActionForm action={saveWordingAction} submit="Save wording" className="mt-4">
          {UI_TEXT_CATALOG.map((g, gi) => (
            <details key={g.group} data-wording-group open={gi === 0} className="rounded-xl border border-line p-3">
              <summary className="cursor-pointer font-display text-lg text-navy">{g.group} <span className="text-sm text-mist">({g.items.length})</span></summary>
              <div className="mt-3 space-y-3">
                {g.items.map((orig) => {
                  const n = i++;
                  const cur = overrides[orig] ?? orig;
                  return (
                    <div key={n} data-wording={(orig + " " + cur).toLowerCase()}>
                      <input type="hidden" name={`k.${n}`} value={orig} />
                      <label className="label" htmlFor={`w-${n}`}>{orig.length > 90 ? orig.slice(0, 90) + "…" : orig}{overrides[orig] && <span className="ml-2 text-xs font-normal text-gold-700">changed</span>}</label>
                      {orig.length > 80 || cur.length > 80 ? <textarea id={`w-${n}`} name={`w.${n}`} rows={3} maxLength={800} className="input" defaultValue={cur} /> : <input id={`w-${n}`} name={`w.${n}`} maxLength={800} className="input" defaultValue={cur} />}
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </ActionForm>
      </Card>
    </>
  );
}
