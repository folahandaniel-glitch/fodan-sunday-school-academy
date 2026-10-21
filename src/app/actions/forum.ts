"use server";
import { run, s, b, type FormState } from "@/server/action-util";
import { requireUser, actorOf } from "@/server/guards";
import { createThread, moderate, reply, report, resolveReport } from "@/server/services/forum";

export async function newThreadAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const r = await createThread(user, s(fd, "category"), s(fd, "title"), s(fd, "body"));
    if (!r.ok) return { ok: false, error: r.error } as FormState;
    return { redirect: `/forum/thread/${r.id}` };
  });
}
export async function replyAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const r = await reply(user, s(fd, "threadId"), s(fd, "body"));
    if (!r.ok) return { ok: false, error: r.error } as FormState;
    return { message: "Reply posted." };
  });
}
export async function reportAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const r = await report(user, { threadId: s(fd, "threadId") || undefined, postId: s(fd, "postId") || undefined }, s(fd, "reason"));
    if (!r.ok) return { ok: false, error: r.error } as FormState;
    return { message: "Thank you. A moderator will look at this." };
  });
}
export async function moderateAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    await moderate(await actorOf(user), user, { kind: s(fd, "kind") as "thread" | "post", id: s(fd, "id"), to: s(fd, "to") as "hidden", pin: fd.has("pin") ? b(fd, "pin") : undefined });
    return { message: "Done." };
  });
}
export async function resolveReportAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    await resolveReport(await actorOf(user), user, s(fd, "id"), s(fd, "status") === "actioned" ? "actioned" : "dismissed");
  });
}
