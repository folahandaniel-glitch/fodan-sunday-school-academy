import type { OrgRole, PlatformRole } from "@/server/db/schema/identity";

/* Authorisation uses explicit permission keys, never role names, so roles can be re-shaped without touching call sites. */

export type PlatformPerm =
  | "admin.access" | "churches.manage" | "churches.view" | "users.manage" | "curriculum.write" | "curriculum.review" | "curriculum.publish"
  | "plans.manage" | "payments.view" | "site.edit" | "branding.edit" | "audit.view" | "jobs.view" | "settings.manage" | "forum.moderate" | "reports.platform";

const PLATFORM_ALL: PlatformPerm[] = ["admin.access", "churches.manage", "churches.view", "users.manage", "curriculum.write", "curriculum.review", "curriculum.publish", "plans.manage", "payments.view", "site.edit", "branding.edit", "audit.view", "jobs.view", "settings.manage", "forum.moderate", "reports.platform"];

export const PLATFORM_PERMS: Record<PlatformRole, PlatformPerm[]> = {
  super_admin: PLATFORM_ALL,
  curriculum_admin: ["admin.access", "curriculum.write", "curriculum.review", "forum.moderate", "reports.platform", "churches.view"],
  finance_admin: ["admin.access", "plans.manage", "payments.view", "reports.platform", "churches.view"],
  auditor: ["admin.access", "audit.view", "reports.platform", "churches.view", "jobs.view"],
  member: [],
};
export const platformCan = (role: PlatformRole | undefined | null, p: PlatformPerm) => !!role && PLATFORM_PERMS[role]?.includes(p);

export type OrgPerm =
  | "learn" | "org.profile.edit" | "org.settings" | "members.manage" | "classes.manage" | "curriculum.select" | "sessions.manage" | "attendance.record"
  | "lessons.deliver" | "lessons.teacher_view" | "assignments.manage" | "grading.mark" | "exams.manage" | "exams.supervise" | "results.publish"
  | "reports.view" | "billing.manage" | "announcements.manage" | "certificates.issue" | "classes.view";

const ORG_ALL: OrgPerm[] = ["org.profile.edit", "org.settings", "members.manage", "classes.manage", "curriculum.select", "sessions.manage", "attendance.record", "lessons.deliver", "lessons.teacher_view", "assignments.manage", "grading.mark", "exams.manage", "exams.supervise", "results.publish", "reports.view", "billing.manage", "announcements.manage", "certificates.issue", "classes.view"];

export const ORG_PERMS: Record<OrgRole, OrgPerm[]> = {
  church_admin: ORG_ALL,
  assistant_admin: ORG_ALL.filter((p) => p !== "billing.manage" && p !== "org.settings"),
  teacher: ["classes.view", "attendance.record", "lessons.deliver", "lessons.teacher_view", "assignments.manage", "grading.mark", "exams.manage", "results.publish", "reports.view"],
  learner: ["learn"],
  exam_supervisor: ["classes.view", "exams.supervise", "grading.mark", "reports.view"],
  coordinator: ["reports.view", "classes.view"],
  auditor: ["reports.view", "classes.view"],
};
export const orgCan = (role: OrgRole | undefined | null, p: OrgPerm) => !!role && ORG_PERMS[role]?.includes(p);

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  church_admin: "Church administrator / pastor", assistant_admin: "Assistant administrator", teacher: "Teacher", learner: "Learner",
  exam_supervisor: "Examination supervisor", coordinator: "Regional coordinator (read only)", auditor: "Read-only auditor",
};
export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "Super Admin", curriculum_admin: "Curriculum reviewer / editor", finance_admin: "Finance administrator", auditor: "Platform auditor (read only)", member: "Member",
};
/** Roles a church administrator may hand out. The administrator role itself can only be given by an administrator. */
export const ASSIGNABLE_ORG_ROLES: OrgRole[] = ["learner", "teacher", "assistant_admin", "exam_supervisor", "coordinator", "auditor"];
