// Creates (or promotes) the primary Super Admin. Usage:
//   npm run admin:bootstrap -- you@example.org "Full Name"
// A one-time temporary password is printed once (and, when run locally, saved outside the repo). The account must change it at first sign-in.
import fs from "node:fs";
import path from "node:path";
import { bootstrapSuperAdmin } from "../src/server/services/auth";
import { temporaryPassword } from "../src/server/crypto";
import { dataDir } from "../src/server/db";

(async () => {
const email = process.argv[2] ?? process.env.SUPERADMIN_EMAIL;
const name = process.argv[3] ?? "Super Admin";
if (!email) { console.error("Usage: npm run admin:bootstrap -- email \"Full Name\""); process.exit(1); }
const temp = temporaryPassword();
const r = await bootstrapSuperAdmin(email, name, temp);
if (!r.created) { console.log(`An account for ${email} already exists; it is now a Super Admin. Password unchanged.`); process.exit(0); }
console.log(`Super Admin created: ${email}\nTemporary password (shown once): ${temp}\nSign in at /login; you will be asked to choose a new password.`);
if (!process.env.DATABASE_URL) { const f = path.join(dataDir(), "BOOTSTRAP_ADMIN.txt"); fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(f, `${email}\n${temp}\n`); console.log(`(Also saved to ${f}; delete it after first sign-in.)`); }
process.exit(0);
})();
