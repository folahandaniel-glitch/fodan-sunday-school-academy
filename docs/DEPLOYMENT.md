# Deployment (Vercel + managed PostgreSQL)

1. Create a PostgreSQL database (Neon via the Vercel Marketplace is recommended) and set `DATABASE_URL`.
2. Set `AUTH_SECRET`, `APP_URL`, `CRON_SECRET` (see `.env.example`). Optional: `RESEND_*` (email), `PAYSTACK_SECRET_KEY` (payments).
3. Build command: `npm run vercel-build`. It regenerates the content registry, applies migrations, seeds (idempotent) and builds. Migrations are additive; review any destructive migration before deploying.
4. Create the Super Admin once: `DATABASE_URL=... npm run admin:bootstrap -- you@example.org "Name"` (prints a one-time password; you must change it at first sign-in; turn on two-step verification).
5. Payments: register `https://YOUR-DOMAIN/api/payments/webhook/paystack` in Paystack, make a test-mode payment, confirm the plan activates. Not yet exercised against a live Paystack account.
6. Email: verify a sending domain in Resend. Until then email is **held**, never reported as sent.
7. Scheduler: `vercel.json` calls `/api/cron/maintenance` daily (send `Authorization: Bearer $CRON_SECRET`).
8. Smoke test: `/api/health`, home, library, sign-in, register a test church.

## Backups and restore
Use the provider's point-in-time restore and scheduled `pg_dump`. Restore test: restore to a branch/new database, point a preview deployment at it, sign in and open a programme. Not automated here.
