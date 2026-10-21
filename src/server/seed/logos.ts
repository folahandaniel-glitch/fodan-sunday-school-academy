import { eq } from "drizzle-orm";
import type { DB } from "../db";
import * as s from "../db/schema";

/** Built-in brand family shipped in /public/brand. The Super Admin can add variants and re-point placements; these are the fallback. */
export const DEFAULT_LOGOS: { label: string; path: string; mime: string; placements: string[] }[] = [
  { label: "Primary horizontal logo (light background)", path: "/brand/horizontal.svg", mime: "image/svg+xml", placements: ["header-light"] },
  { label: "Horizontal logo (dark background)", path: "/brand/horizontal-dark.svg", mime: "image/svg+xml", placements: ["header-dark", "footer"] },
  { label: "Stacked logo", path: "/brand/stacked.svg", mime: "image/svg+xml", placements: ["login", "certificate"] },
  { label: "Emblem", path: "/brand/emblem.svg", mime: "image/svg+xml", placements: [] },
  { label: "Emblem (dark background)", path: "/brand/emblem-dark.svg", mime: "image/svg+xml", placements: [] },
  { label: "Horizontal logo (PNG, for email)", path: "/brand/horizontal.png", mime: "image/png", placements: ["email"] },
  { label: "Favicon (SVG)", path: "/brand/favicon.svg", mime: "image/svg+xml", placements: ["favicon-svg"] },
  { label: "Favicon 32px", path: "/brand/favicon-32.png", mime: "image/png", placements: ["favicon-32"] },
  { label: "Favicon (ICO)", path: "/brand/favicon.ico", mime: "image/x-icon", placements: ["favicon-ico"] },
  { label: "Apple touch icon", path: "/brand/apple-touch-icon.png", mime: "image/png", placements: ["apple-180"] },
  { label: "App icon 192", path: "/brand/icon-192.png", mime: "image/png", placements: ["pwa-192"] },
  { label: "App icon 512", path: "/brand/icon-512.png", mime: "image/png", placements: ["pwa-512"] },
  { label: "Maskable app icon", path: "/brand/maskable-512.png", mime: "image/png", placements: ["pwa-maskable"] },
];

export async function loadDefaultLogos(db: DB) {
  for (const l of DEFAULT_LOGOS) {
    const [have] = await db.select({ id: s.logos.id }).from(s.logos).where(eq(s.logos.builtinPath, l.path));
    if (!have) await db.insert(s.logos).values({ label: l.label, kind: "builtin", mime: l.mime, builtinPath: l.path, placements: l.placements, active: true });
  }
}
