CREATE TABLE "academic_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"year" integer NOT NULL,
	"session_type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"timezone" text DEFAULT 'Africa/Lagos' NOT NULL,
	"teaching_weekday" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"config" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "as_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"content" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now(),
	"awarded_marks" integer,
	"feedback" text,
	"grading_status" text DEFAULT 'submitted' NOT NULL,
	CONSTRAINT "asub_assignment_learner_uq" UNIQUE("assignment_id","learner_id")
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"scheduled_lesson_id" uuid,
	"title" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"due_at" timestamp with time zone,
	"total_marks" integer DEFAULT 10 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asg_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"attendance_session_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"status" text NOT NULL,
	"remarks" text,
	CONSTRAINT "ar_session_learner_uq" UNIQUE("attendance_session_id","learner_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scheduled_lesson_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"recorded_by" uuid NOT NULL,
	"session_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "as2_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "as2_lesson_class_uq" UNIQUE("scheduled_lesson_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "class_curriculum_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cca_class_assignment_uq" UNIQUE("class_id","assignment_id")
);
--> statement-breakpoint
CREATE TABLE "class_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cm_class_user_uq" UNIQUE("class_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "class_teacher_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ct_class_teacher_uq" UNIQUE("class_id","teacher_id")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"age_group" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "classes_org_name_uq" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "curriculum_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"curriculum_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"assigned_by" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"idempotency_key" text,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ca_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "discussion_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"discussion_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"content" text NOT NULL,
	"moderation_status" text DEFAULT 'visible' NOT NULL,
	"teacher_reflection" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scheduled_lesson_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"delivered_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ld_lesson_class_uq" UNIQUE("scheduled_lesson_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_discussions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scheduled_lesson_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"facilitator_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ldisc_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"scheduled_lesson_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lp_learner_lesson_uq" UNIQUE("learner_id","scheduled_lesson_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"scheduled_date" date,
	"lesson_type" text DEFAULT 'teaching' NOT NULL,
	"combined_with_week" integer,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"release_override" text,
	"delivered_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sl_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "sl_assignment_week_uq" UNIQUE("assignment_id","week_number"),
	CONSTRAINT "sl_assignment_lesson_uq" UNIQUE("assignment_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "session_calendar_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"exception_date" date NOT NULL,
	"type" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"resolution" text DEFAULT 'skip' NOT NULL,
	CONSTRAINT "sce_session_date_uq" UNIQUE("session_id","exception_date")
);
--> statement-breakpoint
CREATE TABLE "session_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "version_adoptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"from_version_id" uuid NOT NULL,
	"to_version_id" uuid NOT NULL,
	"from_week" integer NOT NULL,
	"weeks_moved" integer DEFAULT 0 NOT NULL,
	"adopted_by" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_organization_id_assignments_id_organization_id_fk" FOREIGN KEY ("assignment_id","organization_id") REFERENCES "public"."assignments"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_organization_id_learner_id_organization_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","learner_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_organization_id_classes_id_organization_id_fk" FOREIGN KEY ("class_id","organization_id") REFERENCES "public"."classes"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_scheduled_lesson_id_organization_id_scheduled_lessons_id_organization_id_fk" FOREIGN KEY ("scheduled_lesson_id","organization_id") REFERENCES "public"."scheduled_lessons"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_attendance_session_id_organization_id_attendance_sessions_id_organization_id_fk" FOREIGN KEY ("attendance_session_id","organization_id") REFERENCES "public"."attendance_sessions"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organization_id_learner_id_organization_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","learner_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_scheduled_lesson_id_organization_id_scheduled_lessons_id_organization_id_fk" FOREIGN KEY ("scheduled_lesson_id","organization_id") REFERENCES "public"."scheduled_lessons"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_class_id_organization_id_classes_id_organization_id_fk" FOREIGN KEY ("class_id","organization_id") REFERENCES "public"."classes"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_curriculum_assignments" ADD CONSTRAINT "class_curriculum_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_curriculum_assignments" ADD CONSTRAINT "class_curriculum_assignments_class_id_organization_id_classes_id_organization_id_fk" FOREIGN KEY ("class_id","organization_id") REFERENCES "public"."classes"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_curriculum_assignments" ADD CONSTRAINT "class_curriculum_assignments_assignment_id_organization_id_curriculum_assignments_id_organization_id_fk" FOREIGN KEY ("assignment_id","organization_id") REFERENCES "public"."curriculum_assignments"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_memberships" ADD CONSTRAINT "class_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_memberships" ADD CONSTRAINT "class_memberships_class_id_organization_id_classes_id_organization_id_fk" FOREIGN KEY ("class_id","organization_id") REFERENCES "public"."classes"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_memberships" ADD CONSTRAINT "class_memberships_organization_id_user_id_organization_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_class_id_organization_id_classes_id_organization_id_fk" FOREIGN KEY ("class_id","organization_id") REFERENCES "public"."classes"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_organization_id_teacher_id_organization_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","teacher_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_assignments" ADD CONSTRAINT "curriculum_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_assignments" ADD CONSTRAINT "curriculum_assignments_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_assignments" ADD CONSTRAINT "curriculum_assignments_version_id_curriculum_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_assignments" ADD CONSTRAINT "curriculum_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_assignments" ADD CONSTRAINT "curriculum_assignments_session_id_organization_id_academic_sessions_id_organization_id_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."academic_sessions"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_responses" ADD CONSTRAINT "discussion_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_responses" ADD CONSTRAINT "discussion_responses_discussion_id_organization_id_lesson_discussions_id_organization_id_fk" FOREIGN KEY ("discussion_id","organization_id") REFERENCES "public"."lesson_discussions"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_responses" ADD CONSTRAINT "discussion_responses_organization_id_learner_id_organization_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","learner_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_deliveries" ADD CONSTRAINT "lesson_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_deliveries" ADD CONSTRAINT "lesson_deliveries_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_deliveries" ADD CONSTRAINT "lesson_deliveries_scheduled_lesson_id_organization_id_scheduled_lessons_id_organization_id_fk" FOREIGN KEY ("scheduled_lesson_id","organization_id") REFERENCES "public"."scheduled_lessons"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_deliveries" ADD CONSTRAINT "lesson_deliveries_class_id_organization_id_classes_id_organization_id_fk" FOREIGN KEY ("class_id","organization_id") REFERENCES "public"."classes"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_discussions" ADD CONSTRAINT "lesson_discussions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_discussions" ADD CONSTRAINT "lesson_discussions_facilitator_id_users_id_fk" FOREIGN KEY ("facilitator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_discussions" ADD CONSTRAINT "lesson_discussions_scheduled_lesson_id_organization_id_scheduled_lessons_id_organization_id_fk" FOREIGN KEY ("scheduled_lesson_id","organization_id") REFERENCES "public"."scheduled_lessons"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_discussions" ADD CONSTRAINT "lesson_discussions_class_id_organization_id_classes_id_organization_id_fk" FOREIGN KEY ("class_id","organization_id") REFERENCES "public"."classes"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_scheduled_lesson_id_organization_id_scheduled_lessons_id_organization_id_fk" FOREIGN KEY ("scheduled_lesson_id","organization_id") REFERENCES "public"."scheduled_lessons"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_organization_id_learner_id_organization_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","learner_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_lessons" ADD CONSTRAINT "scheduled_lessons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_lessons" ADD CONSTRAINT "scheduled_lessons_lesson_id_curriculum_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."curriculum_lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_lessons" ADD CONSTRAINT "scheduled_lessons_assignment_id_organization_id_curriculum_assignments_id_organization_id_fk" FOREIGN KEY ("assignment_id","organization_id") REFERENCES "public"."curriculum_assignments"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_calendar_exceptions" ADD CONSTRAINT "session_calendar_exceptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_calendar_exceptions" ADD CONSTRAINT "session_calendar_exceptions_session_id_organization_id_academic_sessions_id_organization_id_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."academic_sessions"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_templates" ADD CONSTRAINT "session_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_adoptions" ADD CONSTRAINT "version_adoptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_adoptions" ADD CONSTRAINT "version_adoptions_from_version_id_curriculum_versions_id_fk" FOREIGN KEY ("from_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_adoptions" ADD CONSTRAINT "version_adoptions_to_version_id_curriculum_versions_id_fk" FOREIGN KEY ("to_version_id") REFERENCES "public"."curriculum_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_adoptions" ADD CONSTRAINT "version_adoptions_adopted_by_users_id_fk" FOREIGN KEY ("adopted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_adoptions" ADD CONSTRAINT "version_adoptions_assignment_id_organization_id_curriculum_assignments_id_organization_id_fk" FOREIGN KEY ("assignment_id","organization_id") REFERENCES "public"."curriculum_assignments"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "as_org_status_idx" ON "academic_sessions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "ann_org_idx" ON "announcements" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ar_learner_idx" ON "attendance_records" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "cm_user_idx" ON "class_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ct_teacher_idx" ON "class_teacher_assignments" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ca_session_curriculum_uq" ON "curriculum_assignments" USING btree ("session_id","curriculum_id") WHERE "curriculum_assignments"."status" <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX "ca_idem_uq" ON "curriculum_assignments" USING btree ("organization_id","idempotency_key") WHERE "curriculum_assignments"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "dr_discussion_idx" ON "discussion_responses" USING btree ("discussion_id");--> statement-breakpoint
CREATE INDEX "sl_date_idx" ON "scheduled_lessons" USING btree ("organization_id","scheduled_date");