import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id (algorithm 2), OWASP-recommended parameters.
const OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const hashPassword = (pw: string) => hash(pw, OPTIONS);
export async function verifyPassword(hashed: string, pw: string) {
  try { return await verify(hashed, pw); } catch { return false; }
}
let dummy: string | null = null;
/** Keeps response time constant when the account does not exist. */
export async function burnVerify(pw: string) { dummy ??= await hashPassword("timing-equaliser-Aa1!"); await verifyPassword(dummy, pw); }

const COMMON = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwerty123", "iloveyou1", "welcome123", "jesus12345", "christ12345", "godisgood1", "abcd1234", "admin12345", "sundayschool1"]);

/** Returns an error message, or null when acceptable. Privileged accounts need 12+, everyone else 8+. */
export function passwordProblem(pw: string, privileged = false, identity: string[] = []): string | null {
  const min = privileged ? 12 : 8;
  if (pw.length < min) return `Use at least ${min} characters.`;
  if (pw.length > 128) return "Use at most 128 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Include at least one letter and one number.";
  if (COMMON.has(pw.toLowerCase())) return "That password is too common. Choose something less guessable.";
  const low = pw.toLowerCase();
  for (const id of identity) if (id && id.length >= 4 && low.includes(id.toLowerCase())) return "Do not use your name, username or email in your password.";
  return null;
}
