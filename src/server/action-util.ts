import "server-only";
import { ZodError } from "zod";
import { AccessError, NotFoundError } from "./org";
import { EntitlementError } from "./services/entitlements";
import { FrozenError } from "./services/curriculum";

export interface FormState { ok?: boolean; error?: string; message?: string; redirect?: string; data?: Record<string, unknown> }

const isNextControl = (e: unknown) => typeof (e as { digest?: string })?.digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP)/.test((e as { digest: string }).digest);

/** Runs a mutation and turns known failures into friendly messages. Never leaks stack traces or internals. */
export async function run(fn: () => Promise<Partial<FormState> | void>): Promise<FormState> {
  try {
    const r = (await fn()) ?? {};
    return { ok: true, ...r };
  } catch (e) {
    if (isNextControl(e)) throw e;
    if (e instanceof AccessError || e instanceof NotFoundError || e instanceof FrozenError) return { ok: false, error: e.message };
    if (e instanceof EntitlementError) return { ok: false, error: `${e.message} Ask your church administrator about upgrading the plan.` };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Please check the form." };
    const err = e as { code?: string; cause?: { code?: string; message?: string }; message?: string };
    const code = err.cause?.code ?? err.code;
    if (code === "23505") return { ok: false, error: "That already exists." };
    if (code === "23503" || code === "23514") return { ok: false, error: "That change is not allowed for this record." };
    console.error("[action]", err.message, err.cause?.message ?? "");
    return { ok: false, error: "Something went wrong. Please try again, and contact the Academy if it keeps happening." };
  }
}

export const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const sOpt = (fd: FormData, k: string) => { const v = s(fd, k); return v || undefined; };
export const n = (fd: FormData, k: string, d = 0) => { const v = Number(fd.get(k)); return Number.isFinite(v) ? v : d; };
export const b = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true" || fd.get(k) === "1";
export const lines = (fd: FormData, k: string) => s(fd, k).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
