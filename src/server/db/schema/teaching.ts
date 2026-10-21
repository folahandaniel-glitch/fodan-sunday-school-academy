import { boolean, date, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { created, pk, tstz, updated } from "./common";
import { organizationMemberships, organizations, users } from "./identity";
import { curricula, curriculumLessons, curriculumVersions } from "./curriculum";

/*
 * ORGANISATION ISOLATION AT THE DATABASE LEVEL
 * Every organisation-owned table carries organization_id. Parents expose UNIQUE (id, organization_id) and children reference that pair,
 * so a row can never point at a parent that belongs to another church, even if application code is wrong.
 */
const org = () => uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" });

export const classes = pgTable("classes", {
  id: pk(), organizationId: org(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ageGroup: text("age_group"),
  status: text("status").$type<"active" | "archived">().notNull().default("active"),
  createdAt: created(), updatedAt: updated(),
}, (t) => [unique("classes_id_org_uq").on(t.id, t.organizationId), unique("classes_org_name_uq").on(t.organizationId, t.name)]);

export const classMemberships = pgTable("class_memberships", {
  id: pk(), organizationId: org(), classId: uuid("class_id").notNull(), userId: uuid("user_id").notNull(),
  status: text("status").$type<"active" | "left">().notNull().default("active"),
  createdAt: created(), updatedAt: updated(),
}, (t) => [
  foreignKey({ columns: [t.classId, t.organizationId], foreignColumns: [classes.id, classes.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.userId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId] }).onDelete("cascade"),
  unique("cm_class_user_uq").on(t.classId, t.userId), index("cm_user_idx").on(t.userId),
]);

export const classTeachers = pgTable("class_teacher_assignments", {
  id: pk(), organizationId: org(), classId: uuid("class_id").notNull(), teacherId: uuid("teacher_id").notNull(),
  createdAt: created(),
}, (t) => [
  foreignKey({ columns: [t.classId, t.organizationId], foreignColumns: [classes.id, classes.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.teacherId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId] }).onDelete("cascade"),
  unique("ct_class_teacher_uq").on(t.classId, t.teacherId), index("ct_teacher_idx").on(t.teacherId),
]);

export const sessionTemplates = pgTable("session_templates", {
  id: pk(), organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  config: jsonb("config").$type<{ midtestWeek: number; finalWeek: number; revisionWeek: number }>().notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: created(),
});

export interface SessionConfig {
  midtestWeek: number; finalWeek: number; revisionWeek: number;
  shortfallPolicy: "extend" | "combine" | "unscheduled";
  extraRevisionDates?: string[];
}

export const academicSessions = pgTable("academic_sessions", {
  id: pk(), organizationId: org(),
  name: text("name").notNull(),
  year: integer("year").notNull(),
  sessionType: text("session_type").$type<"jan_jun" | "jul_dec" | "custom">().notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  timezone: text("timezone").notNull().default("Africa/Lagos"),
  teachingWeekday: integer("teaching_weekday").notNull().default(0),
  status: text("status").$type<"draft" | "active" | "completed" | "archived">().notNull().default("draft"),
  config: jsonb("config").$type<SessionConfig>().notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: created(), updatedAt: updated(),
}, (t) => [unique("as_id_org_uq").on(t.id, t.organizationId), index("as_org_status_idx").on(t.organizationId, t.status)]);

export const sessionCalendarExceptions = pgTable("session_calendar_exceptions", {
  id: pk(), organizationId: org(), sessionId: uuid("session_id").notNull(),
  exceptionDate: date("exception_date").notNull(),
  type: text("type").$type<"holiday" | "special_service" | "skipped">().notNull(),
  description: text("description").notNull().default(""),
  resolution: text("resolution").notNull().default("skip"),
}, (t) => [
  foreignKey({ columns: [t.sessionId, t.organizationId], foreignColumns: [academicSessions.id, academicSessions.organizationId] }).onDelete("cascade"),
  unique("sce_session_date_uq").on(t.sessionId, t.exceptionDate),
]);

/** A church's use of ONE frozen curriculum version in ONE academic session. Pins the version: later edits can never alter it. */
export const curriculumAssignments = pgTable("curriculum_assignments", {
  id: pk(), organizationId: org(), sessionId: uuid("session_id").notNull(),
  curriculumId: uuid("curriculum_id").notNull().references(() => curricula.id),
  versionId: uuid("version_id").notNull().references(() => curriculumVersions.id),
  assignedBy: uuid("assigned_by").references(() => users.id),
  status: text("status").$type<"draft" | "active" | "completed" | "cancelled">().notNull().default("draft"),
  idempotencyKey: text("idempotency_key"),
  activatedAt: tstz("activated_at"),
  createdAt: created(), updatedAt: updated(),
}, (t) => [
  foreignKey({ columns: [t.sessionId, t.organizationId], foreignColumns: [academicSessions.id, academicSessions.organizationId] }).onDelete("cascade"),
  unique("ca_id_org_uq").on(t.id, t.organizationId),
  uniqueIndex("ca_session_curriculum_uq").on(t.sessionId, t.curriculumId).where(sql`${t.status} <> 'cancelled'`),
  uniqueIndex("ca_idem_uq").on(t.organizationId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
]);

export const scheduledLessons = pgTable("scheduled_lessons", {
  id: pk(), organizationId: org(), assignmentId: uuid("assignment_id").notNull(),
  lessonId: uuid("lesson_id").notNull().references(() => curriculumLessons.id),
  /** Slot in the session (1-26). */
  weekNumber: integer("week_number").notNull(),
  scheduledDate: date("scheduled_date"),
  lessonType: text("lesson_type").$type<"teaching" | "midtest" | "final" | "revision">().notNull().default("teaching"),
  /** Teaching lessons combined onto one date when the calendar is short. */
  combinedWithWeek: integer("combined_with_week"),
  status: text("status").$type<"scheduled" | "available" | "in_progress" | "completed" | "locked">().notNull().default("scheduled"),
  releaseOverride: text("release_override").$type<"open" | "locked">(),
  deliveredAt: tstz("delivered_at"),
  note: text("note"),
  createdAt: created(), updatedAt: updated(),
}, (t) => [
  foreignKey({ columns: [t.assignmentId, t.organizationId], foreignColumns: [curriculumAssignments.id, curriculumAssignments.organizationId] }).onDelete("cascade"),
  unique("sl_id_org_uq").on(t.id, t.organizationId),
  unique("sl_assignment_week_uq").on(t.assignmentId, t.weekNumber),
  unique("sl_assignment_lesson_uq").on(t.assignmentId, t.lessonId),
  index("sl_date_idx").on(t.organizationId, t.scheduledDate),
]);

export const classCurriculumAssignments = pgTable("class_curriculum_assignments", {
  id: pk(), organizationId: org(), classId: uuid("class_id").notNull(), assignmentId: uuid("assignment_id").notNull(),
  status: text("status").$type<"active" | "ended">().notNull().default("active"),
  createdAt: created(),
}, (t) => [
  foreignKey({ columns: [t.classId, t.organizationId], foreignColumns: [classes.id, classes.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.assignmentId, t.organizationId], foreignColumns: [curriculumAssignments.id, curriculumAssignments.organizationId] }).onDelete("cascade"),
  unique("cca_class_assignment_uq").on(t.classId, t.assignmentId),
]);

/** Explicit, audited adoption of a newer curriculum version by a church. Past weeks stay on the version they were taught from. */
export const versionAdoptions = pgTable("version_adoptions", {
  id: pk(), organizationId: org(), assignmentId: uuid("assignment_id").notNull(),
  fromVersionId: uuid("from_version_id").notNull().references(() => curriculumVersions.id),
  toVersionId: uuid("to_version_id").notNull().references(() => curriculumVersions.id),
  fromWeek: integer("from_week").notNull(),
  weeksMoved: integer("weeks_moved").notNull().default(0),
  adoptedBy: uuid("adopted_by").references(() => users.id),
  notes: text("notes").notNull().default(""),
  createdAt: created(),
}, (t) => [foreignKey({ columns: [t.assignmentId, t.organizationId], foreignColumns: [curriculumAssignments.id, curriculumAssignments.organizationId] }).onDelete("cascade")]);

export const lessonDeliveries = pgTable("lesson_deliveries", {
  id: pk(), organizationId: org(), scheduledLessonId: uuid("scheduled_lesson_id").notNull(), classId: uuid("class_id").notNull(), teacherId: uuid("teacher_id").notNull().references(() => users.id),
  deliveredAt: tstz("delivered_at"),
  notes: text("notes").notNull().default(""),
  status: text("status").$type<"planned" | "delivered">().notNull().default("planned"),
  createdAt: created(), updatedAt: updated(),
}, (t) => [
  foreignKey({ columns: [t.scheduledLessonId, t.organizationId], foreignColumns: [scheduledLessons.id, scheduledLessons.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.classId, t.organizationId], foreignColumns: [classes.id, classes.organizationId] }).onDelete("cascade"),
  unique("ld_lesson_class_uq").on(t.scheduledLessonId, t.classId),
]);

export const attendanceSessions = pgTable("attendance_sessions", {
  id: pk(), organizationId: org(), scheduledLessonId: uuid("scheduled_lesson_id").notNull(), classId: uuid("class_id").notNull(),
  recordedBy: uuid("recorded_by").notNull().references(() => users.id),
  sessionDate: date("session_date").notNull(),
  createdAt: created(), updatedAt: updated(),
}, (t) => [
  foreignKey({ columns: [t.scheduledLessonId, t.organizationId], foreignColumns: [scheduledLessons.id, scheduledLessons.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.classId, t.organizationId], foreignColumns: [classes.id, classes.organizationId] }).onDelete("cascade"),
  unique("as2_id_org_uq").on(t.id, t.organizationId), unique("as2_lesson_class_uq").on(t.scheduledLessonId, t.classId),
]);

export const attendanceRecords = pgTable("attendance_records", {
  id: pk(), organizationId: org(), attendanceSessionId: uuid("attendance_session_id").notNull(), learnerId: uuid("learner_id").notNull(),
  status: text("status").$type<"present" | "absent" | "late" | "excused">().notNull(),
  remarks: text("remarks"),
}, (t) => [
  foreignKey({ columns: [t.attendanceSessionId, t.organizationId], foreignColumns: [attendanceSessions.id, attendanceSessions.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.learnerId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId] }).onDelete("cascade"),
  unique("ar_session_learner_uq").on(t.attendanceSessionId, t.learnerId), index("ar_learner_idx").on(t.learnerId),
]);

export const lessonProgress = pgTable("lesson_progress", {
  id: pk(), organizationId: org(), learnerId: uuid("learner_id").notNull(), scheduledLessonId: uuid("scheduled_lesson_id").notNull(),
  status: text("status").$type<"in_progress" | "completed">().notNull().default("in_progress"),
  completedAt: tstz("completed_at"),
  createdAt: created(), updatedAt: updated(),
}, (t) => [
  foreignKey({ columns: [t.scheduledLessonId, t.organizationId], foreignColumns: [scheduledLessons.id, scheduledLessons.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.learnerId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId] }).onDelete("cascade"),
  unique("lp_learner_lesson_uq").on(t.learnerId, t.scheduledLessonId),
]);

export const lessonDiscussions = pgTable("lesson_discussions", {
  id: pk(), organizationId: org(), scheduledLessonId: uuid("scheduled_lesson_id").notNull(), classId: uuid("class_id").notNull(), facilitatorId: uuid("facilitator_id").notNull().references(() => users.id),
  prompt: text("prompt").notNull(),
  status: text("status").$type<"open" | "closed">().notNull().default("open"),
  createdAt: created(),
}, (t) => [
  foreignKey({ columns: [t.scheduledLessonId, t.organizationId], foreignColumns: [scheduledLessons.id, scheduledLessons.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.classId, t.organizationId], foreignColumns: [classes.id, classes.organizationId] }).onDelete("cascade"),
  unique("ldisc_id_org_uq").on(t.id, t.organizationId),
]);

export const discussionResponses = pgTable("discussion_responses", {
  id: pk(), organizationId: org(), discussionId: uuid("discussion_id").notNull(), learnerId: uuid("learner_id").notNull(),
  content: text("content").notNull(),
  moderationStatus: text("moderation_status").$type<"visible" | "hidden">().notNull().default("visible"),
  teacherReflection: text("teacher_reflection"),
  createdAt: created(),
}, (t) => [
  foreignKey({ columns: [t.discussionId, t.organizationId], foreignColumns: [lessonDiscussions.id, lessonDiscussions.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.learnerId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId] }).onDelete("cascade"),
  index("dr_discussion_idx").on(t.discussionId),
]);

export const assignments = pgTable("assignments", {
  id: pk(), organizationId: org(), classId: uuid("class_id").notNull(), scheduledLessonId: uuid("scheduled_lesson_id"),
  title: text("title").notNull(), instructions: text("instructions").notNull().default(""),
  dueAt: tstz("due_at"), totalMarks: integer("total_marks").notNull().default(10),
  status: text("status").$type<"draft" | "published" | "closed">().notNull().default("draft"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: created(),
}, (t) => [
  foreignKey({ columns: [t.classId, t.organizationId], foreignColumns: [classes.id, classes.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.scheduledLessonId, t.organizationId], foreignColumns: [scheduledLessons.id, scheduledLessons.organizationId] }),
  unique("asg_id_org_uq").on(t.id, t.organizationId),
]);

export const assignmentSubmissions = pgTable("assignment_submissions", {
  id: pk(), organizationId: org(), assignmentId: uuid("assignment_id").notNull(), learnerId: uuid("learner_id").notNull(),
  content: text("content").notNull(), submittedAt: tstz("submitted_at").defaultNow(),
  awardedMarks: integer("awarded_marks"), feedback: text("feedback"),
  gradingStatus: text("grading_status").$type<"submitted" | "graded">().notNull().default("submitted"),
}, (t) => [
  foreignKey({ columns: [t.assignmentId, t.organizationId], foreignColumns: [assignments.id, assignments.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.learnerId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId] }).onDelete("cascade"),
  unique("asub_assignment_learner_uq").on(t.assignmentId, t.learnerId),
]);

export const announcements = pgTable("announcements", {
  id: pk(), organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(), body: text("body").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  expiresAt: tstz("expires_at"),
  createdAt: created(),
}, (t) => [index("ann_org_idx").on(t.organizationId, t.createdAt)]);
