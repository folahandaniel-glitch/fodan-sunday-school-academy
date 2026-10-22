import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";

export const GRADE_SCALE_DEFAULT = [
  { min: 70, grade: "A", label: "Excellent" }, { min: 60, grade: "B", label: "Very good" }, { min: 50, grade: "C", label: "Good" },
  { min: 45, grade: "D", label: "Fair" }, { min: 40, grade: "E", label: "Pass" }, { min: 0, grade: "F", label: "Fail" },
];

/** Every value here can be edited by the Super Admin from the backend. */
export const DEFAULTS = {
  brand: {
    siteName: "Fodan Sunday School Academy", shortName: "FSSA", tagline: "Teach. Learn. Grow in the Word.",
    ministry: "Fodan Gospel Outreach", sponsor: "The Living Youth International", owner: "Banjo Folahan Daniel",
    primary: "#12306B", secondary: "#0A1B3D", accent: "#D8A31A", leaf: "#1F8A70", ivory: "#FFF9EC", headingFont: "serif",
  },
  contact: { email: "folahandaniel@gmail.com", phone: "08067578112", whatsapp: "2348067578112", address: "", hours: "", website: "https://bit.ly/4rSowUy" },
  social: { facebook: "", youtube: "", instagram: "", x: "", tiktok: "", whatsapp: "", telegram: "" },
  nav: [
    { label: "Curriculum Library", href: "/library" }, { label: "How It Works", href: "/how-it-works" }, { label: "For Churches", href: "/for-churches" },
    { label: "Pricing", href: "/pricing" }, { label: "FAQ", href: "/faq" }, { label: "Contact", href: "/contact" },
  ] as { label: string; href: string }[],
  footer: {
    about: "Fodan Sunday School Academy helps churches choose a sound Bible curriculum, organises the whole six-month programme, equips teachers and measures progress. A ministry of Fodan Gospel Outreach, sponsored by The Living Youth International.",
    links: [
      { label: "Privacy notice", href: "/p/privacy" }, { label: "Terms of service", href: "/p/terms" }, { label: "Accessibility", href: "/p/accessibility" },
      { label: "Verify a certificate", href: "/verify" }, { label: "Contact", href: "/contact" },
    ],
    copyright: "Fodan Gospel Outreach. All rights reserved.",
  },
  features: {
    memberRegistrationOpen: true, churchRegistrationOpen: true, requireChurchApproval: false, requireEmailVerification: false,
    allowTypedChurchNames: true, requireChurchAccessCode: false, forumEnabled: true, forumRequiresVerifiedEmail: false,
    requireHumanReview: true, maxFailedLogins: 6, lockMinutes: 15, defaultCurrency: "NGN", graceDays: 7,
    maxUploadMb: 5, aiAssistance: false,
  },
  currencies: [{ code: "NGN", name: "Nigerian naira", symbol: "₦", minorUnits: 2 }, { code: "USD", name: "US dollar", symbol: "$", minorUnits: 2 }, { code: "GBP", name: "Pound sterling", symbol: "£", minorUnits: 2 }, { code: "GHS", name: "Ghanaian cedi", symbol: "GH₵", minorUnits: 2 }, { code: "KES", name: "Kenyan shilling", symbol: "KSh", minorUnits: 2 }, { code: "ZAR", name: "South African rand", symbol: "R", minorUnits: 2 }],
  assessment: { gradeScale: GRADE_SCALE_DEFAULT, defaultPassPercent: 50, midtestMinutes: 45, finalMinutes: 90 },
  bible: { translations: ["bsb", "kjv", "asv"], defaultTranslation: "bsb" },
  logoPlacements: {} as Record<string, string>,
  maintenance: { suspended: false, message: "This service is temporarily unavailable. Please check back soon." },
  announcement: { enabled: false, text: "", href: "" },
  doctrine: {
    position: "This platform teaches from the Bible as the inspired Word of God and affirms the historic Christian faith. Where faithful Christians differ (for example on the timing and details of the end times), lessons present the main views fairly and say plainly that they are disputed. The approved doctrinal statement is edited by the Super Admin.",
  },
  payments: { provider: "paystack", graceDays: 7 },
  certificate: { title: "Certificate of Completion", signatoryName: "Banjo Folahan Daniel", signatoryTitle: "Product Owner, Fodan Gospel Outreach", footerNote: "Verify this certificate at the address shown below." },
};
export type SettingKey = keyof typeof DEFAULTS;
export type Settings = typeof DEFAULTS;

let memo: { at: number; data: Partial<Record<string, unknown>> } | null = null;
/** Short in-process cache (5 s) so every page does not hit the database; writes invalidate it immediately. */
async function load(): Promise<Partial<Record<string, unknown>>> {
  if (memo && Date.now() - memo.at < 5000) return memo.data;
  const db = await getDb();
  const rows = await db.select().from(schema.settings);
  memo = { at: Date.now(), data: Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  return memo.data;
}

function merge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base) || typeof base !== "object") return over as T;
  const o = over as Record<string, unknown>;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(o)) out[k] = k in (base as object) ? merge((base as Record<string, unknown>)[k], o[k]) : o[k];
  return out as T;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const all = await load();
  return merge(DEFAULTS[key], all[key]);
}
/** Uncached read, for code paths that just wrote (and for tests). */
export async function getSettingFresh<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const db = await getDb();
  const [r] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  return merge(DEFAULTS[key], r?.value);
}

export async function setSetting(key: SettingKey, value: unknown, actorId?: string | null) {
  const db = await getDb();
  await db.insert(schema.settings).values({ key, value, updatedBy: actorId ?? null })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedBy: actorId ?? null, updatedAt: new Date() } });
  memo = null;
}
