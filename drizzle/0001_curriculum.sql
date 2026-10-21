CREATE TABLE "assessment_blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"config" jsonb NOT NULL,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ab_version_kind_uq" UNIQUE("version_id","kind")
);
--> statement-breakpoint
CREATE TABLE "content_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploaded_by" uuid,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"checksum" text NOT NULL,
	"status" text DEFAULT 'previewed' NOT NULL,
	"extracted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"curriculum_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curricula" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_number" integer,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"short_description" text DEFAULT '' NOT NULL,
	"full_description" text DEFAULT '' NOT NULL,
	"category_id" uuid,
	"cover_image" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audience" text DEFAULT 'Teens and adults' NOT NULL,
	"level" text DEFAULT 'Foundation' NOT NULL,
	"duration_label" text DEFAULT '26 weeks (six months)' NOT NULL,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"doctrinal_notes" text DEFAULT '' NOT NULL,
	"author" text DEFAULT 'Fodan Gospel Outreach Curriculum Team' NOT NULL,
	"access_tier" text DEFAULT 'free' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curricula_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "curriculum_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "curriculum_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "curriculum_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"theme" text DEFAULT '' NOT NULL,
	"unit_kind" text DEFAULT 'teaching' NOT NULL,
	"primary_scripture" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"additional_scripture" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_verse" text DEFAULT '' NOT NULL,
	"objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"key_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_minutes" integer DEFAULT 45 NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cl_version_week_uq" UNIQUE("version_id","week_number")
);
--> statement-breakpoint
CREATE TABLE "curriculum_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"decision" text NOT NULL,
	"comments" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curriculum_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_id" uuid,
	"reviewer_id" uuid,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"change_summary" text DEFAULT '' NOT NULL,
	"provenance" text DEFAULT 'authored' NOT NULL,
	"validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_curriculum_version_uq" UNIQUE("curriculum_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "lesson_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"lesson_id" uuid,
	"kind" text DEFAULT 'document' NOT NULL,
	"title" text NOT NULL,
	"access_level" text DEFAULT 'learner' NOT NULL,
	"asset_id" uuid,
	"url" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_answer_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"config" jsonb NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"reviewer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_answer_keys_question_id_unique" UNIQUE("question_id")
);
--> statement-breakpoint
CREATE TABLE "question_banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_banks_version_id_unique" UNIQUE("version_id")
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"text" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"lesson_id" uuid,
	"week_number" integer,
	"type" text NOT NULL,
	"text" text NOT NULL,
	"scripture_ref" text,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"marks" integer DEFAULT 1 NOT NULL,
	"topic_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"author_id" uuid,
	"reviewer_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_blueprints" ADD CONSTRAINT "assessment_blueprints_version_id_curriculum_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_imports" ADD CONSTRAINT "content_imports_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_category_id_curriculum_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."curriculum_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_lessons" ADD CONSTRAINT "curriculum_lessons_version_id_curriculum_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_reviews" ADD CONSTRAINT "curriculum_reviews_version_id_curriculum_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_reviews" ADD CONSTRAINT "curriculum_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_version_id_curriculum_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_lesson_id_curriculum_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."curriculum_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_answer_keys" ADD CONSTRAINT "question_answer_keys_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_answer_keys" ADD CONSTRAINT "question_answer_keys_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_version_id_curriculum_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_bank_id_question_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."question_banks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_version_id_curriculum_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_lesson_id_curriculum_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."curriculum_lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "curricula_status_idx" ON "curricula" USING btree ("status");--> statement-breakpoint
CREATE INDEX "curricula_cat_idx" ON "curricula" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "cv_status_idx" ON "curriculum_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "qo_question_idx" ON "question_options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "q_version_idx" ON "questions" USING btree ("version_id","week_number");--> statement-breakpoint
CREATE INDEX "q_bank_idx" ON "questions" USING btree ("bank_id");