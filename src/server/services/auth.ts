import "server-only";
import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import * as OTPAuth from "otpauth";
import { getDb, schema, type DB, type Tx } from "../db";
import { hashPassword, verifyPassword, burnVerify, passwordProblem } from "../auth/password";
import { friendlyCode, hmac, randomToken, safeEqual, seal, unseal } from "../crypto";
import { getSetting } from "../settings";
import { rateLimit } from "../rate-limit";
import { audit, type Actor } from "../audit";
import { emailAdminsOf, notify, queueEmail } from "./notify";
import { isEmail, normEmail, normName, slugify } from "@/lib/text";
import { platformCan } from "@/lib/permissions";
import { appUrl } from "../url";
import { checkAccessCode, redeemAccessCodeTx } from "./access-codes";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };
const fail = (error: string, field?: string): { ok: false; error: string; field?: string } => ({ ok: false, error, field });

const email = z.string().trim().max(254).refine(isEmail, "Enter a valid email address.");
const name = z.string().trim().min(2, "Enter your full name.").max(120);

export const churchRegistrationSchema = z.object({
  churchName: z.string().trim().min(3, "Enter the church or ministry name.").max(160),
  type: z.string().trim().max(40).default("Church"),
  denomination: z.string().trim().max(120).optional().default(""),
  country: z.string().trim().min(2).max(80).default("Nigeria"),
  state: z.string().trim().max(80).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  contactEmail: email,
  phone: z.string().trim().max(30).optional().default(""),
  adminName: name,
  adminEmail: email,
  password: z.string().min(8).max(128),
  language: z.string().trim().max(10).default("en"),
  timezone: z.string().trim().max(60).default("Africa/Lagos"),
  currency: z.string().trim().length(3).default("NGN"),
  acceptTerms: z.literal(true, { error: "You must accept the terms to continue." }),
  claimOrgId: z.string().uuid().optional(),
  accessCode: z.string().trim().max(40).optional().default(""),
});
export type ChurchRegistration = z.input<typeof churchRegistrationSchema>;

export const memberRegistrationSchema = z.object({
  fullName: name,
  email: email,
  password: z.string().min(8).max(128),
  role: z.enum(["learner", "teacher"]).default("learner"),
  orgId: z.string().uuid().optional(),
  typedChurch: z.object({ name: z.string().trim().min(3).max(160), city: z.string().trim().max(120).optional().default(""), state: z.string().trim().max(80).optional().default(""), country: z.string().trim().max(80).default("Nigeria") }).optional(),
  joinCode: z.string().trim().max(20).optional().default(""),
  isThirteenOrOlder: z.literal(true, { error: "You must be 13 or older to register yourself. Ask your church to create a child account." }),
  acceptTerms: z.literal(true, { error: "You must accept the terms to continue." }),
});
export type MemberRegistration = z.input<typeof memberRegistrationSchema>;

