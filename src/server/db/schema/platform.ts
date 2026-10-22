import { boolean, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bytea, created, pk, tstz, updated } from "./common";
import { organizations, users } from "./identity";

/* ---------- Commerce ---------- */
export const subscriptionPlans = pgTable("subscription_plans", {
  id: pk(), code: text("code").notNull().unique(), name: text("name").notNull(), description: text("description").notNull().default(""),
  status: text("status").$type<"draft" | "active" | "retired">().notNull().default("draft"),
  billingInterval: text("billing_interval").$type<"free" | "monthly" | "quarterly" | "biannual" | "yearly">().notNull().default("yearly"),
  /** Price in minor units of `currency` (kobo for NGN). Never a float. */
  priceMinor: integer("price_minor").notNull().default(0),
  currency: text("currency").notNull().default("NGN"),
  trialDays: integer("trial_days").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  display: jsonb("display").$type<{ highlights: string[]; badge?: string }>().notNull().default({ highlights: [] }),
  createdAt: created(), updatedAt: updated(),
});

export const planEntitlements = pgTable("plan_entitlements", {
  id: pk(), planId: uuid("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(),
  /** null = unlimited for numeric features; for boolean features 1 = on, 0 = off. */
  limitValue: integer("limit_value"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
}, (t) => [unique("pe_plan_feature_uq").on(t.planId, t.featureKey)]);

export const organizationSubscriptions = pgTable("organization_subscriptions", {
  id: pk(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => subscriptionPlans.id),
  status: text("status").$type<"trialing" | "active" | "grace" | "expired" | "cancelled">().notNull().default("active"),
  startAt: tstz("start_at").defaultNow(), endAt: tstz("end_at"), trialEndAt: tstz("trial_end_at"),
  autoRenew: boolean("auto_renew").notNull().default(false),
  source: text("source").$type<"default" | "payment" | "admin_grant" | "scholarship" | "access_code">().notNull().default("default"),
  createdAt: created(), updatedAt: updated(),
}, (t) => [index("os_org_idx").on(t.organizationId, t.status)]);

export const paymentTransactions = pgTable("payment_transactions", {
  id: pk(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  planId: uuid("plan_id").references(() => subscriptionPlans.id),
  provider: text("provider").notNull(), providerReference: text("provider_reference").notNull().unique(),
  amountMinor: integer("amount_minor").notNull(), currency: text("currency").notNull(),
  status: text("status").$type<"initiated" | "pending" | "success" | "failed" | "refunded" | "abandoned">().notNull().default("initiated"),
  purpose: text("purpose").notNull().default("subscription"),
  verificationStatus: text("verification_status").$type<"unverified" | "verified" | "mismatch">().notNull().default("unverified"),
  initiatedBy: uuid("initiated_by").references(() => users.id),
  settledAt: tstz("settled_at"),
  createdAt: created(), updatedAt: updated(),
}, (t) => [index("pt_org_idx").on(t.organizationId, t.createdAt)]);

export const paymentWebhookEvents = pgTable("payment_webhook_events", {
  id: pk(), provider: text("provider").notNull(), providerEventId: text("provider_event_id").notNull(),
  verificationStatus: text("verification_status").$type<"verified" | "rejected">().notNull(),
  processingStatus: text("processing_status").$type<"processed" | "ignored" | "failed">().notNull().default("processed"),
  payloadSummary: jsonb("payload_summary").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
}, (t) => [unique("pwe_provider_event_uq").on(t.provider, t.providerEventId)]);

export const invoices = pgTable("invoices", {
  id: pk(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  invoiceNumber: text("invoice_number").notNull().unique(), transactionId: uuid("transaction_id").references(() => paymentTransactions.id),
  currency: text("currency").notNull(), subtotalMinor: integer("subtotal_minor").notNull(), taxMinor: integer("tax_minor").notNull().default(0), totalMinor: integer("total_minor").notNull(),
  paymentStatus: text("payment_status").$type<"unpaid" | "paid" | "void" | "refunded">().notNull().default("unpaid"),
  description: text("description").notNull().default(""),
  issuedAt: tstz("issued_at").defaultNow(), dueAt: tstz("due_at"),
});

export const entitlementUsage = pgTable("entitlement_usage", {
  id: pk(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(), period: text("period").notNull(), usageCount: integer("usage_count").notNull().default(0),
  updatedAt: updated(),
}, (t) => [unique("eu_org_feature_period_uq").on(t.organizationId, t.featureKey, t.period)]);

/* ---------- Content management and branding ---------- */
export type SiteSection = { id: string; type: string; hidden?: boolean; data: Record<string, unknown> };
export const sitePages = pgTable("site_pages", {
  id: pk(), slug: text("slug").notNull().unique(), title: text("title").notNull(),
  kind: text("kind").$type<"page" | "legal" | "home">().notNull().default("page"),
  sections: jsonb("sections").$type<SiteSection[]>().notNull().default([]),
  draftSections: jsonb("draft_sections").$type<SiteSection[] | null>(),
  status: text("status").$type<"draft" | "published">().notNull().default("published"),
  seo: jsonb("seo").$type<{ title?: string; description?: string }>().notNull().default({}),
  publishedAt: tstz("published_at"), updatedBy: uuid("updated_by"),
  createdAt: created(), updatedAt: updated(),
});

export const mediaAssets = pgTable("media_assets", {
  id: pk(), ownerScope: text("owner_scope").$type<"platform" | "organization">().notNull().default("platform"),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(), mime: text("mime").notNull(), size: integer("size").notNull(), checksum: text("checksum").notNull(),
  width: integer("width"), height: integer("height"),
  access: text("access").$type<"public" | "private">().notNull().default("private"),
  data: bytea("data").notNull(),
  uploadedBy: uuid("uploaded_by"), createdAt: created(),
}, (t) => [index("media_org_idx").on(t.organizationId)]);

export const logos = pgTable("logos", {
  id: pk(), label: text("label").notNull(), kind: text("kind").$type<"svg" | "raster" | "builtin">().notNull(), mime: text("mime").notNull(),
  svg: text("svg"), assetId: uuid("asset_id"), builtinPath: text("builtin_path"),
  /** Where this variant is used: header-light, header-dark, login, footer, favicon-svg, favicon-32, favicon-ico, apple-180, pwa-192, pwa-512, pwa-maskable, certificate, email. */
  placements: jsonb("placements").$type<string[]>().notNull().default([]),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});

export const notifications = pgTable("notifications", {
  id: pk(), recipientId: uuid("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  type: text("type").notNull(), title: text("title").notNull(), body: text("body").notNull().default(""), href: text("href"),
  dedupeKey: text("dedupe_key"), readAt: tstz("read_at"), createdAt: created(),
}, (t) => [index("notif_recipient_idx").on(t.recipientId, t.createdAt), uniqueIndex("notif_dedupe_uq").on(t.recipientId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`)]);

export const emailOutbox = pgTable("email_outbox", {
  id: pk(), toEmail: text("to_email").notNull(), subject: text("subject").notNull(), body: text("body").notNull(),
  dedupeKey: text("dedupe_key"), status: text("status").$type<"queued" | "sent" | "held" | "failed">().notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0), lastError: text("last_error"), sentAt: tstz("sent_at"), createdAt: created(),
}, (t) => [uniqueIndex("outbox_dedupe_uq").on(t.dedupeKey).where(sql`${t.dedupeKey} is not null`)]);

export const backgroundJobs = pgTable("background_jobs", {
  id: pk(), kind: text("kind").notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").$type<"queued" | "running" | "done" | "failed">().notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0), maxAttempts: integer("max_attempts").notNull().default(5),
  runAfter: tstz("run_after").defaultNow(), lockedAt: tstz("locked_at"), lastError: text("last_error"),
  idempotencyKey: text("idempotency_key"), result: jsonb("result").$type<Record<string, unknown>>(),
  createdAt: created(), updatedAt: updated(),
}, (t) => [index("job_status_idx").on(t.status, t.runAfter), uniqueIndex("job_idem_uq").on(t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`)]);

export const integrationSettings = pgTable("integration_settings", {
  key: text("key").primaryKey(), config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(false), updatedAt: updated(),
});

/* ---------- Community forum (open to every member of every church) ---------- */
export const forumCategories = pgTable("forum_categories", {
  id: pk(), slug: text("slug").notNull().unique(), name: text("name").notNull(), description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0), staffOnlyPosting: boolean("staff_only_posting").notNull().default(false),
});
export const forumThreads = pgTable("forum_threads", {
  id: pk(), categoryId: uuid("category_id").notNull().references(() => forumCategories.id), authorId: uuid("author_id").notNull().references(() => users.id),
  title: text("title").notNull(), body: text("body").notNull(),
  status: text("status").$type<"visible" | "hidden" | "locked">().notNull().default("visible"), pinned: boolean("pinned").notNull().default(false),
  replyCount: integer("reply_count").notNull().default(0), lastActivityAt: tstz("last_activity_at").defaultNow(), createdAt: created(),
}, (t) => [index("ft_cat_idx").on(t.categoryId, t.lastActivityAt)]);
export const forumPosts = pgTable("forum_posts", {
  id: pk(), threadId: uuid("thread_id").notNull().references(() => forumThreads.id, { onDelete: "cascade" }), authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(), status: text("status").$type<"visible" | "hidden">().notNull().default("visible"), createdAt: created(),
}, (t) => [index("fp_thread_idx").on(t.threadId, t.createdAt)]);
export const forumReports = pgTable("forum_reports", {
  id: pk(), reporterId: uuid("reporter_id").notNull().references(() => users.id), threadId: uuid("thread_id"), postId: uuid("post_id"),
  reason: text("reason").notNull(), status: text("status").$type<"open" | "actioned" | "dismissed">().notNull().default("open"),
  handledBy: uuid("handled_by"), createdAt: created(),
});

/* ---------- Church access codes (issued by the Super Admin, redeemed at church registration) ---------- */
export const churchAccessCodes = pgTable("church_access_codes", {
  id: pk(),
  code: text("code").notNull().unique(),
  planId: uuid("plan_id").notNull().references(() => subscriptionPlans.id),
  /** How long the plan runs from redemption. null = no end date. */
  durationDays: integer("duration_days"),
  /** How many churches may redeem this code (usually 1). */
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  /** The code can no longer be redeemed after this moment. */
  redeemBy: tstz("redeem_by"),
  status: text("status").$type<"active" | "revoked">().notNull().default("active"),
  /** Free-text label for the Super Admin, e.g. the church it was issued to. */
  note: text("note").notNull().default(""),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: created(),
}, (t) => [index("cac_plan_idx").on(t.planId), index("cac_status_idx").on(t.status)]);

export const churchAccessCodeRedemptions = pgTable("church_access_code_redemptions", {
  id: pk(),
  codeId: uuid("code_id").notNull().references(() => churchAccessCodes.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  redeemedBy: uuid("redeemed_by").references(() => users.id),
  subscriptionId: uuid("subscription_id").references(() => organizationSubscriptions.id),
  createdAt: created(),
}, (t) => [unique("cacr_code_org_uq").on(t.codeId, t.organizationId)]);
