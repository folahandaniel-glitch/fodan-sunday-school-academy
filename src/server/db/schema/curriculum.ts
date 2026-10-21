import { index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { created, pk, tstz, updated } from "./common";
import { users } from "./identity";
import type { AnswerConfig, AssessmentBlueprintConfig, KeyTerm, LessonContent, QuestionType } from "@/lib/lesson-types";

export const curriculumCategories = pgTable("curriculum_categories", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const ACCESS_TIERS = ["free", "standard", "premium"] as const;
export type AccessTier = (typeof ACCESS_TIERS)[number];

export const curricula = pgTable("curricula", {
  id: pk(),
  catalogNumber: integer("catalog_number"),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  shortDescription: text("short_description").notNull().default(""),
  fullDescription: text("full_description").notNull().default(""),
  categoryId: uuid("category_id").references(() => curriculumCategories.id),
  coverImage: text("cover_image"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  audience: text("audience").notNull().default("Teens and adults"),
  level: text("level").notNull().default("Foundation"),
  durationLabel: text("duration_label").notNull().default("26 weeks (six months)"),
  themes: jsonb("themes").$type<string[]>().notNull().default([]),
  outcomes: jsonb("outcomes").$type<string[]>().notNull().default([]),
  doctrinalNotes: text("doctrinal_notes").notNull().default(""),
  author: text("author").notNull().default("Fodan Gospel Outreach Curriculum Team"),
  accessTier: text("access_tier").$type<AccessTier>().notNull().default("free"),
  visibility: text("visibility").$type<"public" | "registered" | "private">().notNull().default("public"),
  /** draft: being authored; in_review: awaiting an authorised reviewer; published: available to churches; archived. */
  status: text("status").$type<"draft" | "in_review" | "published" | "archived">().notNull().default("draft"),
  /** The version churches see and select. Only ever points at a published, frozen version. */
  currentVersionId: uuid("current_version_id"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("curricula_status_idx").on(t.status), index("curricula_cat_idx").on(t.categoryId)]);

export const curriculumVersions = pgTable("curriculum_versions", {
  id: pk(),
  curriculumId: uuid("curriculum_id").notNull().references(() => curricula.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  /** draft and in_review are editable by authors; approved, published, superseded and archived are FROZEN (enforced by a database trigger). */
  status: text("status").$type<"draft" | "in_review" | "approved" | "published" | "superseded" | "archived" | "rejected">().notNull().default("draft"),
  authorId: uuid("author_id").references(() => users.id),
  reviewerId: uuid("reviewer_id").references(() => users.id),
  approvedAt: tstz("approved_at"),
  publishedAt: tstz("published_at"),
  changeSummary: text("change_summary").notNull().default(""),
  provenance: text("provenance").notNull().default("authored"),
  validation: jsonb("validation").$type<Record<string, unknown>>().notNull().default({}),
  contentHash: text("content_hash"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [unique("cv_curriculum_version_uq").on(t.curriculumId, t.versionNumber), index("cv_status_idx").on(t.status)]);

export const curriculumLessons = pgTable("curriculum_lessons", {
  id: pk(),
  versionId: uuid("version_id").notNull().references(() => curriculumVersions.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  theme: text("theme").notNull().default(""),
  unitKind: text("unit_kind").$type<"teaching" | "midtest" | "final" | "revision">().notNull().default("teaching"),
  primaryScripture: jsonb("primary_scripture").$type<string[]>().notNull().default([]),
  additionalScripture: jsonb("additional_scripture").$type<string[]>().notNull().default([]),
  memoryVerse: text("memory_verse").notNull().default(""),
  objectives: jsonb("objectives").$type<string[]>().notNull().default([]),
  keyTerms: jsonb("key_terms").$type<KeyTerm[]>().notNull().default([]),
  durationMinutes: integer("duration_minutes").notNull().default(45),
  content: jsonb("content").$type<LessonContent>().notNull(),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [unique("cl_version_week_uq").on(t.versionId, t.weekNumber)]);

export const lessonResources = pgTable("lesson_resources", {
  id: pk(),
  versionId: uuid("version_id").notNull().references(() => curriculumVersions.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").references(() => curriculumLessons.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("document"),
  title: text("title").notNull(),
  accessLevel: text("access_level").$type<"teacher" | "learner">().notNull().default("learner"),
  assetId: uuid("asset_id"),
  url: text("url"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
});

export const curriculumReviews = pgTable("curriculum_reviews", {
  id: pk(),
  versionId: uuid("version_id").notNull().references(() => curriculumVersions.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").references(() => users.id),
  decision: text("decision").$type<"submitted" | "approved" | "changes_requested" | "rejected" | "published">().notNull(),
  comments: text("comments").notNull().default(""),
  createdAt: created(),
});

export const questionBanks = pgTable("question_banks", {
  id: pk(),
  versionId: uuid("version_id").notNull().unique().references(() => curriculumVersions.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").$type<"draft" | "reviewed" | "published">().notNull().default("draft"),
  createdAt: created(),
});

export const questions = pgTable("questions", {
  id: pk(),
  bankId: uuid("bank_id").notNull().references(() => questionBanks.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => curriculumVersions.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").references(() => curriculumLessons.id, { onDelete: "set null" }),
  weekNumber: integer("week_number"),
  type: text("type").$type<QuestionType>().notNull(),
  text: text("text").notNull(),
  scriptureRef: text("scripture_ref"),
  difficulty: text("difficulty").$type<"easy" | "medium" | "hard">().notNull().default("medium"),
  marks: integer("marks").notNull().default(1),
  topicTags: jsonb("topic_tags").$type<string[]>().notNull().default([]),
  status: text("status").$type<"draft" | "reviewed" | "published">().notNull().default("draft"),
  reviewStatus: text("review_status").$type<"unreviewed" | "reviewed">().notNull().default("unreviewed"),
  authorId: uuid("author_id").references(() => users.id),
  reviewerId: uuid("reviewer_id").references(() => users.id),
  version: integer("version").notNull().default(1),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("q_version_idx").on(t.versionId, t.weekNumber), index("q_bank_idx").on(t.bankId)]);

export const questionOptions = pgTable("question_options", {
  id: pk(),
  questionId: uuid("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [index("qo_question_idx").on(t.questionId)]);

/** Answer keys, explanations and rubrics live here and are NEVER selected by student-facing queries. */
export const questionAnswerKeys = pgTable("question_answer_keys", {
  id: pk(),
  questionId: uuid("question_id").notNull().unique().references(() => questions.id, { onDelete: "cascade" }),
  config: jsonb("config").$type<AnswerConfig>().notNull(),
  explanation: text("explanation").notNull().default(""),
  reviewerId: uuid("reviewer_id").references(() => users.id),
  createdAt: created(),
  updatedAt: updated(),
});

export const assessmentBlueprints = pgTable("assessment_blueprints", {
  id: pk(),
  versionId: uuid("version_id").notNull().references(() => curriculumVersions.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"midtest" | "final">().notNull(),
  config: jsonb("config").$type<AssessmentBlueprintConfig>().notNull(),
  reviewStatus: text("review_status").$type<"unreviewed" | "reviewed">().notNull().default("unreviewed"),
  version: integer("version").notNull().default(1),
  createdAt: created(),
}, (t) => [unique("ab_version_kind_uq").on(t.versionId, t.kind)]);

export const contentImports = pgTable("content_imports", {
  id: pk(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  checksum: text("checksum").notNull(),
  status: text("status").$type<"previewed" | "saved_as_draft" | "failed">().notNull().default("previewed"),
  extracted: jsonb("extracted").$type<Record<string, unknown>>().notNull().default({}),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  curriculumId: uuid("curriculum_id"),
  createdAt: created(),
});
