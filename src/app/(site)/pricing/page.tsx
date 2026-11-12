import type { Metadata } from "next";
import { SiteSections } from "@/components/sections";
import { getSetting } from "@/server/settings";

export const metadata: Metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

export default async function Pricing() {
  const pt = (await getSetting("pageText")).pricing;
  return <SiteSections sections={[{ id: "p", type: "pricing", data: { title: pt.title, body: pt.intro } }]} />;
}
