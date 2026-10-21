CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_label" text,
	"actor_role" text,
	"organization_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'learner' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"joined_at" timestamp with time zone,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_org_user_uq" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"slug" text NOT NULL,
	"type" text DEFAULT 'church' NOT NULL,
	"denomination" text,
	"country" text DEFAULT 'Nigeria' NOT NULL,
	"state" text,
	"city" text,
	"address" text,
	"contact_email" text,
	"phone" text,
	"logo_asset_id" uuid,
	"timezone" text DEFAULT 'Africa/Lagos' NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"suspended_reason" text,
	"join_code" text,
	"auto_approve_members" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"active_org_id" uuid,
	"ip" text,
	"user_agent" text,
	"mfa_ok" boolean DEFAULT false NOT NULL,
	"recent_auth_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"normalized_email" text,
	"username" text,
	"phone" text,
	"password_hash" text NOT NULL,
	"platform_role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"is_minor" boolean DEFAULT false NOT NULL,
	"show_church_in_forum" boolean DEFAULT true NOT NULL,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'Africa/Lagos' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_org_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "membership_org_role_idx" ON "organization_memberships" USING btree ("organization_id","role","status");--> statement-breakpoint
CREATE UNIQUE INDEX "org_join_code_uq" ON "organizations" USING btree ("join_code") WHERE "organizations"."join_code" is not null;--> statement-breakpoint
CREATE INDEX "org_norm_name_idx" ON "organizations" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "org_status_idx" ON "organizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("normalized_email") WHERE "users"."normalized_email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree ("username") WHERE "users"."username" is not null;--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("platform_role");