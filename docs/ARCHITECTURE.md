# Architecture

## Layers
- `src/lib`: pure logic with no database (completeness rules, scheduling, grading, exam selection, money, permissions, Bible reference parsing). Unit-testable.
- `src/server/services/*`: the only code that touches data. Every church-scoped function takes an `OrgCtx` (derived on the server) and filters by `ctx.orgId`.
- `src/app/actions/*`: server actions (forms). `src/app/api/*`: route handlers (exam autosave/submit, webhooks, exports, cron).
- `src/app/*`: pages. Areas: public `(site)`, auth `(auth)`, member hub `/app`, learner `/learn`, teacher `/teach`, church `/church`, Super Admin `/admin`, shared `/forum`.
- `src/content`: the 50-curriculum catalogue and authored lessons, expanded by `build.ts` into lessons, questions and blueprints; seeded idempotently by `src/server/seed`.

## Database (Drizzle migrations in `drizzle/`)
Migrations are incremental: `0000_identity`, `0001_curriculum`, `0002_scheduling_teaching`, `0003_assessment`, `0004_platform`, `0005_version_immutability` (triggers).
- Identity: users, sessions, auth_tokens, organizations, organization_memberships, audit_logs, settings, rate_limits.
- Curriculum: curriculum_categories, curricula, curriculum_versions, curriculum_lessons (structured fields + `content` JSON of sections), lesson_resources, curriculum_reviews, question_banks, questions, question_options, **question_answer_keys** (keys/explanations/rubrics, never sent to learners), assessment_blueprints, content_imports.
- Church: classes, class_memberships, class_teacher_assignments, session_templates, academic_sessions, session_calendar_exceptions, curriculum_assignments (**pins a version**), scheduled_lessons, class_curriculum_assignments, version_adoptions, lesson_deliveries, attendance_*, lesson_progress, lesson_discussions, discussion_responses, assignments, assignment_submissions, announcements.
- Assessment: examinations, examination_questions, examination_attempts, attempt_answers, assessment_results, result_feedback, certificates.
- Platform: subscription_plans, plan_entitlements, organization_subscriptions, payment_transactions, payment_webhook_events, invoices, entitlement_usage, site_pages, media_assets, logos, notifications, email_outbox, background_jobs, integration_settings, forum_*.
Deviations from the specification: roles and permissions are code-defined (`src/lib/permissions.ts`) rather than tables; rubrics live in `question_answer_keys.config`; lesson sections are JSON blocks in `curriculum_lessons.content` rather than a separate table.

## Isolation
Parent tables expose `UNIQUE (id, organization_id)`; children reference the pair, so a row cannot point at another church's parent even if application code is wrong. Row-level security is not used: the application connects as one role.

## Examination integrity
Server clock and deadline, shuffled order stored per attempt, answers autosaved to the server, idempotent submission (row lock), keys never in student payloads, results released by policy, written answers marked by teachers.

## Security
Argon2id; HttpOnly session cookies with HMAC-hashed tokens; lockout and rate limits; optional TOTP; Zod validation; SVG sanitiser; image signature + dimension checks; CSP and security headers; webhook HMAC verification; audit log with secret scrubbing; same-origin check on JSON endpoints.
