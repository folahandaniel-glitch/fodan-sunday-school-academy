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
/** Permissions the Super Admin may give to an individual person on top of their platform role. User, church and settings control stay with the Super Admin. */
export const PLATFORM_GRANTABLE: { perm: PlatformPerm; group: string; label: string }[] = [
  { perm: "site.edit", group: "Website", label: "Edit website pages, navigation, footer, contact details and banner" },
  { perm: "branding.edit", group: "Website", label: "Change logos and branding" },
  { perm: "curriculum.write", group: "Curriculum", label: "Write and edit curricula, lessons and questions" },
  { perm: "curriculum.review", group: "Curriculum", label: "Review and approve curricula (Review all)" },
  { perm: "curriculum.publish", group: "Curriculum", label: "Publish approved curricula (Publish all)" },
  { perm: "forum.moderate", group: "Community", label: "Moderate the community forum" },
  { perm: "plans.manage", group: "Commerce", label: "Edit subscription plans and access codes" },
  { perm: "payments.view", group: "Commerce", label: "View payments and invoices" },
  { perm: "churches.view", group: "Oversight", label: "View churches" },
  { perm: "reports.platform", group: "Oversight", label: "View platform reports and analytics" },
  { perm: "audit.view", group: "Oversight", label: "View the audit log" },
  { perm: "jobs.view", group: "Oversight", label: "View background jobs" },
];
export const PLATFORM_GRANTABLE_PERMS = PLATFORM_GRANTABLE.map((g) => g.perm);
type PlatformSubject = PlatformRole | { platformRole: PlatformRole; extraPerms?: readonly string[] };
/** Role defaults plus any permissions the Super Admin granted to this person. */
export function platformCan(subject: PlatformSubject | undefined | null, p: PlatformPerm): boolean {
  if (!subject) return false;
  const role = typeof subject === "string" ? subject : subject.platformRole;
  if (PLATFORM_PERMS[role]?.includes(p)) return true;
  if (typeof subject === "string") return false;
  const extra = subject.extraPerms ?? [];
  if (p === "admin.access") return extra.some((x) => (PLATFORM_GRANTABLE_PERMS as string[]).includes(x));
  return (PLATFORM_GRANTABLE_PERMS as string[]).includes(p) && extra.includes(p);
}

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
