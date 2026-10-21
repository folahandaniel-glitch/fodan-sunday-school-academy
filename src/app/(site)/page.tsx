import { getPublishedPage } from "@/server/services/cms";
import { SiteSections } from "@/components/sections";

export const dynamic = "force-dynamic";

export default async function Home() {
  const page = await getPublishedPage("home");
  return page ? <SiteSections sections={page.sections} /> : null;
}
