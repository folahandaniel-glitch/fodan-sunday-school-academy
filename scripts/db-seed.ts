// Applies migrations and seeds baseline data plus authored curriculum content against DATABASE_URL (or the local embedded database).
// Idempotent: safe to run on every deploy. Content that changed since the last seed becomes a NEW version awaiting review if the old one is published.
import { getDb } from "../src/server/db";
import { seedContent } from "../src/server/seed";

process.env.FSSA_AUTOSEED_CONTENT = "0";
(async () => {
const db = await getDb();
const r = await seedContent(db);
console.log("Seed complete:", JSON.stringify(r));
process.exit(0);
})();
