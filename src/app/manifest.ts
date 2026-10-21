import type { MetadataRoute } from "next";
import { getSetting } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await getSetting("brand");
  return {
    name: b.siteName, short_name: b.shortName, description: b.tagline, start_url: "/", display: "standalone", background_color: b.ivory, theme_color: b.secondary,
    icons: [
      { src: "/icons/pwa-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/pwa-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/pwa-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
