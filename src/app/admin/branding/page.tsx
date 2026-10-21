import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { getSetting } from "@/server/settings";
import { listLogos, contrast } from "@/server/services/cms";
import { ActionButton, ActionForm } from "@/components/forms";
import { placementAction, removeLogoAction, saveBrandAction, uploadLogoAction } from "@/app/actions/admin";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Branding and logos" };
export const dynamic = "force-dynamic";

const PLACEMENTS: [string, string][] = [["header-light", "Website header (light background)"], ["header-dark", "Application sidebar (dark background)"], ["login", "Sign-in and registration screens, home banner"], ["footer", "Website footer"], ["certificate", "Certificates"], ["email", "Emails"], ["favicon-svg", "Favicon (SVG)"], ["favicon-32", "Favicon 32px (PNG)"], ["favicon-ico", "Favicon (.ico)"], ["apple-180", "Apple touch icon"], ["pwa-192", "App icon 192"], ["pwa-512", "App icon 512"], ["pwa-maskable", "Maskable app icon"]];

export default async function Branding() {
  await requirePlatform("branding.edit");
  const [b, logos] = await Promise.all([getSetting("brand"), listLogos()]);
  const colour = (name: keyof typeof b, label: string) => (<div><label className="label" htmlFor={String(name)}>{label}</label><div className="flex gap-2"><input id={String(name)} name={String(name)} type="color" defaultValue={String(b[name])} className="h-11 w-14 rounded border border-line" aria-label={label} /><input aria-label={`${label} hex value`} className="input" defaultValue={String(b[name])} readOnly /></div></div>);
  return (
    <>
      <PageHeader title="Branding and logos" sub="The platform brand is separate from any church's branding. Removing a custom logo always falls back to the built-in Fodan Sunday School Academy brand." />
      <Card><h2 className="text-lg">Name, tagline and colours</h2>
        <ActionForm action={saveBrandAction} submit="Save branding" className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="siteName">Product name</label><input id="siteName" name="siteName" className="input" defaultValue={b.siteName} required /></div><div><label className="label" htmlFor="shortName">Short name</label><input id="shortName" name="shortName" className="input" defaultValue={b.shortName} required /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="tagline">Tagline</label><input id="tagline" name="tagline" className="input" defaultValue={b.tagline} /></div>
            <div><label className="label" htmlFor="ministry">Ministry</label><input id="ministry" name="ministry" className="input" defaultValue={b.ministry} /></div><div><label className="label" htmlFor="sponsor">Sponsor</label><input id="sponsor" name="sponsor" className="input" defaultValue={b.sponsor} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">{colour("primary", "Primary (buttons, links)")}{colour("secondary", "Deep navy (headings, sidebar)")}{colour("accent", "Accent gold")}{colour("leaf", "Success green")}{colour("ivory", "Soft background")}</div>
          <p className="hint">The primary colour must stay dark enough for white text (contrast {contrast(b.primary, "#ffffff").toFixed(1)}:1 now; at least 4.5:1 is required). Changes apply to every page immediately.</p>
        </ActionForm></Card>
      <h2 className="mb-2 mt-8 text-lg">Logo library</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {logos.map((l) => (
          <Card key={l.id} className={l.active ? "" : "opacity-50"}>
            <div className="flex items-start gap-3"><div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg border border-line bg-[repeating-conic-gradient(#f3efe0_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]"><img src={`/api/logo/${l.id}`} alt={l.label} className="max-h-16 max-w-28 object-contain" /></div>
              <div className="min-w-0"><p className="font-semibold text-navy">{l.label}</p><p className="text-xs text-mist">{l.kind}{!l.active && " · removed"}</p><p className="mt-1 flex flex-wrap gap-1">{l.placements.map((p) => <Badge key={p} tone="info">{p}</Badge>)}</p></div></div>
            {l.active && (
              <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-brand">Where it is used</summary>
                <ul className="mt-2 space-y-1 text-sm">{PLACEMENTS.map(([k, label]) => { const on = l.placements.includes(k); return <li key={k} className="flex items-center justify-between gap-2"><span>{label}</span><ActionButton action={placementAction} fields={{ logoId: l.id, placement: k, on: on ? "0" : "1" }} label={on ? "Stop using" : "Use here"} tone={on ? "danger" : "light"} /></li>; })}</ul>
                <div className="mt-3"><ActionButton action={removeLogoAction} fields={{ id: l.id }} label="Remove this logo" tone="danger" confirm="Remove this logo variant? Places using it fall back to the default brand." /></div></details>
            )}
          </Card>
        ))}
      </div>
      <Card className="mt-6"><h2 className="text-lg">Upload a logo variant</h2><p className="text-sm text-mist">SVG (sanitised: scripts and external links are stripped), PNG, JPEG or WebP; up to 2 MB; images between 16 and 6000 pixels; large images are resized for the web. Raster logos are served as uploaded and optimised to 1600 pixels wide.</p>
        <ActionForm action={uploadLogoAction} submit="Upload" className="mt-3" resetOnSuccess><div className="grid gap-3 sm:grid-cols-2"><div><label className="label" htmlFor="label">Label</label><input id="label" name="label" className="input" placeholder="e.g. Anniversary logo" required /></div><div><label className="label" htmlFor="file">Image</label><input id="file" name="file" type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" className="input" required /></div></div></ActionForm></Card>
    </>
  );
}
