import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import "./globals.css";
import { getSetting } from "@/server/settings";
import { mix } from "@/lib/color";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getSetting("brand");
  return {
    title: { default: `${b.siteName} | ${b.tagline}`, template: `%s | ${b.siteName}` },
    description: `${b.siteName}: choose a Bible curriculum, schedule a full six-month programme, teach with structured notes and assess with CBT examinations. A ministry of ${b.ministry}.`,
    applicationName: b.siteName,
    icons: { icon: [{ url: "/icons/favicon-svg", type: "image/svg+xml" }, { url: "/icons/favicon-32", sizes: "32x32", type: "image/png" }, { url: "/favicon.ico", sizes: "48x48" }], apple: "/icons/apple-180" },
    manifest: "/manifest.webmanifest",
    openGraph: { title: b.siteName, description: b.tagline, siteName: b.siteName, type: "website" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const b = await getSetting("brand");
  return { themeColor: b.secondary, width: "device-width", initialScale: 1 };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const b = await getSetting("brand");
  const style = {
    "--color-brand": b.primary, "--color-brand-700": mix(b.primary, "#000000", 0.2), "--color-brand-50": mix(b.primary, "#ffffff", 0.92),
    "--color-navy": b.secondary, "--color-gold": b.accent, "--color-gold-50": mix(b.accent, "#ffffff", 0.85), "--color-leaf": b.leaf, "--color-leaf-50": mix(b.leaf, "#ffffff", 0.88), "--color-ivory": b.ivory,
  } as CSSProperties;
  return (
    <html lang="en" style={style}>
      <body>
        <a href="#main" className="skip-link">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
