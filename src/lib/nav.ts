export interface NavItem { label: string; href: string; icon?: string; group?: string; exact?: boolean }

export const LEARNER_NAV: NavItem[] = [
  { label: "My Dashboard", href: "/learn", icon: "home", exact: true },
  { label: "My Curriculum", href: "/learn/curriculum", icon: "book" },
  { label: "Weekly Lessons", href: "/learn/lessons", icon: "calendar" },
  { label: "Assignments", href: "/learn/assignments", icon: "pencil" },
  { label: "CBT Tests & Exams", href: "/learn/exams", icon: "clipboard" },
  { label: "My Results", href: "/learn/results", icon: "chart" },
  { label: "My Progress", href: "/learn/progress", icon: "trend" },
  { label: "Certificates", href: "/learn/certificates", icon: "award" },
  { label: "Community Forum", href: "/forum", icon: "chat" },
  { label: "Notifications", href: "/app/notifications", icon: "bell" },
  { label: "My Profile", href: "/app/profile", icon: "user" },
];

export const TEACHER_NAV: NavItem[] = [
  { label: "Teacher Overview", href: "/teach", icon: "home", exact: true },
  { label: "My Classes", href: "/teach/classes", icon: "users" },
  { label: "Weekly Lessons", href: "/teach/lessons", icon: "calendar" },
  { label: "Assignments", href: "/teach/assignments", icon: "pencil" },
  { label: "Assessment Management", href: "/teach/exams", icon: "clipboard" },
  { label: "Grading Queue", href: "/teach/grading", icon: "check" },
  { label: "Reports", href: "/teach/reports", icon: "chart" },
  { label: "Community Forum", href: "/forum", icon: "chat" },
  { label: "Notifications", href: "/app/notifications", icon: "bell" },
  { label: "Profile & Settings", href: "/app/profile", icon: "user" },
];

export const CHURCH_NAV: NavItem[] = [
  { label: "Church Overview", href: "/church", icon: "home", exact: true },
  { label: "Church Profile", href: "/church/profile", icon: "building" },
  { label: "Members", href: "/church/members", icon: "users" },
  { label: "Classes", href: "/church/classes", icon: "users" },
  { label: "Curriculum Library", href: "/church/library", icon: "book" },
  { label: "Academic Sessions", href: "/church/sessions", icon: "calendar" },
  { label: "Attendance & Lessons", href: "/church/lessons", icon: "check" },
  { label: "Assessments", href: "/church/exams", icon: "clipboard" },
  { label: "Grading Queue", href: "/church/grading", icon: "check" },
  { label: "Reports", href: "/church/reports", icon: "chart" },
  { label: "Certificates", href: "/church/certificates", icon: "award" },
  { label: "Subscription & Billing", href: "/church/billing", icon: "card" },
  { label: "Announcements", href: "/church/announcements", icon: "bell" },
  { label: "Church Settings", href: "/church/settings", icon: "cog" },
  { label: "Community Forum", href: "/forum", icon: "chat" },
  { label: "My Profile", href: "/app/profile", icon: "user" },
];

export const ADMIN_NAV: NavItem[] = [
  { label: "Platform Overview", href: "/admin", icon: "home", exact: true, group: "Overview" },
  { label: "Usage Analytics", href: "/admin/analytics", icon: "chart", group: "Overview" },
  { label: "Church Management", href: "/admin/churches", icon: "building", group: "People" },
  { label: "User Management", href: "/admin/users", icon: "users", group: "People" },
  { label: "Curriculum Library", href: "/admin/curricula", icon: "book", group: "Curriculum" },
  { label: "Content Review", href: "/admin/review", icon: "check", group: "Curriculum" },
  { label: "Completeness Report", href: "/admin/completeness", icon: "clipboard", group: "Curriculum" },
  { label: "Categories", href: "/admin/categories", icon: "tag", group: "Curriculum" },
  { label: "Import & Export", href: "/admin/import", icon: "upload", group: "Curriculum" },
  { label: "Subscription Plans", href: "/admin/plans", icon: "card", group: "Commerce" },
  { label: "Church Access Codes", href: "/admin/access-codes", icon: "tag", group: "Commerce" },
  { label: "Payments & Invoices", href: "/admin/payments", icon: "card", group: "Commerce" },
  { label: "Website Content", href: "/admin/site", icon: "globe", group: "Website" },
  { label: "Branding & Logos", href: "/admin/branding", icon: "palette", group: "Website" },
  { label: "Forum Moderation", href: "/admin/forum", icon: "chat", group: "Operations" },
  { label: "Integrations & Settings", href: "/admin/settings", icon: "cog", group: "Operations" },
  { label: "Background Jobs", href: "/admin/jobs", icon: "cog", group: "Operations" },
  { label: "Audit Logs", href: "/admin/audit", icon: "shield", group: "Operations" },
  { label: "Security", href: "/admin/security", icon: "shield", group: "Operations" },
];
