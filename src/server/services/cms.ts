import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { audit, type Actor } from "../audit";
import { getSetting, setSetting, type SettingKey } from "../settings";
import { sanitizeSvg, UnsafeSvgError } from "@/lib/svg";
import { sha256 } from "../crypto";
import type { SiteSection } from "../db/schema";
import { NotFoundError, AccessError } from "../org";

/* ============================ Pages (structured sections, never raw HTML) ============================ */
export const SECTION_TYPES = ["hero", "text", "features", "steps", "categories", "faq", "cta", "contact", "pricing", "founder"] as const;

export async function getPublishedPage(slug: string) {
  const db = await getDb();
  const [p] = await db.select().from(schema.sitePages).where(and(eq(schema.sitePages.slug, slug), eq(schema.sitePages.status, "published")));
  return p ?? null;
}
export async function listPages() {
  const db = await getDb();
  return db.select().from(schema.sitePages).orderBy(schema.sitePages.kind, schema.sitePages.title);
}
export async function getPageForEdit(slug: string) {
  const db = await getDb();
  const [p] = await db.select().from(schema.sitePages).where(eq(schema.sitePages.slug, slug));
  if (!p) throw new NotFoundError("Page not found.");
  return p;
}
function sanitiseSections(sections: SiteSection[]): SiteSection[] {
  if (!Array.isArray(sections) || sections.length > 40) throw new AccessError("Too many sections.");
  const strip = (v: unknown): unknown => typeof v === "string" ? v.replace(/<\s*\/?\s*(script|iframe|object|embed|style|link|meta)[^>]*>/gi, "").replace(/\son\w+\s*=/gi, " ").replace(/javascript:/gi, "").slice(0, 20000)
    : Array.isArray(v) ? v.slice(0, 60).map(strip) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, strip(x)])) : v;
  return sections.map((s, i) => {
    if (!(SECTION_TYPES as readonly string[]).includes(s.type)) throw new AccessError(`Unknown section type “${s.type}”.`);
    return { id: String(s.id || `s${i}`).slice(0, 40), type: s.type, hidden: !!s.hidden, data: strip(s.data) as Record<string, unknown> };
  });
}
export async function savePageDraft(actor: Actor, slug: string, sections: SiteSection[], meta?: { title?: string; seo?: { title?: string; description?: string } }) {
  const db = await getDb();
  const clean = sanitiseSections(sections);
  await db.update(schema.sitePages).set({ draftSections: clean, ...(meta?.title ? { title: meta.title.slice(0, 120) } : {}), ...(meta?.seo ? { seo: meta.seo } : {}), updatedBy: actor.id }).where(eq(schema.sitePages.slug, slug));
  await audit(actor, "site.page_draft_saved", { type: "page", id: slug });
}
export async function publishPage(actor: Actor, slug: string) {
  const db = await getDb();
  const p = await getPageForEdit(slug);
  await db.update(schema.sitePages).set({ sections: p.draftSections ?? p.sections, draftSections: null, status: "published", publishedAt: new Date(), updatedBy: actor.id }).where(eq(schema.sitePages.slug, slug));
  await audit(actor, "site.page_published", { type: "page", id: slug });
}
export async function createPage(actor: Actor, slug: string, title: string, kind: "page" | "legal") {
  const s = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (s.length < 2 || ["admin", "api", "login", "register", "app", "learn", "teach", "church", "forum", "library", "pricing", "p", "verify"].includes(s)) return { ok: false as const, error: "Choose a different page address." };
  const db = await getDb();
  const [e] = await db.select({ id: schema.sitePages.id }).from(schema.sitePages).where(eq(schema.sitePages.slug, s));
  if (e) return { ok: false as const, error: "A page with that address exists." };
  await db.insert(schema.sitePages).values({ slug: s, title: title.trim().slice(0, 120), kind, sections: [{ id: "t1", type: "text", data: { title, body: "Write your content here." } }], status: "draft" });
  await audit(actor, "site.page_created", { type: "page", id: s });
  return { ok: true as const, slug: s };
}

