import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema, type Executor } from "../db";
import { getSetting } from "../settings";

/** In-app notification. `dedupeKey` makes retries harmless: the same key never creates a second row for the same recipient. */
export async function notify(recipientId: string, n: { type: string; title: string; body?: string; href?: string; orgId?: string | null; dedupeKey?: string }, db?: Executor) {
  const d = db ?? (await getDb());
  await d.insert(schema.notifications).values({ recipientId, organizationId: n.orgId ?? null, type: n.type, title: n.title, body: n.body ?? "", href: n.href ?? null, dedupeKey: n.dedupeKey ?? null }).onConflictDoNothing();
}

export async function notifyMany(recipientIds: string[], n: Parameters<typeof notify>[1]) {
  for (const id of recipientIds) await notify(id, { ...n, dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${id}` : undefined });
}

/** Queues an email. Delivery happens in the job runner; without a configured provider the message is HELD and never reported as sent. */
export async function queueEmail(to: string, subject: string, body: string, dedupeKey?: string, db?: Executor) {
  const d = db ?? (await getDb());
  await d.insert(schema.emailOutbox).values({ toEmail: to, subject, body, dedupeKey: dedupeKey ?? null }).onConflictDoNothing();
}

export async function emailAdminsOf(orgId: string, subject: string, body: string, dedupeKey?: string) {
  const db = await getDb();
  const admins = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId))
    .where(and(eq(schema.organizationMemberships.organizationId, orgId), eq(schema.organizationMemberships.status, "active"), inArray(schema.organizationMemberships.role, ["church_admin", "assistant_admin"])));
  for (const a of admins) {
    await notify(a.id, { type: "admin", title: subject, body, orgId, dedupeKey: dedupeKey ? `${dedupeKey}:${a.id}` : undefined, href: "/church/members" });
    if (a.email) await queueEmail(a.email, subject, body, dedupeKey ? `${dedupeKey}:${a.email}` : undefined);
  }
}

/** Sends queued messages through Resend when configured. Returns counts; never marks unsent mail as sent. */
export async function flushOutbox(limit = 25) {
  const db = await getDb();
  const rows = await db.select().from(schema.emailOutbox).where(inArray(schema.emailOutbox.status, ["queued", "held"])).orderBy(schema.emailOutbox.createdAt).limit(limit);
  const key = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM_EMAIL;
  let sent = 0, held = 0, failed = 0;
  for (const m of rows) {
    if (!key || !from) { if (m.status !== "held") await db.update(schema.emailOutbox).set({ status: "held", lastError: "No email provider configured." }).where(eq(schema.emailOutbox.id, m.id)); held++; continue; }
    try {
      const brand = await getSetting("brand");
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${brand.siteName} <${from}>`, to: [m.toEmail], subject: m.subject, text: m.body }),
      });
      if (!res.ok) throw new Error(`Provider responded ${res.status}`);
      await db.update(schema.emailOutbox).set({ status: "sent", sentAt: new Date(), attempts: m.attempts + 1, lastError: null }).where(eq(schema.emailOutbox.id, m.id));
      sent++;
    } catch (e) {
      await db.update(schema.emailOutbox).set({ status: m.attempts + 1 >= 5 ? "failed" : "queued", attempts: m.attempts + 1, lastError: (e as Error).message.slice(0, 300) }).where(eq(schema.emailOutbox.id, m.id));
      failed++;
    }
  }
  return { sent, held, failed };
}

export async function myNotifications(userId: string, limit = 50) {
  const db = await getDb();
  return db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, userId)).orderBy(desc(schema.notifications.createdAt)).limit(limit);
}
export async function unreadCount(userId: string) {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.recipientId, userId), isNull(schema.notifications.readAt)));
  return r.n;
}
export async function markAllRead(userId: string) {
  const db = await getDb();
  await db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.recipientId, userId), isNull(schema.notifications.readAt)));
}
