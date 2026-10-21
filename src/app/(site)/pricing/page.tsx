import type { Metadata } from "next";
import { SiteSections } from "@/components/sections";

export const metadata: Metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

export default async function Pricing() {
  return <SiteSections sections={[{ id: "p", type: "pricing", data: { title: "Plans for every church", body: "Registration is free. Paid plans add capacity and features, and are set and priced by the Academy. You can change plan at any time." } }]} />;
}
