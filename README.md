# Fodan Sunday School Academy

Multi-church Sunday school curriculum, scheduling and CBT examination platform. A ministry of Fodan Gospel Outreach, sponsored by The Living Youth International.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · PostgreSQL via Drizzle ORM (embedded PGlite for local development) · Argon2id · TOTP · Vitest.

## Quick start
```bash
npm install
npm run dev                      # embedded database, no setup; seeds the catalogue on first request
npm run admin:bootstrap -- you@example.org "Your Name"   # prints a one-time temporary password
npm test                         # integration tests on a real (in-memory) PostgreSQL
npm run content:report           # lesson-by-lesson completeness report (no database needed)
npm run verify                   # typecheck + tests + production build
```

## The four foundations
1. **1,300 lesson units, verified, not assumed.** `npm run content:report` and Admin → Completeness Report check every unit: 26 per curriculum, minimum size in every teaching section, Scripture references that resolve to real Bible text, no placeholders, no paragraphs repeated across lessons, both assessment blueprints, and enough approved questions to build a mid-session test and a final examination. See `docs/CONTENT_REPORT.md` for the current numbers. Passing is structural: **content drafted with AI assistance is marked as such and cannot reach churches until a human reviewer approves it.**
2. **Curriculum versioning.** Versions are frozen when approved (service check **and** database trigger `0005_version_immutability.sql`). Churches pin one version per programme. A newer version is only *offered*; adoption is an explicit, audited action that moves only lessons not yet taught.
3. **Church data isolation.** The church comes from the signed-in user's active membership (`src/server/org.ts`), never from a URL or form. Every query is scoped to it, and the database refuses cross-church rows through composite foreign keys `(id, organization_id)`. Tests: `tests/platform.test.ts`.
4. **Members choose their church at registration** (search the list or type a name → an unverified listing), see only that church's features once approved, and **everyone can use the community forum** (`/forum`) immediately.

## Documentation
`docs/ARCHITECTURE.md` (architecture, schema, security, roles) · `docs/DEPLOYMENT.md` (deploy, backups, payments, email) · `docs/MANUALS.md` (Super Admin, church administrator, teacher, learner) · `docs/KNOWN_LIMITATIONS.md`.
