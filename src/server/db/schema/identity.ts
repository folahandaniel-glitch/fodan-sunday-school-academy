import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { created, pk, tstz, updated } from "./common";

/** Platform-wide roles. Everything else is an organisation-scoped role held through a membership. */
export const PLATFORM_ROLES = ["member", "super_admin", "curriculum_admin", "finance_admin", "auditor"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export const ORG_ROLES = ["church_admin", "assistant_admin", "teacher", "learner", "exam_supervisor", "coordinator", "auditor"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const users = pgTable("users", {
  id: pk(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  normalizedEmail: text("normalized_email"),
  username: text("username"),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  platformRole: text("platform_role").$type<PlatformRole>().notNull().default("member"),
  status: text("status").$type<"active" | "pending" | "suspended" | "deactivated">().notNull().default("active"),
  emailVerifiedAt: tstz("email_verified_at"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: tstz("locked_until"),
  lastLoginAt: tstz("last_login_at"),
  isMinor: boolean("is_minor").notNull().default(false),
  showChurchInForum: boolean("show_church_in_forum").notNull().default(true),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  locale: text("locale").notNull().default("en"),
  timezone: text("timezone").notNull().default("Africa/Lagos"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  uniqueIndex("users_email_uq").on(t.normalizedEmail).where(sql`${t.normalizedEmail} is not null`),
  uniqueIndex("users_username_uq").on(t.username).where(sql`${t.username} is not null`),
  index("users_role_idx").on(t.platformRole),
]);

export const organizations = pgTable("organizations", {
  id: pk(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type").notNull().default("church"),
  denomination: text("denomination"),
  country: text("country").notNull().default("Nigeria"),
  state: text("state"),
  city: text("city"),
  address: text("address"),
  contactEmail: text("contact_email"),
  phone: text("phone"),
  logoAssetId: uuid("logo_asset_id"),
  timezone: text("timezone").notNull().default("Africa/Lagos"),
  currency: text("currency").notNull().default("NGN"),
  language: text("language").notNull().default("en"),
  /** active: usable; pending: awaiting Super Admin approval; unverified: listed by a member, no administrator yet; suspended: blocked. */
  status: text("status").$type<"active" | "pending" | "unverified" | "suspended">().notNull().default("active"),
  suspendedReason: text("suspended_reason"),
  joinCode: text("join_code"),
  autoApproveMembers: boolean("auto_approve_members").notNull().default(false),
  /** Local settings: weekday, date format, attendance rules, result visibility, certificate rules, grade scale, announcements. */
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid("created_by_user_id"),
  verifiedAt: tstz("verified_at"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  uniqueIndex("org_join_code_uq").on(t.joinCode).where(sql`${t.joinCode} is not null`),
  index("org_norm_name_idx").on(t.normalizedName),
  index("org_status_idx").on(t.status),
]);

export const organizationMemberships = pgTable("organization_memberships", {
  id: pk(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").$type<OrgRole>().notNull().default("learner"),
  status: text("status").$type<"active" | "pending" | "rejected" | "removed">().notNull().default("pending"),
  joinedAt: tstz("joined_at"),
  decidedBy: uuid("decided_by"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  unique("membership_org_user_uq").on(t.organizationId, t.userId),
  index("membership_user_idx").on(t.userId),
  index("membership_org_role_idx").on(t.organizationId, t.role, t.status),
]);

export const sessions = pgTable("sessions", {
  id: pk(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activeOrgId: uuid("active_org_id"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  mfaOk: boolean("mfa_ok").notNull().default(false),
  recentAuthAt: timestamp("recent_auth_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: tstz("revoked_at"),
  createdAt: created(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const authTokens = pgTable("auth_tokens", {
  id: pk(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"password_reset" | "email_verify">().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: tstz("used_at"),
  createdAt: created(),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: pk(),
  actorId: uuid("actor_id"),
  actorLabel: text("actor_label"),
  actorRole: text("actor_role"),
  organizationId: uuid("organization_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  requestId: text("request_id"),
  ip: text("ip"),
  createdAt: created(),
}, (t) => [index("audit_created_idx").on(t.createdAt), index("audit_org_idx").on(t.organizationId, t.createdAt), index("audit_action_idx").on(t.action)]);
