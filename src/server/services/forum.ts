import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { AccessError, NotFoundError } from "../org";
import { rateLimit } from "../rate-limit";
import { audit, type Actor } from "../audit";
import { getSetting } from "../settings";
import { initialsName } from "@/lib/text";
import { platformCan } from "@/lib/permissions";
import type { SessionUser } from "../auth/session";

/*
 * The forum is the ONE shared space across churches. Every signed-in member may read and post, whether or not their church has approved
 * them yet. Authors appear only as "First L." plus (optionally) their church's name. Nothing else about them is exposed.
 */
export async function forumCategories() {
  const db = await getDb();
  return db.select({ c: schema.forumCategories, threads: sql<number>`(select count(*)::int from forum_threads t where t.category_id = ${schema.forumCategories.id} and t.status <> 'hidden')` }).from(schema.forumCategories).orderBy(asc(schema.forumCategories.sortOrder));
}

async function authorLabels(ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; church: string | null; staff: boolean }>();
  const db = await getDb();
  const rows = await db.select({ u: schema.users, church: sql<string | null>`(select o.name from organization_memberships m join organizations o on o.id = m.organization_id where m.user_id = ${schema.users.id} and m.status = 'active' and o.status = 'active' order by m.created_at limit 1)` })
    .from(schema.users).where(sql`${schema.users.id} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
  return new Map(rows.map((r) => [r.u.id, { name: initialsName(r.u.fullName), church: r.u.showChurchInForum ? r.church : null, staff: r.u.platformRole === "super_admin" || r.u.platformRole === "curriculum_admin" }]));
}

export async function listThreads(categorySlug: string, page = 1, pageSize = 20) {
  const db = await getDb();
  const [cat] = await db.select().from(schema.forumCategories).where(eq(schema.forumCategories.slug, categorySlug));
  if (!cat) throw new NotFoundError("Category not found.");
  const rows = await db.select().from(schema.forumThreads).where(and(eq(schema.forumThreads.categoryId, cat.id), eq(schema.forumThreads.status, "visible"))).orderBy(desc(schema.forumThreads.pinned), desc(schema.forumThreads.lastActivityAt)).limit(pageSize).offset((page - 1) * pageSize);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.forumThreads).where(and(eq(schema.forumThreads.categoryId, cat.id), eq(schema.forumThreads.status, "visible")));
  const labels = await authorLabels([...new Set(rows.map((r) => r.authorId))]);
  return { category: cat, threads: rows.map((t) => ({ ...t, author: labels.get(t.authorId) })), total: n, page, pageSize };
}

export async function getThread(threadId: string, viewer: SessionUser) {
  const db = await getDb();
  if (!/^[0-9a-f-]{36}$/.test(threadId)) throw new NotFoundError();
  const [t] = await db.select().from(schema.forumThreads).where(eq(schema.forumThreads.id, threadId));
  const mod = platformCan(viewer.platformRole, "forum.moderate");
  if (!t || (t.status === "hidden" && !mod)) throw new NotFoundError("Thread not found.");
  const [cat] = await db.select().from(schema.forumCategories).where(eq(schema.forumCategories.id, t.categoryId));
  const posts = await db.select().from(schema.forumPosts).where(and(eq(schema.forumPosts.threadId, threadId), mod ? undefined : eq(schema.forumPosts.status, "visible"))).orderBy(asc(schema.forumPosts.createdAt));
  const labels = await authorLabels([...new Set([t.authorId, ...posts.map((p) => p.authorId)])]);
  return { thread: { ...t, author: labels.get(t.authorId) }, category: cat, posts: posts.map((p) => ({ ...p, author: labels.get(p.authorId), mine: p.authorId === viewer.id })), canModerate: mod };
}

async function assertMayPost(user: SessionUser) {
  const f = await getSetting("features");
  if (!f.forumEnabled) throw new AccessError("The forum is currently closed.");
  if (user.isMinor) throw new AccessError("Accounts for children can read the forum but cannot post. Ask a leader if you need help.");
  if (f.forumRequiresVerifiedEmail) {
    const db = await getDb();
    const [u] = await db.select({ v: schema.users.emailVerifiedAt }).from(schema.users).where(eq(schema.users.id, user.id));
    if (!u?.v) throw new AccessError("Please confirm your email address to post in the forum.");
  }
  if (!(await rateLimit(`forum:post:${user.id}`, 12, 600))) throw new AccessError("You are posting too quickly. Please wait a few minutes.");
}

const clean = (s: string) => s.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();

export async function createThread(user: SessionUser, categorySlug: string, title: string, body: string) {
  await assertMayPost(user);
  const t = clean(title), b = clean(body);
  if (t.length < 5 || t.length > 150) return { ok: false as const, error: "The title must be 5 to 150 characters." };
  if (b.length < 10 || b.length > 6000) return { ok: false as const, error: "The message must be 10 to 6000 characters." };
  const db = await getDb();
  const [cat] = await db.select().from(schema.forumCategories).where(eq(schema.forumCategories.slug, categorySlug));
  if (!cat) throw new NotFoundError("Category not found.");
  if (cat.staffOnlyPosting && !platformCan(user.platformRole, "forum.moderate")) throw new AccessError("Only Academy staff can post in this category.");
  const [row] = await db.insert(schema.forumThreads).values({ categoryId: cat.id, authorId: user.id, title: t, body: b }).returning({ id: schema.forumThreads.id });
  return { ok: true as const, id: row.id };
}
export async function reply(user: SessionUser, threadId: string, body: string) {
  await assertMayPost(user);
  const b = clean(body);
  if (b.length < 2 || b.length > 6000) return { ok: false as const, error: "The reply must be 2 to 6000 characters." };
  const db = await getDb();
  const [t] = await db.select().from(schema.forumThreads).where(eq(schema.forumThreads.id, threadId));
  if (!t || t.status !== "visible") throw new NotFoundError("Thread not found or locked.");
  await db.insert(schema.forumPosts).values({ threadId, authorId: user.id, body: b });
  await db.update(schema.forumThreads).set({ replyCount: sql`${schema.forumThreads.replyCount} + 1`, lastActivityAt: new Date() }).where(eq(schema.forumThreads.id, threadId));
  return { ok: true as const };
}
export async function report(user: SessionUser, target: { threadId?: string; postId?: string }, reason: string) {
  if (reason.trim().length < 5) return { ok: false as const, error: "Tell us what is wrong." };
  if (!(await rateLimit(`forum:report:${user.id}`, 10, 3600))) return { ok: false as const, error: "Too many reports. Please wait." };
  const db = await getDb();
  await db.insert(schema.forumReports).values({ reporterId: user.id, threadId: target.threadId ?? null, postId: target.postId ?? null, reason: reason.trim().slice(0, 500) });
  return { ok: true as const };
}

/* ---- moderation ---- */
export async function moderate(actor: Actor, user: SessionUser, action: { kind: "thread" | "post"; id: string; to: "hidden" | "visible" | "locked"; pin?: boolean }) {
  if (!platformCan(user.platformRole, "forum.moderate")) throw new AccessError();
  const db = await getDb();
  if (action.kind === "thread") await db.update(schema.forumThreads).set({ status: action.to, ...(action.pin !== undefined ? { pinned: action.pin } : {}) }).where(eq(schema.forumThreads.id, action.id));
  else await db.update(schema.forumPosts).set({ status: action.to === "hidden" ? "hidden" : "visible" }).where(eq(schema.forumPosts.id, action.id));
  await audit(actor, `forum.${action.kind}_${action.to}`, { type: `forum_${action.kind}`, id: action.id });
}
export async function openReports(user: SessionUser) {
  if (!platformCan(user.platformRole, "forum.moderate")) throw new AccessError();
  const db = await getDb();
  return db.select({ r: schema.forumReports, reporter: schema.users.fullName }).from(schema.forumReports).innerJoin(schema.users, eq(schema.users.id, schema.forumReports.reporterId)).where(eq(schema.forumReports.status, "open")).orderBy(desc(schema.forumReports.createdAt)).limit(100);
}
export async function resolveReport(actor: Actor, user: SessionUser, id: string, status: "actioned" | "dismissed") {
  if (!platformCan(user.platformRole, "forum.moderate")) throw new AccessError();
  const db = await getDb();
  await db.update(schema.forumReports).set({ status, handledBy: user.id }).where(eq(schema.forumReports.id, id));
}
