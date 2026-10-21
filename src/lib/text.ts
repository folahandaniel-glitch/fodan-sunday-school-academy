export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "church";
/** Comparison key for church names: case, punctuation and spacing do not matter. */
export const normName = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export const normEmail = (s: string) => s.trim().toLowerCase();
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;
export const initialsName = (full: string) => {
  const p = full.trim().split(/\s+/);
  return p.length === 1 ? p[0] : `${p[0]} ${p[p.length - 1][0].toUpperCase()}.`;
};
export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const ymd = (d: Date | string | null | undefined) => (d ? (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : "");
export function fmtDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) {
  if (!d) return "Not set";
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00Z" : d) : d;
  return date.toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
}
export function fmtDateTime(d: Date | string | null | undefined, tz = "Africa/Lagos") {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export const COUNTRIES = ["Nigeria", "Ghana", "Kenya", "South Africa", "Uganda", "Tanzania", "Cameroon", "Benin", "Togo", "Sierra Leone", "Liberia", "Zambia", "Zimbabwe", "United Kingdom", "United States", "Canada", "Other"];
export const NG_STATES = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT Abuja", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"];
export const ORG_TYPES = ["Church", "Ministry", "Fellowship", "Chapel", "Parish", "Cathedral", "Mission", "Bible school", "Christian school", "Other"];
export const TIMEZONES = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Africa/Kampala", "Africa/Dar_es_Salaam", "Africa/Douala", "Europe/London", "America/New_York", "America/Toronto", "UTC"];
