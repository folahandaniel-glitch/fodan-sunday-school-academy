import { boolean, foreignKey, index, integer, jsonb, numeric, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { created, pk, tstz, updated } from "./common";
import { organizationMemberships, organizations, users } from "./identity";
import { questions } from "./curriculum";
import { curriculumAssignments, scheduledLessons } from "./teaching";

const org = () => uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" });
const marks = (name: string) => numeric(name, { precision: 8, scale: 2, mode: "number" });

export const examinations = pgTable("examinations", {
  id: pk(), organizationId: org(), assignmentId: uuid("assignment_id").notNull(), scheduledLessonId: uuid("scheduled_lesson_id"),
  title: text("title").notNull(),
  kind: text("kind").$type<"midtest" | "final" | "practice" | "custom">().notNull(),
  instructions: text("instructions").notNull().default(""),
  durationSeconds: integer("duration_seconds").notNull().default(3600),
  totalMarks: marks("total_marks").notNull().default(0),
  passPercent: integer("pass_percent").notNull().default(50),
  opensAt: tstz("opens_at"), closesAt: tstz("closes_at"),
  attemptLimit: integer("attempt_limit").notNull().default(1),
  shuffleQuestions: boolean("shuffle_questions").notNull().default(true),
  shuffleOptions: boolean("shuffle_options").notNull().default(true),
  /** immediate: objective results visible on submit; after_review: when a teacher publishes; manual: only when published. */
  resultPolicy: text("result_policy").$type<"immediate" | "after_review" | "manual">().notNull().default("after_review"),
  /** When learners may see correct answers and explanations. */
  reviewPolicy: text("review_policy").$type<"never" | "after_publish" | "after_close">().notNull().default("after_publish"),
  latePolicy: text("late_policy").$type<"reject" | "accept_flagged">().notNull().default("reject"),
  classIds: jsonb("class_ids").$type<string[]>().notNull().default([]),
  status: text("status").$type<"draft" | "published" | "closed" | "archived">().notNull().default("draft"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: created(), updatedAt: updated(),
}, (t) => [
  foreignKey({ columns: [t.assignmentId, t.organizationId], foreignColumns: [curriculumAssignments.id, curriculumAssignments.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.scheduledLessonId, t.organizationId], foreignColumns: [scheduledLessons.id, scheduledLessons.organizationId] }),
  unique("ex_id_org_uq").on(t.id, t.organizationId), index("ex_org_status_idx").on(t.organizationId, t.status),
]);

export const examinationQuestions = pgTable("examination_questions", {
  id: pk(), organizationId: org(), examId: uuid("exam_id").notNull(), questionId: uuid("question_id").notNull().references(() => questions.id),
  marks: marks("marks").notNull().default(1), sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [
  foreignKey({ columns: [t.examId, t.organizationId], foreignColumns: [examinations.id, examinations.organizationId] }).onDelete("cascade"),
  unique("eq_exam_question_uq").on(t.examId, t.questionId), unique("eq_id_org_uq").on(t.id, t.organizationId),
]);

export const examinationAttempts = pgTable("examination_attempts", {
  id: pk(), organizationId: org(), examId: uuid("exam_id").notNull(), learnerId: uuid("learner_id").notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  status: text("status").$type<"in_progress" | "submitted">().notNull().default("in_progress"),
  submitMethod: text("submit_method").$type<"learner" | "auto_deadline" | "late_flagged">(),
  startedAt: tstz("started_at").defaultNow(), deadlineAt: tstz("deadline_at").notNull(), submittedAt: tstz("submitted_at"),
  questionOrder: jsonb("question_order").$type<string[]>().notNull().default([]),
  optionOrder: jsonb("option_order").$type<Record<string, string[]>>().notNull().default({}),
  score: marks("score"), totalMarks: marks("total_marks"), percentage: marks("percentage"),
  gradingStatus: text("grading_status").$type<"not_graded" | "auto_graded" | "pending_review" | "graded">().notNull().default("not_graded"),
  events: jsonb("events").$type<{ t: string; e: string }[]>().notNull().default([]),
  createdAt: created(), updatedAt: updated(),
}, (t) => [
  foreignKey({ columns: [t.examId, t.organizationId], foreignColumns: [examinations.id, examinations.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.learnerId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId] }).onDelete("cascade"),
  unique("att_id_org_uq").on(t.id, t.organizationId),
  unique("att_exam_learner_no_uq").on(t.examId, t.learnerId, t.attemptNumber),
  index("att_learner_idx").on(t.learnerId),
]);

export const attemptAnswers = pgTable("attempt_answers", {
  id: pk(), organizationId: org(), attemptId: uuid("attempt_id").notNull(), examQuestionId: uuid("exam_question_id").notNull(),
  answer: jsonb("answer").$type<unknown>(),
  flagged: boolean("flagged").notNull().default(false),
  awardedMarks: marks("awarded_marks"),
  reviewStatus: text("review_status").$type<"auto" | "pending" | "reviewed">().notNull().default("pending"),
  feedback: text("feedback"),
  updatedAt: updated(),
}, (t) => [
  foreignKey({ columns: [t.attemptId, t.organizationId], foreignColumns: [examinationAttempts.id, examinationAttempts.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.examQuestionId, t.organizationId], foreignColumns: [examinationQuestions.id, examinationQuestions.organizationId] }).onDelete("cascade"),
  unique("aa_attempt_question_uq").on(t.attemptId, t.examQuestionId),
]);

export const assessmentResults = pgTable("assessment_results", {
  id: pk(), organizationId: org(), examId: uuid("exam_id").notNull(), learnerId: uuid("learner_id").notNull(), attemptId: uuid("attempt_id").notNull(),
  awardedMarks: marks("awarded_marks").notNull(), totalMarks: marks("total_marks").notNull(), percentage: marks("percentage").notNull(),
  grade: text("grade").notNull(), passStatus: text("pass_status").$type<"pass" | "fail">().notNull(),
  publicationStatus: text("publication_status").$type<"unpublished" | "published">().notNull().default("unpublished"),
  publishedAt: tstz("published_at"), publishedBy: uuid("published_by").references(() => users.id),
  createdAt: created(), updatedAt: updated(),
}, (t) => [
  foreignKey({ columns: [t.examId, t.organizationId], foreignColumns: [examinations.id, examinations.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.attemptId, t.organizationId], foreignColumns: [examinationAttempts.id, examinationAttempts.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.learnerId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId] }).onDelete("cascade"),
  unique("ar2_attempt_uq").on(t.attemptId), unique("ar2_id_org_uq").on(t.id, t.organizationId), index("ar2_learner_idx").on(t.learnerId),
]);

export const resultFeedback = pgTable("result_feedback", {
  id: pk(), organizationId: org(), resultId: uuid("result_id").notNull(), authorId: uuid("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  status: text("status").$type<"draft" | "published">().notNull().default("draft"),
  createdAt: created(),
}, (t) => [foreignKey({ columns: [t.resultId, t.organizationId], foreignColumns: [assessmentResults.id, assessmentResults.organizationId] }).onDelete("cascade")]);

export const certificates = pgTable("certificates", {
  id: pk(), organizationId: org(), learnerId: uuid("learner_id").notNull(), assignmentId: uuid("assignment_id").notNull(),
  verificationCode: text("verification_code").notNull().unique(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  issuedBy: uuid("issued_by").references(() => users.id),
  issuedAt: tstz("issued_at").defaultNow(), revokedAt: tstz("revoked_at"),
}, (t) => [
  foreignKey({ columns: [t.assignmentId, t.organizationId], foreignColumns: [curriculumAssignments.id, curriculumAssignments.organizationId] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.learnerId], foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId] }).onDelete("cascade"),
  unique("cert_learner_assignment_uq").on(t.learnerId, t.assignmentId),
]);
