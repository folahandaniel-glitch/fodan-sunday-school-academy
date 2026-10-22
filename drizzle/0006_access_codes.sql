CREATE TABLE "church_access_code_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"redeemed_by" uuid,
	"subscription_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cacr_code_org_uq" UNIQUE("code_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "church_access_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"duration_days" integer,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"redeem_by" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "church_access_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "church_access_code_redemptions" ADD CONSTRAINT "church_access_code_redemptions_code_id_church_access_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."church_access_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church_access_code_redemptions" ADD CONSTRAINT "church_access_code_redemptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church_access_code_redemptions" ADD CONSTRAINT "church_access_code_redemptions_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church_access_code_redemptions" ADD CONSTRAINT "church_access_code_redemptions_subscription_id_organization_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."organization_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church_access_codes" ADD CONSTRAINT "church_access_codes_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church_access_codes" ADD CONSTRAINT "church_access_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cac_plan_idx" ON "church_access_codes" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "cac_status_idx" ON "church_access_codes" USING btree ("status");