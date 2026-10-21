import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

let warned = false;
function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET (32+ characters) must be configured in production.");
  if (!warned) { warned = true; console.warn("[auth] AUTH_SECRET is not set; using an insecure development secret."); }
  return "dev-only-insecure-secret-do-not-use-in-production-0000";
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
export const hmac = (v: string) => createHmac("sha256", secret()).update(v).digest("hex");
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
/** Human-friendly code without look-alike characters, e.g. "K7QM-4TXP". */
export function friendlyCode(groups = 2, size = 4) {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: groups }, () => Array.from({ length: size }, () => A[randomInt(A.length)]).join("")).join("-");
}
export function temporaryPassword() {
  const pick = (s: string) => s[randomInt(s.length)];
  const U = "ABCDEFGHJKMNPQRSTUVWXYZ", L = "abcdefghjkmnpqrstuvwxyz", D = "23456789", S = "!@#$%*?";
  const chars = [pick(U), pick(L), pick(D), pick(S), ...Array.from({ length: 12 }, () => pick(U + L + D + S))];
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

const aesKey = () => createHash("sha256").update("totp:" + secret()).digest();
/** AES-256-GCM for small secrets stored in the database (TOTP seeds). */
export function seal(plain: string) {
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
export function unseal(sealed: string) {
  const [iv, tag, enc] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", aesKey(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

/** Deterministic PRNG (mulberry32) so a shuffled exam order can be re-derived and verified. */
export function seededRng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffled<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
