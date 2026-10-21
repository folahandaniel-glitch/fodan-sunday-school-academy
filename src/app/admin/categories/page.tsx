import type { Metadata } from "next";
import { requirePlatform } from "@/server/guards";
import { listCategories } from "@/server/services/curriculum";
import { ActionForm } from "@/components/forms";
import { categoryAction } from "@/app/actions/admin";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Curriculum categories" };
export const dynamic = "force-dynamic";

export default async function Categories() {
  await requirePlatform("curriculum.write");
  const cats = await listCategories();
  return (
    <>
      <PageHeader title="Curriculum categories" sub="Categories organise the library and the public website." />
      <div className="space-y-3">
        {cats.map(({ c, total, published }) => (
          <Card key={c.id}><ActionForm action={categoryAction} submit="Save" className="!space-y-2"><input type="hidden" name="id" value={c.id} />
            <div className="grid gap-3 sm:grid-cols-[2fr_3fr_6rem]"><div><label className="label" htmlFor={`n${c.id}`}>Name</label><input id={`n${c.id}`} name="name" className="input" defaultValue={c.name} /></div><div><label className="label" htmlFor={`d${c.id}`}>Description</label><input id={`d${c.id}`} name="description" className="input" defaultValue={c.description} /></div><div><label className="label" htmlFor={`o${c.id}`}>Order</label><input id={`o${c.id}`} name="sortOrder" type="number" className="input" defaultValue={c.sortOrder} /></div></div>
            <p className="text-xs text-mist">{total} curricula · {published} published</p></ActionForm></Card>
        ))}
      </div>
      <Card className="mt-6"><h2 className="text-lg">Add a category</h2><ActionForm action={categoryAction} submit="Add" className="mt-2" resetOnSuccess><div className="grid gap-3 sm:grid-cols-[2fr_3fr]"><div><label className="label" htmlFor="nn">Name</label><input id="nn" name="name" className="input" required /></div><div><label className="label" htmlFor="nd">Description</label><input id="nd" name="description" className="input" /></div></div></ActionForm></Card>
    </>
  );
}
