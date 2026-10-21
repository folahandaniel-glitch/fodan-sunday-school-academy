CREATE TABLE "assessment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"awarded_marks" numeric(8, 2) NOT NULL,
	"total_marks" numeric(8, 2) NOT NULL,
	"percentage" numeric(8, 2) NOT NULL,
	"grade" text NOT NULL,
	"pass_status" text NOT NULL,
	"publication_status" text DEFAULT 'unpublished' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ar2_attempt_uq" UNIQUE("attempt_id"),
	CONSTRAINT "ar2_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "attempt_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"exam_question_id" uuid NOT NULL,
	"answer" jsonb,
	"flagged" boolean DEFAULT false NOT NULL,
	"awarded_marks" numeric(8, 2),
	"review_status" text DEFAULT 'pending' NOT NULL,
	"feedback" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aa_attempt_question_uq" UNIQUE("attempt_id","exam_question_id")
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"verification_code" text NOT NULL,
	"data" jsonb NOT NULL,
	"issued_by" uuid,
	"issued_at" timestamp with time zone DEFAULT now(),
	"revoked_at" timestamp with time zone,
	CONSTRAINT "certificates_verification_code_unique" UNIQUE("verification_code"),
	CONSTRAINT "cert_learner_assignment_uq" UNIQUE("learner_id","assignment_id")
);
--> statement-breakpoint
CREATE TABLE "examination_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"submit_method" text,
	"started_at" timestamp with time zone DEFAULT now(),
	"deadline_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"question_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"option_order" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" numeric(8, 2),
	"total_marks" numeric(8, 2),
	"percentage" numeric(8, 2),
	"grading_status" text DEFAULT 'not_graded' NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "att_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "att_exam_learner_no_uq" UNIQUE("exam_id","learner_id","attempt_number")
);
--> statement-breakpoint
CREATE TABLE "examination_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"marks" numeric(8, 2) DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "eq_exam_question_uq" UNIQUE("exam_id","question_id"),
	CONSTRAINT "eq_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "examinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"scheduled_lesson_id" uuid,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"duration_seconds" integer DEFAULT 3600 NOT NULL,
	"total_marks" numeric(8, 2) DEFAULT 0 NOT NULL,
	"pass_percent" integer DEFAULT 50 NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"attempt_limit" integer DEFAULT 1 NOT NULL,
	"shuffle_questions" boolean DEFAULT true NOT NULL,
	"shuffle_options" boolean DEFAULT true NOT NULL,
	"result_policy" text DEFAULT 'after_review' NOT NULL,
	"review_policy" text DEFAULT 'after_publish' NOT NULL,
	"late_policy" text DEFAULT 'reject' NOT NULL,
	"class_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ex_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "result_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"result_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_exam_id_organization_id_examinations_id_organization_id_fk" FOREIGN KEY ("exam_id","organization_id") REFERENCES "public"."examinations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_attempt_id_organization_id_examination_attempts_id_organization_id_fk" FOREIGN KEY ("attempt_id","organization_id") REFERENCES "public"."examination_attempts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_organization_id_learner_id_organization_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","learner_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_organization_id_examination_attempts_id_organization_id_fk" FOREIGN KEY ("attempt_id","organization_id") REFERENCES "public"."examination_attempts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_exam_question_id_organization_id_examination_questions_id_organization_id_fk" FOREIGN KEY ("exam_question_id","organization_id") REFERENCES "public"."examination_questions"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_assignment_id_organization_id_curriculum_assignments_id_organization_id_fk" FOREIGN KEY ("assignment_id","organization_id") REFERENCES "public"."curriculum_assignments"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_organization_id_learner_id_organization_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","learner_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_attempts" ADD CONSTRAINT "examination_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_attempts" ADD CONSTRAINT "examination_attempts_exam_id_organization_id_examinations_id_organization_id_fk" FOREIGN KEY ("exam_id","organization_id") REFERENCES "public"."examinations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_attempts" ADD CONSTRAINT "examination_attempts_organization_id_learner_id_organization_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","learner_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_questions" ADD CONSTRAINT "examination_questions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_questions" ADD CONSTRAINT "examination_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_questions" ADD CONSTRAINT "examination_questions_exam_id_organization_id_examinations_id_organization_id_fk" FOREIGN KEY ("exam_id","organization_id") REFERENCES "public"."examinations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_assignment_id_organization_id_curriculum_assignments_id_organization_id_fk" FOREIGN KEY ("assignment_id","organization_id") REFERENCES "public"."curriculum_assignments"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_scheduled_lesson_id_organization_id_scheduled_lessons_id_organization_id_fk" FOREIGN KEY ("scheduled_lesson_id","organization_id") REFERENCES "public"."scheduled_lessons"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_feedback" ADD CONSTRAINT "result_feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_feedback" ADD CONSTRAINT "result_feedback_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_feedback" ADD CONSTRAINT "result_feedback_result_id_organization_id_assessment_results_id_organization_id_fk" FOREIGN KEY ("result_id","organization_id") REFERENCES "public"."assessment_results"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ar2_learner_idx" ON "assessment_results" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "att_learner_idx" ON "examination_attempts" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "ex_org_status_idx" ON "examinations" USING btree ("organization_id","status");