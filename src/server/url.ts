import "server-only";

/** Public base URL used in emails, payment callbacks and certificate links. */
export function appUrl() {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") || "http://localhost:3000";
  return u.replace(/\/+$/, "");
}
