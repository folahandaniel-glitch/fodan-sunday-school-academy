"use server";
import { run, s, type FormState } from "@/server/action-util";
import { requestCtx } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { queueEmail } from "@/server/services/notify";
import { getSetting } from "@/server/settings";
import { isEmail } from "@/lib/text";

export async function contactAction(_: FormState | null, fd: FormData): Promise<FormState> {
  return run(async () => {
    if (s(fd, "website")) return { message: "Thank you. Your message was sent." }; // honeypot: pretend success
    const ctx = await requestCtx();
    if (ctx.ip && !(await rateLimit(`contact:${ctx.ip}`, 5, 3600))) throw new (await import("@/server/org")).AccessError("Too many messages. Please try again later.");
    const name = s(fd, "name"), email = s(fd, "email"), message = s(fd, "message");
    if (name.length < 2 || !isEmail(email) || message.length < 10) throw new (await import("@/server/org")).AccessError("Please enter your name, a valid email and a message of at least 10 characters.");
    const to = (await getSetting("contact")).email;
    await queueEmail(to, `Website message from ${name.slice(0, 60)}`, `From: ${name} <${email}>\n\n${message.slice(0, 4000)}`);
    return { message: "Thank you. Your message was received and the Academy will reply by email." };
  });
}
