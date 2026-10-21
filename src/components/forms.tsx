"use client";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { FormState } from "@/server/action-util";

type Action = (prev: FormState | null, fd: FormData) => Promise<FormState>;

export function SubmitButton({ children, className, pendingLabel = "Working…", confirm }: { children: ReactNode; className?: string; pendingLabel?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clsx("btn btn-primary", className)} aria-busy={pending}
      onClick={(e) => { if (confirm && !pending && !window.confirm(confirm)) e.preventDefault(); }}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Form wired to a server action with loading, validation, success and error feedback. */
export function ActionForm({ action, children, submit = "Save", className, resetOnSuccess, hideSubmit, submitClass, confirm, noticeAbove }: { action: Action; children: ReactNode; submit?: string; className?: string; resetOnSuccess?: boolean; hideSubmit?: boolean; submitClass?: string; confirm?: string; noticeAbove?: boolean }) {
  const [state, formAction] = useActionState<FormState | null, FormData>(action, null);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.redirect) router.push(state.redirect);
    else if (state?.ok) { router.refresh(); if (resetOnSuccess) ref.current?.reset(); }
  }, [state, router, resetOnSuccess]);
  const notice = (
    <div aria-live="polite">
      {state?.error && <div role="alert" className="alert alert-error">{state.error}</div>}
      {state?.ok && state.message && <div role="status" className="alert alert-ok">{state.message}</div>}
    </div>
  );
  return (
    <form ref={ref} action={formAction} className={clsx("space-y-4", className)}>
      {noticeAbove && notice}
      {children}
      {!noticeAbove && notice}
      {!hideSubmit && <SubmitButton className={submitClass} confirm={confirm}>{submit}</SubmitButton>}
    </form>
  );
}

/** A one-click action button (e.g. approve / delete) that posts hidden fields. */
export function ActionButton({ action, fields, label, className, confirm, tone = "light" }: { action: Action; fields: Record<string, string>; label: string; className?: string; confirm?: string; tone?: "light" | "primary" | "danger" | "gold" | "ghost" }) {
  const [state, formAction] = useActionState<FormState | null, FormData>(action, null);
  const router = useRouter();
  useEffect(() => { if (state?.redirect) router.push(state.redirect); else if (state?.ok) router.refresh(); }, [state, router]);
  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton confirm={confirm} className={clsx("btn-sm", tone === "light" && "btn-light !text-brand", tone === "danger" && "btn-danger", tone === "gold" && "btn-gold", tone === "ghost" && "btn-ghost", tone === "light" && "!bg-white", className)}>{label}</SubmitButton>
      {state?.error && <span role="alert" className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}

export function PasswordInput({ name = "password", id, autoComplete = "current-password", required = true, minLength }: { name?: string; id?: string; autoComplete?: string; required?: boolean; minLength?: number }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id ?? name} name={name} type={show ? "text" : "password"} className="input pr-20" autoComplete={autoComplete} required={required} minLength={minLength} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-50">{show ? "Hide" : "Show"}</button>
    </div>
  );
}

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return <button type="button" className="btn btn-light btn-sm no-print" onClick={() => window.print()}>{label}</button>;
}

/** Church picker for member registration: search the list, or type a name when the church is not listed. */
export function ChurchPicker() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; city: string | null; state: string | null; country: string; status: string }[]>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [typed, setTyped] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (picked || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try { const r = await fetch(`/api/churches/search?q=${encodeURIComponent(q)}`); if (r.ok) setResults(await r.json()); } finally { setBusy(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, picked]);
  return (
    <fieldset className="space-y-3 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-navy">Your church</legend>
      {picked ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-leaf-50 p-3">
          <div><input type="hidden" name="orgId" value={picked.id} /><p className="font-semibold">{picked.name}</p><p className="text-xs text-mist">You will see this church&apos;s lessons once its administrator approves you.</p></div>
          <button type="button" className="btn btn-light btn-sm" onClick={() => { setPicked(null); setQ(""); }}>Change</button>
        </div>
      ) : typed ? (
        <div className="space-y-3">
          <p className="text-sm text-mist">Type your church&apos;s details. It will be listed as awaiting verification until its administrator registers it.</p>
          <div><label className="label" htmlFor="tc-name">Church name</label><input id="tc-name" name="typedName" className="input" required minLength={3} maxLength={160} /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor="tc-city">Town / city</label><input id="tc-city" name="typedCity" className="input" /></div>
            <div><label className="label" htmlFor="tc-state">State / region</label><input id="tc-state" name="typedState" className="input" /></div>
            <div><label className="label" htmlFor="tc-country">Country</label><input id="tc-country" name="typedCountry" className="input" defaultValue="Nigeria" /></div>
          </div>
          <button type="button" className="text-sm font-semibold text-brand underline" onClick={() => setTyped(false)}>Search the list instead</button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="label" htmlFor="church-q">Search for your church by name or town</label>
          <input id="church-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" role="combobox" aria-expanded={results.length > 0} aria-controls="church-results" placeholder="e.g. Grace Chapel, Ikeja" />
          <ul id="church-results" role="listbox" aria-label="Matching churches" className="max-h-60 divide-y divide-line overflow-auto rounded-lg border border-line bg-white">
            {results.map((c) => (
              <li key={c.id} role="option" aria-selected="false">
                <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-brand-50" onClick={() => setPicked({ id: c.id, name: c.name })}>
                  <span><span className="font-semibold">{c.name}</span><span className="block text-xs text-mist">{[c.city, c.state, c.country].filter(Boolean).join(", ")}</span></span>
                  {c.status === "unverified" && <span className="badge badge-warn">awaiting verification</span>}
                </button>
              </li>
            ))}
            {q.trim().length >= 2 && !busy && results.length === 0 && <li className="px-3 py-2 text-sm text-mist">No church found with that name.</li>}
          </ul>
          <button type="button" className="text-sm font-semibold text-brand underline" onClick={() => setTyped(true)}>My church is not listed. I will type its name.</button>
        </div>
      )}
    </fieldset>
  );
}
