CREATE TABLE "background_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now(),
	"locked_at" timestamp with time zone,
	"last_error" text,
	"idempotency_key" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"dedupe_key" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlement_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"period" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eu_org_feature_period_uq" UNIQUE("organization_id","feature_key","period")
);
--> statement-breakpoint
CREATE TABLE "forum_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"staff_only_posting" boolean DEFAULT false NOT NULL,
	CONSTRAINT "forum_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "forum_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"thread_id" uuid,
	"post_id" uuid,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"transaction_id" uuid,
	"currency" text NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"tax_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now(),
	"due_at" timestamp with time zone,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "logos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"svg" text,
	"asset_id" uuid,
	"builtin_path" text,
	"placements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"organization_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_scope" text DEFAULT 'platform' NOT NULL,
	"organization_id" uuid,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"checksum" text NOT NULL,
	"width" integer,
	"height" integer,
	"access" text DEFAULT 'private' NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"organization_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_at" timestamp with time zone DEFAULT now(),
	"end_at" timestamp with time zone,
	"trial_end_at" timestamp with time zone,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid,
	"provider" text NOT NULL,
	"provider_reference" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'initiated' NOT NULL,
	"purpose" text DEFAULT 'subscription' NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"initiated_by" uuid,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transactions_provider_reference_unique" UNIQUE("provider_reference")
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"verification_status" text NOT NULL,
	"processing_status" text DEFAULT 'processed' NOT NULL,
	"payload_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pwe_provider_event_uq" UNIQUE("provider","provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "plan_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"limit_value" integer,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pe_plan_feature_uq" UNIQUE("plan_id","feature_key")
);
--> statement-breakpoint
CREATE TABLE "site_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'page' NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft_sections" jsonb,
	"status" text DEFAULT 'published' NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"billing_interval" text DEFAULT 'yearly' NOT NULL,
	"price_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"display" jsonb DEFAULT '{"highlights":[]}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "entitlement_usage" ADD CONSTRAINT "entitlement_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_thread_id_forum_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."forum_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_reports" ADD CONSTRAINT "forum_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_category_id_forum_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."forum_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logos" ADD CONSTRAINT "logos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_status_idx" ON "background_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "job_idem_uq" ON "background_jobs" USING btree ("idempotency_key") WHERE "background_jobs"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_dedupe_uq" ON "email_outbox" USING btree ("dedupe_key") WHERE "email_outbox"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "fp_thread_idx" ON "forum_posts" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "ft_cat_idx" ON "forum_threads" USING btree ("category_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "media_org_idx" ON "media_assets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notif_recipient_idx" ON "notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notif_dedupe_uq" ON "notifications" USING btree ("recipient_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "os_org_idx" ON "organization_subscriptions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "pt_org_idx" ON "payment_transactions" USING btree ("organization_id","created_at");