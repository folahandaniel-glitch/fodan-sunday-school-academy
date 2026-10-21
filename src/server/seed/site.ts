import type { SiteSection } from "../db/schema";

const s = (id: string, type: string, data: Record<string, unknown>): SiteSection => ({ id, type, data });

export interface PageSeed { slug: string; title: string; kind: "page" | "legal" | "home"; sections: SiteSection[]; seo?: { title?: string; description?: string } }

const LEGAL_NOTE = "This notice is a working template prepared for the platform. It has not yet been reviewed by a lawyer. The Super Admin should have it reviewed against Nigerian data-protection and child-protection requirements, and the laws of any other country where the service is used, before relying on it.";

export const PAGES: PageSeed[] = [
  {
    slug: "home", title: "Home", kind: "home", seo: { title: "Fodan Sunday School Academy", description: "Choose a sound Bible curriculum, schedule a full six-month programme, teach with structured notes, and assess with CBT examinations." },
    sections: [
      s("hero", "hero", { eyebrow: "Sunday School curriculum, scheduling and examinations", title: "A sound Bible curriculum. A complete six-month programme.", subtitle: "Your church chooses a curriculum; the Academy builds the 26-week schedule, gives teachers structured lesson notes, and assesses learners with a mid-session test and final examination.", primaryLabel: "Register your church", primaryHref: "/register/church", secondaryLabel: "Browse the curriculum library", secondaryHref: "/library" }),
      s("features", "features", {
        title: "Everything a Sunday school needs in one place",
        items: [
          { icon: "book", title: "Fifty Bible curricula", body: "Fifty topics in five categories, each planned as 26 weekly lessons with teaching notes, Scripture, discussion questions and practical application." },
          { icon: "calendar", title: "Automatic six-month schedule", body: "Pick January to June or July to December. The Academy proposes the dates, tests, examination and revision weeks, and handles holidays and skipped Sundays." },
          { icon: "shield", title: "Your church's records stay yours", body: "Every church works in its own private space. No church can see another church's learners, classes, results or reports." },
          { icon: "clipboard", title: "CBT tests and examinations", body: "Timed computer-based tests with automatic marking for objective questions, teacher marking for written answers, and controlled release of results." },
          { icon: "users", title: "A forum for every member", body: "All members, from every church, can encourage one another and share teaching ideas in the moderated community forum." },
          { icon: "lock", title: "Stable lessons you can trust", body: "When a lesson is improved, churches already teaching the earlier version keep it until they choose to move to the new one." },
        ],
      }),
      s("how", "steps", {
        title: "How it works",
        items: [
          { title: "Register your church or join one", body: "Pastors register the church. Members register and choose their church from the list, or type the name if it is not listed." },
          { title: "Choose a curriculum and a session", body: "Select one of the published curricula and set the opening Sunday for January to June or July to December." },
          { title: "Teach and track", body: "Teachers deliver each week's lesson, take attendance, run discussions and set assignments. Learners read, respond and complete exercises." },
          { title: "Assess and celebrate", body: "Week 13 is the mid-session test, week 25 the final examination and week 26 revision. Eligible learners receive verifiable certificates." },
        ],
      }),
      s("cats", "categories", { title: "Five categories of Bible teaching" }),
      s("cta", "cta", { title: "Start with one session", body: "Registering a church is free. Choose a curriculum, set your opening Sunday and begin.", label: "Register your church", href: "/register/church" }),
    ],
  },
  {
    slug: "about", title: "About the Academy", kind: "page", seo: { title: "About", description: "About Fodan Sunday School Academy and the ministry behind it." },
    sections: [
      s("about1", "text", { title: "About Fodan Sunday School Academy", body: "Fodan Sunday School Academy is a Christian education service that helps churches in Nigeria and beyond teach the Bible in an orderly, thorough and measurable way.\n\nIt is a ministry of **Fodan Gospel Outreach**, sponsored by **The Living Youth International**, and was conceived by **Banjo Folahan Daniel**.\n\n## What we believe about teaching\n\nWe teach from the Bible as the inspired Word of God and affirm the historic Christian faith. Where faithful Christians differ, the lessons say so plainly and present the main views fairly.\n\n## How content is made\n\nCurriculum material is prepared in structured form and passes a review step before churches can select it. Scripture is always read from the Bible text by reference, never retyped from memory. Content drafted with the help of software is clearly marked until a human reviewer approves it." }),
    ],
  },
  {
    slug: "how-it-works", title: "How it works", kind: "page", seo: { title: "How it works" },
    sections: [
      s("hiw", "steps", {
        title: "From registration to certificate",
        items: [
          { title: "1. Register", body: "A pastor or church administrator registers the church. Members then register and choose their church." },
          { title: "2. Approve members", body: "The church administrator approves who belongs to the church, so only its members see its classes and records." },
          { title: "3. Set up classes and teachers", body: "Create classes, assign teachers and enrol learners." },
          { title: "4. Choose a curriculum and session", body: "Select a published curriculum and the January to June or July to December session. The scheduling wizard proposes 26 weeks of dates." },
          { title: "5. Teach", body: "Teachers open each week's lesson with notes, Scripture, discussion questions and activities, record attendance, and mark the lesson as delivered." },
          { title: "6. Test and examine", body: "Week 13 mid-session test, week 25 final examination, week 26 revision. Churches can change these weeks without changing the curriculum." },
          { title: "7. Report and certify", body: "Church leaders download reports and issue certificates to learners who meet the church's completion rules." },
        ],
      }),
      s("hiw-ver", "text", { title: "Your lessons never change under you", body: "Each church's programme is pinned to the exact version of the curriculum it chose. If we improve a lesson later, a new version is published. Your active programme stays on the version you started; you may review the changes and choose to adopt the new version for the weeks not yet taught." }),
    ],
  },
  {
    slug: "for-churches", title: "For churches", kind: "page", seo: { title: "For churches" },
    sections: [
      s("fc", "features", {
        title: "Built for pastors, Sunday school superintendents and teachers",
        items: [
          { icon: "building", title: "Private church workspace", body: "Your own members, classes, sessions, attendance, results and reports." },
          { icon: "calendar", title: "Flexible calendar", body: "Holidays, special services, skipped Sundays and rescheduling are handled without losing a single lesson." },
          { icon: "book", title: "Teacher-ready notes", body: "Introduction, context, teaching points, discussion questions with facilitator guidance, application and prayer." },
          { icon: "clipboard", title: "Assessments you control", body: "Choose test and examination weeks, durations, pass marks and when results are released." },
          { icon: "award", title: "Certificates", body: "Issue verifiable certificates to learners who meet your attendance, completion and score rules." },
          { icon: "chart", title: "Reports", body: "Attendance, lesson completion, assessment results and learners who need extra support, ready to download." },
        ],
      }),
      s("fc-cta", "cta", { title: "Ready to begin?", body: "Registration is free and takes about two minutes.", label: "Register your church", href: "/register/church" }),
    ],
  },
  {
    slug: "faq", title: "Frequently asked questions", kind: "page", seo: { title: "FAQ" },
    sections: [
      s("faq", "faq", {
        title: "Frequently asked questions",
        items: [
          { q: "Is the Academy free?", a: "Registration is free and the free plan covers a limited number of learners and classes. Paid plans with more capacity and features are configured by the Academy and appear on the Pricing page when available." },
          { q: "Can a church see another church's learners or results?", a: "No. Every church works in a private space. The system checks on the server that every record belongs to your church before showing or changing it." },
          { q: "I cannot find my church in the list when I register.", a: "Type your church's name instead. It will be listed as awaiting verification, and the church's administrator can then claim it and approve members. Until your church is verified you can still use the community forum." },
          { q: "What can members of other churches see?", a: "Only the community forum is shared across churches. Lessons, classes, attendance and results are visible only to your own church." },
          { q: "Will a lesson change while we are teaching it?", a: "No. Your programme is pinned to the curriculum version you chose. New versions are offered to you; you decide whether to adopt them." },
          { q: "Can we change the test and examination weeks?", a: "Yes. The default is week 13 for the mid-session test, week 25 for the final examination and week 26 for revision. Authorised church users can change these in the scheduling wizard without changing the curriculum." },
          { q: "Who reviews the lesson content?", a: "Curricula pass a review step before they are published to churches. Content that has not been reviewed is clearly marked and cannot be selected by churches." },
          { q: "Does it work on a phone with a slow connection?", a: "Yes. Pages are lightweight and the examination autosaves to the server. Examinations require an online connection; if the connection drops you can resume where you left off." },
        ],
      }),
    ],
  },
  {
    slug: "contact", title: "Contact", kind: "page", seo: { title: "Contact" },
    sections: [s("contact", "contact", { title: "Contact the Academy", body: "Questions about registering a church, curriculum or billing? Send us a message and we will reply by email." })],
  },
  {
    slug: "privacy", title: "Privacy notice", kind: "legal",
    sections: [s("legal", "text", { title: "Privacy notice", body: `> ${LEGAL_NOTE}\n\n## What we collect\n\nWe collect only what is needed to run the service: your name, email address or username, the church you belong to, your role, and your learning records (attendance, lesson progress, assignments, test and examination results).\n\n## Who can see it\n\nYour church's authorised leaders and your teachers can see your learning records. No other church can. Platform administrators can access records only for support and safety and their access is logged.\n\n## Forum\n\nIf you post in the community forum, your name (first name and the initial of your surname) and, unless you switch it off in your profile, your church's name are shown beside your posts.\n\n## Children\n\nChildren's accounts are created and managed by their church. We do not publish children's results or contact details. Children under 13 cannot post in the forum.\n\n## Your rights\n\nYou can ask us to correct, export or delete your personal information, subject to record-keeping needs. Contact us using the details on the Contact page.\n\n## Security\n\nPasswords are stored using strong one-way hashing. Examination answer keys are never sent to the browser before release.` })],
  },
  {
    slug: "terms", title: "Terms of service", kind: "legal",
    sections: [s("legal", "text", { title: "Terms of service", body: `> ${LEGAL_NOTE}\n\n## Using the service\n\nThe Academy provides Bible curricula, scheduling tools, assessments and a community forum for churches. You agree to use it lawfully and respectfully.\n\n## Church accounts\n\nA church administrator is responsible for the people they approve, the content they post and keeping their login secure.\n\n## Curriculum content\n\nCurriculum content remains the property of its authors and the Academy. Churches may use it for teaching their own members. Do not resell or republish it.\n\n## Forum conduct\n\nBe respectful. Posts that are abusive, hateful, sexually explicit, deceptive or unsafe may be removed and accounts suspended.\n\n## Payments\n\nPaid plans are billed as shown at checkout. Access is activated only after payment is verified by the payment provider.\n\n## Changes\n\nWe may update these terms. Significant changes will be announced in the service.` })],
  },
  {
    slug: "accessibility", title: "Accessibility statement", kind: "legal",
    sections: [s("legal", "text", { title: "Accessibility statement", body: `We aim to meet WCAG 2.2 level AA. The site supports keyboard navigation, visible focus, semantic headings, labelled forms and sufficient colour contrast, and the examination timer announces warnings to screen readers.\n\nThis is a target, not a certification: the platform has not yet had a full external accessibility audit. If you meet a barrier, please tell us on the Contact page and we will help and fix it.` })],
  },
];
