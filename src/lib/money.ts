/** Money is always integer minor units (kobo, cents). Never floats. */
const MINOR: Record<string, number> = { NGN: 2, USD: 2, GBP: 2, EUR: 2, GHS: 2, KES: 2, ZAR: 2, UGX: 0, JPY: 0, RWF: 0, XOF: 0, KWD: 3 };
const SYMBOL: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€", GHS: "GH₵", KES: "KSh", ZAR: "R", UGX: "USh" };

export const minorUnits = (cur: string) => MINOR[cur.toUpperCase()] ?? 2;
export function formatMoney(amountMinor: number, currency: string) {
  const mu = minorUnits(currency);
  const major = amountMinor / 10 ** mu;
  const num = major.toLocaleString("en-NG", { minimumFractionDigits: mu, maximumFractionDigits: mu });
  return `${SYMBOL[currency.toUpperCase()] ?? currency.toUpperCase() + " "}${num}`;
}
/** Parses a user-entered major amount ("1500.50") to minor units with exact decimal handling. Returns null when invalid. */
export function toMinor(input: string, currency: string): number | null {
  const mu = minorUnits(currency);
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  if (f.length > mu) return null;
  return Number(w) * 10 ** mu + Number((f + "0".repeat(mu)).slice(0, mu) || 0);
}