/* ============================ Branding settings ============================ */
const HEX = /^#[0-9a-fA-F]{6}$/;
export async function saveBrand(actor: Actor, patch: Partial<Awaited<ReturnType<typeof getSetting<"brand">>>>) {
  const cur = await getSetting("brand");
  const next = { ...cur, ...patch };
  for (const k of ["primary", "secondary", "accent", "leaf", "ivory"] as const) if (!HEX.test(next[k])) return { ok: false as const, error: `${k} must be a colour like #12306B.` };
  if (contrast(next.primary, "#ffffff") < 4.5) return { ok: false as const, error: "The primary colour is too light for white text (contrast below 4.5:1). Choose a darker colour." };
  await setSetting("brand", next, actor.id);
  await audit(actor, "site.brand_saved", { type: "setting", id: "brand" }, { fields: Object.keys(patch) });
  return { ok: true as const };
}
export async function saveSettingGroup(actor: Actor, key: SettingKey, value: unknown) {
  await setSetting(key, value, actor.id);
  await audit(actor, "site.setting_saved", { type: "setting", id: key });
}
export function contrast(a: string, b: string) {
  const lum = (h: string) => { const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ============================ Media and logos ============================ */
const RASTER = new Map([["image/png", [0x89, 0x50, 0x4e, 0x47]], ["image/jpeg", [0xff, 0xd8, 0xff]], ["image/webp", [0x52, 0x49, 0x46, 0x46]]]);
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export async function storeAsset(actor: Actor | null, file: { name: string; type: string; bytes: Buffer }, opts: { orgId?: string | null; access?: "public" | "private" } = {}) {
  if (file.bytes.length === 0 || file.bytes.length > MAX_LOGO_BYTES) throw new AccessError("The file must be between 1 byte and 2 MB.");
  const sig = RASTER.get(file.type);
  if (!sig || !sig.every((b, i) => file.bytes[i] === b)) throw new AccessError("Only PNG, JPEG or WebP images are accepted (or SVG for logos).");
  let width: number | null = null, height: number | null = null, bytes = file.bytes, mime = file.type;
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(bytes).metadata();
    width = meta.width ?? null; height = meta.height ?? null;
    if (!width || !height || width > 6000 || height > 6000 || width < 16 || height < 16) throw new AccessError("Image dimensions must be between 16 and 6000 pixels.");
    if (width > 1600) { bytes = await sharp(bytes).resize({ width: 1600 }).toBuffer(); const m2 = await sharp(bytes).metadata(); width = m2.width ?? width; height = m2.height ?? height; }
  } catch (e) { if (e instanceof AccessError) throw e; throw new AccessError("That image could not be read."); }
  const db = await getDb();
  const [a] = await db.insert(schema.mediaAssets).values({ ownerScope: opts.orgId ? "organization" : "platform", organizationId: opts.orgId ?? null, filename: file.name.slice(0, 120), mime, size: bytes.length, checksum: sha256(bytes), width, height, access: opts.access ?? "public", data: bytes, uploadedBy: actor?.id ?? null }).returning({ id: schema.mediaAssets.id });
  return a.id;
}
export async function getAsset(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = await getDb();
  const [a] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, id));
  return a ?? null;
}

export async function listLogos() {
  const db = await getDb();
  return db.select().from(schema.logos).where(isNull(schema.logos.organizationId)).orderBy(desc(schema.logos.createdAt));
}
export async function uploadLogo(actor: Actor, label: string, file: { name: string; type: string; bytes: Buffer }) {
  const db = await getDb();
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
    if (file.bytes.length > 600_000) throw new AccessError("SVG logos must be under 600 KB.");
    let svg: string;
    try { svg = sanitizeSvg(file.bytes.toString("utf8")); } catch (e) { if (e instanceof UnsafeSvgError) throw new AccessError(e.message); throw e; }
    const [l] = await db.insert(schema.logos).values({ label: label.trim().slice(0, 80) || file.name, kind: "svg", mime: "image/svg+xml", svg, placements: [], active: true }).returning({ id: schema.logos.id });
    await audit(actor, "brand.logo_uploaded", { type: "logo", id: l.id });
    return l.id;
  }
  const assetId = await storeAsset(actor, file, { access: "public" });
  const [l] = await db.insert(schema.logos).values({ label: label.trim().slice(0, 80) || file.name, kind: "raster", mime: file.type, assetId, placements: [], active: true }).returning({ id: schema.logos.id });
  await audit(actor, "brand.logo_uploaded", { type: "logo", id: l.id });
  return l.id;
}
/** Points a placement (e.g. "header-light" or "favicon-32") at one logo variant. A placement has exactly one logo; others are untouched. */
export async function setPlacement(actor: Actor, logoId: string, placement: string, on: boolean) {
  const db = await getDb();
  const rows = await db.select().from(schema.logos).where(isNull(schema.logos.organizationId));
  const target = rows.find((r) => r.id === logoId);
  if (!target) throw new NotFoundError();
  await db.transaction(async (tx) => {
    for (const r of rows) {
      const has = r.placements.includes(placement);
      if (r.id === logoId && on && !has) await tx.update(schema.logos).set({ placements: [...r.placements, placement] }).where(eq(schema.logos.id, r.id));
      else if (r.id === logoId && !on && has) await tx.update(schema.logos).set({ placements: r.placements.filter((p) => p !== placement) }).where(eq(schema.logos.id, r.id));
      else if (r.id !== logoId && on && has) await tx.update(schema.logos).set({ placements: r.placements.filter((p) => p !== placement) }).where(eq(schema.logos.id, r.id));
    }
  });
  await audit(actor, "brand.placement_set", { type: "logo", id: logoId }, { placement, on });
}
export async function removeLogo(actor: Actor, logoId: string) {
  const db = await getDb();
  const [l] = await db.select().from(schema.logos).where(eq(schema.logos.id, logoId));
  if (!l) throw new NotFoundError();
  if (l.kind === "builtin") { await db.update(schema.logos).set({ active: false, placements: [] }).where(eq(schema.logos.id, logoId)); }
  else await db.delete(schema.logos).where(eq(schema.logos.id, logoId));
  await audit(actor, "brand.logo_removed", { type: "logo", id: logoId });
}
/** The logo for a placement; falls back to the built-in default so the brand never disappears. */
export async function logoFor(placement: string) {
  const db = await getDb();
  const [l] = await db.select().from(schema.logos).where(and(eq(schema.logos.active, true), isNull(schema.logos.organizationId), sql`${schema.logos.placements} @> ${JSON.stringify([placement])}::jsonb`)).orderBy(desc(schema.logos.createdAt)).limit(1);
  return l ?? null;
}