async function uniqueSlug(db: DB | Tx, base: string) {
  const root = slugify(base);
  for (let i = 0; i < 8; i++) {
    const slug = i === 0 ? root : `${root}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const [e] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, slug));
    if (!e) return slug;
  }
  return `${root}-${Date.now()}`;
}

async function freePlanId(db: DB | Tx) {
  const [p] = await db.select({ id: schema.subscriptionPlans.id }).from(schema.subscriptionPlans).where(eq(schema.subscriptionPlans.code, "free"));
  return p?.id;
}

async function issueEmailVerification(userId: string, to: string, db?: DB | Tx) {
  const d = db ?? (await getDb());
  const token = randomToken(32);
  await d.insert(schema.authTokens).values({ userId, kind: "email_verify", tokenHash: hmac(token), expiresAt: new Date(Date.now() + 48 * 3_600_000) });
  await queueEmail(to, "Confirm your email address", `Welcome to Fodan Sunday School Academy.\n\nConfirm your email address by opening this link within 48 hours:\n${appUrl()}/verify-email/${token}\n`, undefined, d);
  return token;
}

/** Church leader registration. Creates the church and its first administrator in ONE transaction. */
export async function registerChurch(input: ChurchRegistration, actor: Actor | null = null): Promise<Result<{ userId: string; orgId: string; status: string; joinCode: string }>> {
  const f = await getSetting("features");
  if (!f.churchRegistrationOpen) return fail("Church registration is currently closed.");
  const p = churchRegistrationSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message, String(p.error.issues[0].path[0] ?? ""));
  const d = p.data;
  if (actor?.ip && !(await rateLimit(`reg:church:${actor.ip}`, 6, 3600))) return fail("Too many registrations from this connection. Please try again later.");
  const problem = passwordProblem(d.password, true, [d.adminName, d.adminEmail]);
  if (problem) return fail(problem, "password");
  const em = normEmail(d.adminEmail);
  const db = await getDb();
  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.normalizedEmail, em));
  if (taken) return fail("An account with this email already exists. Sign in instead.", "adminEmail");
  if (f.requireChurchAccessCode && !d.accessCode) return fail("Enter the access code the Academy gave your church.", "accessCode");
  if (d.accessCode) { const ck = await checkAccessCode(d.accessCode); if (!ck.ok) return ck; }
  const hash = await hashPassword(d.password);
  const status = f.requireChurchApproval ? "pending" : "active";
  try {
    const out = await db.transaction(async (tx) => {
      const [user] = await tx.insert(schema.users).values({ fullName: d.adminName, email: d.adminEmail.trim(), normalizedEmail: em, passwordHash: hash, timezone: d.timezone }).returning({ id: schema.users.id });
      let orgId: string;
      if (d.claimOrgId) {
        const [o] = await tx.select().from(schema.organizations).where(eq(schema.organizations.id, d.claimOrgId)).for("update");
        if (!o || o.status !== "unverified") throw new Error("CLAIM_UNAVAILABLE");
        await tx.update(schema.organizations).set({ name: d.churchName, normalizedName: normName(d.churchName), type: d.type, denomination: d.denomination || null, country: d.country, state: d.state || null, city: d.city || null, address: d.address || null, contactEmail: d.contactEmail, phone: d.phone || null, timezone: d.timezone, currency: d.currency, language: d.language, status, verifiedAt: status === "active" ? new Date() : null }).where(eq(schema.organizations.id, o.id));
        orgId = o.id;
      } else {
        const slug = await uniqueSlug(tx, d.churchName);
        const [o] = await tx.insert(schema.organizations).values({ name: d.churchName, normalizedName: normName(d.churchName), slug, type: d.type, denomination: d.denomination || null, country: d.country, state: d.state || null, city: d.city || null, address: d.address || null, contactEmail: d.contactEmail, phone: d.phone || null, timezone: d.timezone, currency: d.currency, language: d.language, status, joinCode: friendlyCode(), createdByUserId: user.id, verifiedAt: status === "active" ? new Date() : null }).returning({ id: schema.organizations.id });
        orgId = o.id;
      }
      await tx.insert(schema.organizationMemberships).values({ organizationId: orgId, userId: user.id, role: "church_admin", status: "active", joinedAt: new Date() }).onConflictDoNothing();
      const [o2] = await tx.select({ jc: schema.organizations.joinCode }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
      if (!o2.jc) await tx.update(schema.organizations).set({ joinCode: friendlyCode() }).where(eq(schema.organizations.id, orgId));
      const plan = await freePlanId(tx);
      if (plan) await tx.insert(schema.organizationSubscriptions).values({ organizationId: orgId, planId: plan, status: "active", source: "default" });
      if (d.accessCode) await redeemAccessCodeTx(tx, d.accessCode, orgId, user.id);
      await audit(actor, d.claimOrgId ? "church.claimed" : "church.registered", { type: "organization", id: orgId }, { adminUserId: user.id }, { orgId, db: tx });
      const [jc] = await tx.select({ jc: schema.organizations.joinCode }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
      return { userId: user.id, orgId, joinCode: jc?.jc ?? "" };
    });
    if (f.requireEmailVerification) await issueEmailVerification(out.userId, d.adminEmail.trim());
    await queueEmail(d.adminEmail.trim(), "Your church is registered", `Your church "${d.churchName}" is registered on Fodan Sunday School Academy${status === "pending" ? " and is waiting for approval" : ""}. Sign in to choose a curriculum and invite your teachers.

Your church member code is ${out.joinCode}. Give it to your members: when they register and choose your church, entering this code approves them straight away. Keep it within your church; you can see it any time on your church dashboard.`, `welcome:${out.userId}`);
    return { ok: true, ...out, status };
  } catch (e) {
    if ((e as Error).message === "BAD_ACCESS_CODE") return fail("That access code could not be used. It may have just been used or withdrawn. Please contact the Academy.", "accessCode");
    if ((e as Error).message === "CLAIM_UNAVAILABLE") return fail("That church listing is no longer available to claim. Register it as a new church or search again.");
    throw e;
  }
}

/** Church names members can pick from. Reveals only public listing facts. */
export async function searchChurches(q: string, limit = 12) {
  const term = q.trim();
  if (term.length < 2) return [];
  const db = await getDb();
  const like = `%${term.replace(/[%_]/g, "")}%`;
  return db.select({ id: schema.organizations.id, name: schema.organizations.name, city: schema.organizations.city, state: schema.organizations.state, country: schema.organizations.country, status: schema.organizations.status })
    .from(schema.organizations)
    .where(and(inArray(schema.organizations.status, ["active", "unverified"]), or(ilike(schema.organizations.name, like), ilike(schema.organizations.city, like))))
    .orderBy(asc(schema.organizations.name)).limit(limit);
}

/** Member registration. The member picks a church or types a new name; they only get that church's features once approved. */
export async function registerMember(input: MemberRegistration, actor: Actor | null = null): Promise<Result<{ userId: string; orgId: string; membership: "active" | "pending"; orgStatus: string }>> {
  const f = await getSetting("features");
  if (!f.memberRegistrationOpen) return fail("Member registration is currently closed.");
  const p = memberRegistrationSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message, String(p.error.issues[0].path[0] ?? ""));
  const d = p.data;
  if (!d.orgId && !d.typedChurch) return fail("Choose your church from the list, or type its name.", "church");
  if (d.typedChurch && !f.allowTypedChurchNames) return fail("Please choose your church from the list.", "church");
  if (actor?.ip && !(await rateLimit(`reg:member:${actor.ip}`, 15, 3600))) return fail("Too many registrations from this connection. Please try again later.");
  const problem = passwordProblem(d.password, false, [d.fullName, d.email]);
  if (problem) return fail(problem, "password");
  const em = normEmail(d.email);
  const db = await getDb();
  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.normalizedEmail, em));
  if (taken) return fail("An account with this email already exists. Sign in instead.", "email");
  const hash = await hashPassword(d.password);
  try {
    const out = await db.transaction(async (tx) => {
      const [user] = await tx.insert(schema.users).values({ fullName: d.fullName, email: d.email.trim(), normalizedEmail: em, passwordHash: hash }).returning({ id: schema.users.id });
      let orgId: string, orgStatus: string, membership: "active" | "pending" = "pending";
      if (d.orgId) {
        const [o] = await tx.select().from(schema.organizations).where(eq(schema.organizations.id, d.orgId));
        if (!o || o.status === "suspended" || o.status === "pending") throw new Error("CHURCH_UNAVAILABLE");
        orgId = o.id; orgStatus = o.status;
        const codeOk = !!d.joinCode && !!o.joinCode && safeEqual(d.joinCode.toUpperCase(), o.joinCode.toUpperCase());
        if (o.status === "active" && d.role === "learner" && (codeOk || o.autoApproveMembers)) membership = "active";
        if (d.joinCode && !codeOk) throw new Error("BAD_CODE");
      } else {
        const t = d.typedChurch!;
        const key = normName(t.name);
        const dup = await tx.select({ id: schema.organizations.id, name: schema.organizations.name }).from(schema.organizations)
          .where(and(eq(schema.organizations.normalizedName, key), inArray(schema.organizations.status, ["active", "unverified"]), t.city ? ilike(schema.organizations.city, t.city) : sql`true`)).limit(1);
        if (dup.length) throw new Error("DUPLICATE_CHURCH:" + dup[0].name);
        const slug = await uniqueSlug(tx, t.name);
        const [o] = await tx.insert(schema.organizations).values({ name: t.name, normalizedName: key, slug, country: t.country, state: t.state || null, city: t.city || null, status: "unverified", createdByUserId: user.id }).returning({ id: schema.organizations.id });
        orgId = o.id; orgStatus = "unverified";
      }
      await tx.insert(schema.organizationMemberships).values({ organizationId: orgId, userId: user.id, role: d.role, status: membership, joinedAt: membership === "active" ? new Date() : null });
      await audit(actor, "member.registered", { type: "user", id: user.id }, { orgId, membership, typedChurch: !d.orgId }, { orgId, db: tx });
      return { userId: user.id, orgId, orgStatus, membership };
    });
    if (out.membership === "pending" && out.orgStatus === "active") await emailAdminsOf(out.orgId, "New member waiting for approval", `${d.fullName} has registered and is waiting for your approval in Members.`, `pending:${out.userId}`);
    if (f.requireEmailVerification) await issueEmailVerification(out.userId, d.email.trim());
    await queueEmail(d.email.trim(), "Welcome to Fodan Sunday School Academy", out.membership === "active" ? "Your account is ready. Sign in to see your church's lessons." : "Your account is ready. Your church must approve you before you can see its classes and lessons. In the meantime, you can join the community forum.", `welcome:${out.userId}`);
    return { ok: true, userId: out.userId, orgId: out.orgId, membership: out.membership, orgStatus: out.orgStatus };
  } catch (e) {
    const m = (e as Error).message;
    if (m === "CHURCH_UNAVAILABLE") return fail("That church is not available for registration right now.", "church");
    if (m === "BAD_CODE") return fail("That church member code is not correct. Ask your church for the right code, or leave it blank and wait for approval.", "joinCode");
    if (m.startsWith("DUPLICATE_CHURCH:")) return fail(`“${m.slice(17)}” is already listed. Please search for it and select it instead of typing it again.`, "church");
    throw e;
  }
}

export async function findUserByIdentifier(identifier: string) {
  const db = await getDb();
  const id = identifier.trim();
  const [u] = await db.select().from(schema.users).where(id.includes("@") ? eq(schema.users.normalizedEmail, normEmail(id)) : eq(schema.users.username, id.toLowerCase()));
  return u ?? null;
}

export type LoginResult = { ok: true; userId: string; mfaRequired: boolean; mustChangePassword: boolean } | { ok: false; error: string };

export async function authenticate(identifier: string, password: string, ip: string | null): Promise<LoginResult> {
  const f = await getSetting("features");
  if (ip && !(await rateLimit(`login:ip:${ip}`, 40, 900))) return { ok: false, error: "Too many attempts. Please wait a few minutes and try again." };
  if (!(await rateLimit(`login:id:${identifier.trim().toLowerCase().slice(0, 120)}`, 12, 900))) return { ok: false, error: "Too many attempts for this account. Please wait a few minutes." };
  const generic = { ok: false as const, error: "Incorrect email/username or password." };
  const u = await findUserByIdentifier(identifier);
  if (!u) { await burnVerify(password); return generic; }
  if (u.lockedUntil && u.lockedUntil > new Date()) return { ok: false, error: "This account is temporarily locked after repeated failed sign-ins. Try again later or reset your password." };
  const ok = await verifyPassword(u.passwordHash, password);
  const db = await getDb();
  if (!ok) {
    const n = u.failedLogins + 1;
    const lock = n >= f.maxFailedLogins;
    await db.update(schema.users).set({ failedLogins: lock ? 0 : n, lockedUntil: lock ? new Date(Date.now() + f.lockMinutes * 60_000) : null }).where(eq(schema.users.id, u.id));
    if (lock) await audit({ id: u.id, label: u.fullName, ip }, "auth.locked", { type: "user", id: u.id });
    return generic;
  }
  if (u.status === "suspended" || u.status === "deactivated") return { ok: false, error: "This account is not active. Contact your church administrator or the Academy." };
  if (f.requireEmailVerification && !u.emailVerifiedAt && u.email) return { ok: false, error: "Please confirm your email address first. Check your inbox for the confirmation link." };
  await db.update(schema.users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  return { ok: true, userId: u.id, mfaRequired: u.totpEnabled, mustChangePassword: u.mustChangePassword };
}

/* ---------- password reset / email verification ---------- */
export async function requestPasswordReset(identifier: string, ip: string | null) {
  if (ip && !(await rateLimit(`reset:ip:${ip}`, 8, 3600))) return;
  const u = await findUserByIdentifier(identifier);
  if (!u || !u.email) return; // always respond the same way
  const db = await getDb();
  const token = randomToken(32);
  await db.insert(schema.authTokens).values({ userId: u.id, kind: "password_reset", tokenHash: hmac(token), expiresAt: new Date(Date.now() + 30 * 60_000) });
  await queueEmail(u.email, "Reset your password", `Open this link within 30 minutes to choose a new password:\n${appUrl()}/reset-password/${token}\n\nIf you did not ask for this, ignore this message.`);
  if (process.env.NODE_ENV !== "production") console.info(`[dev] password reset link: /reset-password/${token}`);
}

export async function completePasswordReset(token: string, newPassword: string): Promise<Result> {
  const db = await getDb();
  const [t] = await db.select().from(schema.authTokens).where(and(eq(schema.authTokens.tokenHash, hmac(token)), eq(schema.authTokens.kind, "password_reset"), isNull(schema.authTokens.usedAt)));
  if (!t || t.expiresAt < new Date()) return fail("This reset link has expired or was already used. Request a new one.");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, t.userId));
  const problem = passwordProblem(newPassword, u.platformRole !== "member", [u.fullName, u.email ?? "", u.username ?? ""]);
  if (problem) return fail(problem, "password");
  const hash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(schema.authTokens).set({ usedAt: new Date() }).where(eq(schema.authTokens.id, t.id));
    await tx.update(schema.users).set({ passwordHash: hash, mustChangePassword: false, failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, u.id));
    await tx.update(schema.sessions).set({ revokedAt: new Date() }).where(and(eq(schema.sessions.userId, u.id), isNull(schema.sessions.revokedAt)));
    await audit({ id: u.id, label: u.fullName }, "auth.password_reset", { type: "user", id: u.id }, {}, { db: tx });
  });
  return { ok: true };
}

export async function changePassword(userId: string, current: string | null, next: string): Promise<Result> {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) return fail("Account not found.");
  if (current !== null && !(await verifyPassword(u.passwordHash, current))) return fail("Your current password is not correct.", "current");
  const problem = passwordProblem(next, u.platformRole !== "member", [u.fullName, u.email ?? "", u.username ?? ""]);
  if (problem) return fail(problem, "password");
  if (current !== null && current === next) return fail("Choose a different password from the current one.", "password");
  await db.update(schema.users).set({ passwordHash: await hashPassword(next), mustChangePassword: false }).where(eq(schema.users.id, userId));
  await audit({ id: u.id, label: u.fullName }, "auth.password_changed", { type: "user", id: u.id });
  return { ok: true };
}

export async function verifyEmail(token: string): Promise<Result> {
  const db = await getDb();
  const [t] = await db.select().from(schema.authTokens).where(and(eq(schema.authTokens.tokenHash, hmac(token)), eq(schema.authTokens.kind, "email_verify"), isNull(schema.authTokens.usedAt)));
  if (!t || t.expiresAt < new Date()) return fail("This confirmation link has expired or was already used.");
  await db.update(schema.authTokens).set({ usedAt: new Date() }).where(eq(schema.authTokens.id, t.id));
  await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, t.userId));
  return { ok: true };
}

/* ---------- optional multi-factor authentication (TOTP) ---------- */
const totp = (secret: string, label: string) => new OTPAuth.TOTP({ issuer: "Fodan Sunday School Academy", label, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });

export async function beginTotpSetup(userId: string) {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  await db.update(schema.users).set({ totpSecret: seal(secret), totpEnabled: false }).where(eq(schema.users.id, userId));
  return { secret, uri: totp(secret, u.email ?? u.username ?? "user").toString() };
}
export async function verifyTotp(userId: string, code: string) {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u?.totpSecret) return false;
  if (!(await rateLimit(`totp:${userId}`, 8, 600))) return false;
  return totp(unseal(u.totpSecret), "user").validate({ token: code.replace(/\s/g, ""), window: 1 }) !== null;
}
export async function enableTotp(userId: string, code: string): Promise<Result> {
  if (!(await verifyTotp(userId, code))) return fail("That code is not correct. Check the time on your phone and try again.");
  const db = await getDb();
  await db.update(schema.users).set({ totpEnabled: true }).where(eq(schema.users.id, userId));
  await audit({ id: userId }, "auth.mfa_enabled", { type: "user", id: userId });
  return { ok: true };
}
export async function disableTotp(userId: string) {
  const db = await getDb();
  await db.update(schema.users).set({ totpEnabled: false, totpSecret: null }).where(eq(schema.users.id, userId));
  await audit({ id: userId }, "auth.mfa_disabled", { type: "user", id: userId });
}

/* ---------- bootstrap of the Super Admin ---------- */
export async function bootstrapSuperAdmin(emailAddr: string, fullName: string, password: string) {
  const db = await getDb();
  const em = normEmail(emailAddr);
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.normalizedEmail, em));
  if (existing) {
    if (existing.platformRole !== "super_admin") await db.update(schema.users).set({ platformRole: "super_admin" }).where(eq(schema.users.id, existing.id));
    return { created: false, id: existing.id };
  }
  const [u] = await db.insert(schema.users).values({ fullName, email: emailAddr.trim(), normalizedEmail: em, passwordHash: await hashPassword(password), platformRole: "super_admin", mustChangePassword: true, emailVerifiedAt: new Date() }).returning({ id: schema.users.id });
  await audit(null, "admin.bootstrap", { type: "user", id: u.id });
  return { created: true, id: u.id };
}

export const isPrivileged = (role: Parameters<typeof platformCan>[0]) => platformCan(role, "admin.access");
export { notify };
