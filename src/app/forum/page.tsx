import Link from "next/link";
import type { Metadata } from "next";
import { forumCategories } from "@/server/services/forum";
import { Alert, PageHeader } from "@/components/ui";
import { getSetting } from "@/server/settings";

export const metadata: Metadata = { title: "Community forum" };
export const dynamic = "force-dynamic";

export default async function Forum() {
  const [cats, f] = await Promise.all([forumCategories(), getSetting("features")]);
  return (
    <>
      <PageHeader title="Community forum" sub="A shared space for members of every church. Be kind, be truthful, and keep other people's private details private." />
      {!f.forumEnabled && <Alert tone="warn">The forum is currently closed.</Alert>}
      <ul className="grid gap-3 md:grid-cols-2">
        {cats.map(({ c, threads }) => (
          <li key={c.id}><Link href={`/forum/${c.slug}`} className="card card-pad card-hover block no-underline"><h2 className="text-lg">{c.name}</h2><p className="mt-1 text-sm text-mist">{c.description}</p><p className="mt-2 text-xs font-semibold text-brand">{threads} {threads === 1 ? "thread" : "threads"}{c.staffOnlyPosting && " · staff posts only"}</p></Link></li>
        ))}
      </ul>
    </>
  );
}
