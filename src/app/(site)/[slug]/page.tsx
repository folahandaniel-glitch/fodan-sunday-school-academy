import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedPage } from "@/server/services/cms";
import { SiteSections } from "@/components/sections";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPublishedPage((await params).slug);
  return p ? { title: p.seo.title || p.title, description: p.seo.description } : {};
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPublishedPage(slug);
  if (!page || page.kind === "home" || page.kind === "legal") notFound();
  return <SiteSections sections={page.sections} />;
}
