import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { listCategories } from "@/server/services/curriculum";
import { ActionForm } from "@/components/forms";
import { createCurriculumAction } from "@/app/actions/admin";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New curriculum" };
export const dynamic = "force-dynamic";

export default async function NewCurriculum() {
  await requirePlatform("curriculum.write");
  const cats = await listCategories();
  return (
    <>
      <PageHeader crumbs={[{ label: "Curriculum library", href: "/admin/curricula" }, { label: "New" }]} title="New curriculum" sub="This creates a draft with 26 empty weekly units (weeks 13, 25 and 26 are the test, examination and revision units). Fill them in the lesson builder, then submit for review." />
      <Card><ActionForm action={createCurriculumAction} submit="Create curriculum">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label" htmlFor="title">Title</label><input id="title" name="title" className="input" required minLength={4} /></div>
          <div><label className="label" htmlFor="categoryId">Category</label><select id="categoryId" name="categoryId" className="input"><option value="">None yet</option>{cats.map(({ c }) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="label" htmlFor="level">Level</label><select id="level" name="level" className="input"><option>Foundation</option><option>Intermediate</option><option>Advanced</option></select></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="audience">Target audience</label><input id="audience" name="audience" className="input" defaultValue="Teens and adults" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="shortDescription">Short description</label><textarea id="shortDescription" name="shortDescription" className="input" rows={2} /></div>
        </div>
      </ActionForm></Card>
    </>
  );
}
