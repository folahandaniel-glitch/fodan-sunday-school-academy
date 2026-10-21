import Link from "next/link";
import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { listPages } from "@/server/services/cms";
import { getSetting } from "@/server/settings";
import { ActionForm } from "@/components/forms";
import { newPageAction, saveSettingAction } from "@/app/actions/admin";
import { Card, PageHeader, StatusBadge, Table } from "@/components/ui";
import { fmtDateTime } from "@/lib/text";

export const metadata: Metadata = { title: "Website content" };
export const dynamic = "force-dynamic";

export default async function Site() {
  await requirePlatform("site.edit");
  const [pages, nav, footer, contact, social, ann] = await Promise.all([listPages(), getSetting("nav"), getSetting("footer"), getSetting("contact"), getSetting("social"), getSetting("announcement")]);
  return (
    <>
      <PageHeader title="Website content" sub="Edit the public website without touching code. Pages are built from controlled sections; arbitrary HTML and scripts are not allowed." />
      <Table caption="Pages"><thead><tr><th>Page</th><th>Address</th><th>Type</th><th>Status</th><th>Updated</th><th /></tr></thead><tbody>
        {pages.map((p) => (<tr key={p.id}><td className="font-semibold">{p.title}</td><td className="font-mono text-xs">{p.kind === "home" ? "/" : p.kind === "legal" ? `/p/${p.slug}` : `/${p.slug}`}</td><td>{p.kind}</td><td><StatusBadge status={p.draftSections ? "draft" : p.status} />{p.draftSections && <span className="ml-1 text-xs text-mist">unpublished changes</span>}</td><td className="text-xs">{fmtDateTime(p.updatedAt)}</td><td><Link className="btn btn-light btn-sm" href={`/admin/site/${p.slug}`}>Edit</Link></td></tr>))}
      </tbody></Table>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card><h2 className="text-lg">New page</h2><ActionForm action={newPageAction} submit="Create page" className="mt-2"><div className="grid gap-3 sm:grid-cols-2"><div><label className="label" htmlFor="np-title">Title</label><input id="np-title" name="title" className="input" required /></div><div><label className="label" htmlFor="np-slug">Address</label><input id="np-slug" name="slug" className="input" required placeholder="e.g. partners" pattern="[a-z0-9-]+" /></div></div><div><label className="label" htmlFor="np-kind">Type</label><select id="np-kind" name="kind" className="input"><option value="page">Page (/address)</option><option value="legal">Legal page (/p/address)</option></select></div></ActionForm></Card>
        <Card><h2 className="text-lg">Public announcement banner</h2><ActionForm action={saveSettingAction} submit="Save" className="mt-2"><input type="hidden" name="key" value="announcement" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={ann.enabled} className="h-4 w-4" /> Show the banner</label><div><label className="label" htmlFor="a-text">Text</label><input id="a-text" name="text" className="input" defaultValue={ann.text} /></div><div><label className="label" htmlFor="a-href">Link (optional, starts with /)</label><input id="a-href" name="href" className="input" defaultValue={ann.href} /></div></ActionForm></Card>
        <Card><h2 className="text-lg">Navigation links</h2><ActionForm action={saveSettingAction} submit="Save navigation" className="mt-2"><input type="hidden" name="key" value="nav" /><label className="label" htmlFor="nav-items">One per line: Label | /address</label><textarea id="nav-items" name="items" rows={7} className="input font-mono text-sm" defaultValue={nav.map((n) => `${n.label} | ${n.href}`).join("\n")} /></ActionForm></Card>
        <Card><h2 className="text-lg">Footer</h2><ActionForm action={saveSettingAction} submit="Save footer" className="mt-2"><input type="hidden" name="key" value="footer" /><div><label className="label" htmlFor="f-about">About text</label><textarea id="f-about" name="about" rows={3} className="input" defaultValue={footer.about} /></div><div><label className="label" htmlFor="f-links">Footer links (Label | /address)</label><textarea id="f-links" name="links" rows={5} className="input font-mono text-sm" defaultValue={footer.links.map((n) => `${n.label} | ${n.href}`).join("\n")} /></div><div><label className="label" htmlFor="f-c">Copyright line</label><input id="f-c" name="copyright" className="input" defaultValue={footer.copyright} /></div></ActionForm></Card>
        <Card><h2 className="text-lg">Contact information</h2><ActionForm action={saveSettingAction} submit="Save contact details" className="mt-2"><input type="hidden" name="key" value="contact" />{(["email", "phone", "whatsapp", "address", "hours", "website"] as const).map((k) => <div key={k}><label className="label capitalize" htmlFor={`c-${k}`}>{k}</label><input id={`c-${k}`} name={k} className="input" defaultValue={contact[k]} /></div>)}</ActionForm></Card>
        <Card><h2 className="text-lg">Social media links</h2><ActionForm action={saveSettingAction} submit="Save social links" className="mt-2"><input type="hidden" name="key" value="social" />{(["facebook", "youtube", "instagram", "x", "tiktok", "whatsapp", "telegram"] as const).map((k) => <div key={k}><label className="label capitalize" htmlFor={`s-${k}`}>{k}</label><input id={`s-${k}`} name={k} className="input" defaultValue={social[k]} /></div>)}</ActionForm></Card>
      </div>
    </>
  );
}
