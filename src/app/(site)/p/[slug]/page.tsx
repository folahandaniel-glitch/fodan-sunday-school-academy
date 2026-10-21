import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedPage } from "@/server/services/cms";
import { SiteSections } from "@/components/sections";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPublishedPage((await params).slug);
  return { title: p?.title ?? "Page" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = await getPublishedPage((await params).slug);
  if (!page) notFound();
  return <SiteSections sections={page.sections} />;
}
