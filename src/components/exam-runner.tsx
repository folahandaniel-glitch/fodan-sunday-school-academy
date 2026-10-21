"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

interface Q { eqId: string; number: number; type: string; text: string; scriptureRef: string | null; marks: number; options: { id: string; text: string }[]; answer: unknown; flagged: boolean }
interface Props { attemptId: string; examId: string; examTitle: string; attemptNumber: number; serverNow: number; deadlineAt: number; questions: Q[] }
type Save = "saved" | "saving" | "retrying";

const fmt = (s: number) => { const m = Math.floor(s / 60), r = s % 60; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}`; };
const answered = (a: unknown) => !(a === null || a === undefined || a === "" || (Array.isArray(a) && a.length === 0));

export function ExamRunner(p: Props) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => Object.fromEntries(p.questions.map((q) => [q.eqId, q.answer])));
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(p.questions.map((q) => [q.eqId, q.flagged])));
  const [save, setSave] = useState<Save>("saved");
  const [announce, setAnnounce] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const offset = useRef(p.serverNow - Date.now());
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((p.deadlineAt - p.serverNow) / 1000)));
  const queue = useRef(new Map<string, { eqId: string; answer: unknown; flagged?: boolean }>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const done = useRef(false);

  const finish = useCallback(() => { done.current = true; window.location.href = `/learn/exams/${p.examId}?submitted=1`; }, [p.examId]);

  const flush = useCallback(async () => {
    if (queue.current.size === 0) { setSave("saved"); return; }
    setSave((s) => (s === "retrying" ? s : "saving"));
    for (const [key, item] of [...queue.current.entries()]) {
      try {
        const r = await fetch(`/api/exam/${p.attemptId}/answer`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) { if (queue.current.get(key) === item) queue.current.delete(key); }
        else if (j.code === "expired" || j.code === "submitted") { finish(); return; }
        else if (r.status === 401) { setSave("retrying"); setAnnounce("You were signed out. Open the site in another tab and sign in again; your answers are kept here."); return; }
        else if (r.status >= 400 && r.status < 500 && r.status !== 429) { queue.current.delete(key); }
        else throw new Error("retry");
      } catch { setSave("retrying"); return; }
    }
    setSave(queue.current.size ? "saving" : "saved");
  }, [p.attemptId, finish]);

  // Retry unsent answers every few seconds (flaky mobile networks).
  useEffect(() => { const t = setInterval(() => { if (queue.current.size) void flush(); }, 4000); return () => clearInterval(t); }, [flush]);

  const submit = useCallback(async (auto = false) => {
    if (done.current) return;
    setSubmitting(true);
    for (const t of timers.current.values()) clearTimeout(t);
    await flush();
    for (let i = 0; i < 4; i++) {
      try {
        const r = await fetch(`/api/exam/${p.attemptId}/submit`, { method: "POST" });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) { finish(); return; }
      } catch { /* retry */ }
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
    setSubmitting(false);
    setAnnounce(auto ? "Time is up but your connection is unstable. Keep this page open; it will keep trying to submit." : "Could not submit yet. Your answers are saved. Please try again.");
    if (auto) setTimeout(() => void submit(true), 5000);
  }, [flush, finish, p.attemptId]);

  // Server-authoritative countdown: the deadline came from the server; the browser only displays it.
  useEffect(() => {
    const t = setInterval(() => {
      const rem = Math.max(0, Math.floor((p.deadlineAt - (Date.now() + offset.current)) / 1000));
      setLeft(rem);
      if (rem === 600 || rem === 300 || rem === 60 || rem === 30 || rem === 10) setAnnounce(rem >= 60 ? `${rem / 60} minutes remaining.` : `${rem} seconds remaining.`);
      if (rem === 0 && !done.current) void submit(true);
    }, 1000);
    return () => clearInterval(t);
  }, [p.deadlineAt, submit]);

  useEffect(() => {
    const ev = (e: string) => { void fetch(`/api/exam/${p.attemptId}/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: e }) }).catch(() => null); };
    const vis = () => ev(document.hidden ? "tab_hidden" : "tab_visible");
    const on = () => { ev("reconnected"); void flush(); };
    document.addEventListener("visibilitychange", vis); window.addEventListener("online", on);
    const before = (e: BeforeUnloadEvent) => { if (queue.current.size && !done.current) { e.preventDefault(); } };
    window.addEventListener("beforeunload", before);
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("online", on); window.removeEventListener("beforeunload", before); };
  }, [p.attemptId, flush]);

  const q = p.questions[idx];
  const set = useCallback((eqId: string, answer: unknown, debounce = 0) => {
    setAnswers((a) => ({ ...a, [eqId]: answer }));
    queue.current.set(eqId, { eqId, answer, flagged: undefined });
    setSave("saving");
    const old = timers.current.get(eqId); if (old) clearTimeout(old);
    timers.current.set(eqId, setTimeout(() => void flush(), debounce));
  }, [flush]);

  const toggleFlag = (eqId: string) => {
    const next = !flags[eqId];
    setFlags((f) => ({ ...f, [eqId]: next }));
    queue.current.set(`flag:${eqId}`, { eqId, answer: answers[eqId] ?? null, flagged: next, flagOnly: true } as never);
    void flush();
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" && (e.target as HTMLInputElement).type === "text") return;
      if (e.key === "ArrowRight") setIdx((i) => Math.min(p.questions.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      else if (/^[1-9]$/.test(e.key)) {
        const cur = p.questions[idxRef.current];
        const n = Number(e.key) - 1;
        if (cur.type === "mcq" || cur.type === "scripture_ref") { const o = cur.options[n]; if (o) set(cur.eqId, o.id); }
        else if (cur.type === "tf" && n < 2) set(cur.eqId, n === 0);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [p.questions, set]);
  const idxRef = useRef(idx); idxRef.current = idx;

  const counts = useMemo(() => ({ done: p.questions.filter((x) => answered(answers[x.eqId])).length, flagged: p.questions.filter((x) => flags[x.eqId]).length }), [answers, flags, p.questions]);
  const low = left <= 300;
  const val = answers[q.eqId];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white/95 px-4 py-2 backdrop-blur">
        <div className="min-w-0"><p className="truncate font-display text-lg text-navy">{p.examTitle}</p><p className="text-xs text-mist">Attempt {p.attemptNumber} · {counts.done} of {p.questions.length} answered{counts.flagged ? ` · ${counts.flagged} marked for review` : ""}</p></div>
        <div className="flex items-center gap-3">
          <span role="status" aria-live="polite" className={clsx("text-xs font-semibold", save === "saved" ? "text-leaf" : save === "saving" ? "text-mist" : "text-danger")}>{save === "saved" ? "All answers saved" : save === "saving" ? "Saving…" : "Reconnecting: will keep trying"}</span>
          <div role="timer" aria-label="Time remaining" className={clsx("rounded-lg px-3 py-1 font-mono text-lg font-bold", low ? "bg-danger text-white" : "bg-navy text-white")}>{fmt(left)}</div>
        </div>
      </div>
      <div className="sr-only" aria-live="assertive">{announce}</div>
      {announce && <div className="mt-3"><div className="alert alert-warn" role="status">{announce}</div></div>}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]">
        <section className="card card-pad" aria-labelledby="q-title">
          <p className="text-sm text-mist"><span id="q-title">Question {q.number} of {p.questions.length}</span> · {q.marks} {q.marks === 1 ? "mark" : "marks"}{q.scriptureRef && <> · {q.scriptureRef}</>}</p>
          <h2 className="mt-2 text-xl leading-snug">{q.text}</h2>
          <div className="mt-5">
            {(q.type === "mcq" || q.type === "scripture_ref") && (
              <fieldset className="space-y-2"><legend className="sr-only">Choose one answer</legend>
                {q.options.map((o, i) => (<label key={o.id} className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3", val === o.id ? "border-brand bg-brand-50" : "border-line hover:border-brand/50")}><input type="radio" name={q.eqId} className="mt-1 h-4 w-4" checked={val === o.id} onChange={() => set(q.eqId, o.id)} /><span><span className="mr-2 font-bold text-gold-700">{String.fromCharCode(65 + i)}.</span>{o.text}</span></label>))}
              </fieldset>
            )}
            {q.type === "multi" && (
              <fieldset className="space-y-2"><legend className="sr-only">Choose all that apply</legend>
                {q.options.map((o, i) => { const arr = (Array.isArray(val) ? val : []) as string[]; const on = arr.includes(o.id); return (<label key={o.id} className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3", on ? "border-brand bg-brand-50" : "border-line")}><input type="checkbox" className="mt-1 h-4 w-4" checked={on} onChange={() => set(q.eqId, on ? arr.filter((x) => x !== o.id) : [...arr, o.id])} /><span><span className="mr-2 font-bold text-gold-700">{String.fromCharCode(65 + i)}.</span>{o.text}</span></label>); })}
              </fieldset>
            )}
            {q.type === "tf" && (
              <fieldset className="grid grid-cols-2 gap-3"><legend className="sr-only">True or false</legend>
                {[true, false].map((b) => (<label key={String(b)} className={clsx("flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 p-4 text-lg font-semibold", val === b ? "border-brand bg-brand-50" : "border-line")}><input type="radio" name={q.eqId} className="h-4 w-4" checked={val === b} onChange={() => set(q.eqId, b)} />{b ? "True" : "False"}</label>))}
              </fieldset>
            )}
            {q.type === "fill" && (<div><label className="label" htmlFor="ans">Your answer</label><input id="ans" type="text" className="input" value={typeof val === "string" ? val : ""} maxLength={500} onChange={(e) => set(q.eqId, e.target.value, 800)} autoComplete="off" /></div>)}
            {["short", "essay", "scenario", "matching"].includes(q.type) && (<div><label className="label" htmlFor="ans">Your answer</label><textarea id="ans" className="input" rows={q.type === "short" ? 6 : 10} maxLength={8000} value={typeof val === "string" ? val : ""} onChange={(e) => set(q.eqId, e.target.value, 900)} /><p className="hint">Written answers are marked by your teacher.</p></div>)}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="btn btn-light" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← Previous</button>
            <button type="button" className={clsx("btn", flags[q.eqId] ? "btn-gold" : "btn-light")} aria-pressed={!!flags[q.eqId]} onClick={() => toggleFlag(q.eqId)}>{flags[q.eqId] ? "★ Marked for review" : "☆ Mark for review"}</button>
            {idx < p.questions.length - 1 ? <button type="button" className="btn btn-primary" onClick={() => setIdx(idx + 1)}>Next →</button> : <button type="button" className="btn btn-gold" onClick={() => setConfirming(true)}>Review and submit</button>}
          </div>
        </section>

        <aside className="card card-pad h-fit" aria-label="Question navigation">
          <h2 className="text-base">Questions</h2>
          <ol className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
            {p.questions.map((x, i) => {
              const a = answered(answers[x.eqId]);
              return (<li key={x.eqId}><button type="button" onClick={() => setIdx(i)} aria-label={`Question ${x.number}${a ? ", answered" : ", not answered"}${flags[x.eqId] ? ", marked for review" : ""}`} aria-current={i === idx ? "true" : undefined}
                className={clsx("relative h-9 w-full rounded-lg text-sm font-semibold", i === idx ? "ring-2 ring-gold ring-offset-1" : "", a ? "bg-brand text-white" : "bg-gray-100 text-ink")}>{x.number}{flags[x.eqId] && <span className="absolute -right-0.5 -top-0.5 text-[10px] text-gold" aria-hidden>★</span>}</button></li>);
            })}
          </ol>
          <ul className="mt-3 space-y-1 text-xs text-mist"><li><span className="mr-1 inline-block h-3 w-3 rounded bg-brand align-middle" /> Answered</li><li><span className="mr-1 inline-block h-3 w-3 rounded bg-gray-200 align-middle" /> Not answered</li><li>★ Marked for review</li></ul>
          <button type="button" className="btn btn-gold mt-4 w-full" onClick={() => setConfirming(true)}>Submit</button>
        </aside>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="sub-title">
          <div className="card card-pad w-full max-w-md bg-white">
            <h2 id="sub-title" className="text-xl">Submit your answers?</h2>
            <p className="mt-2 text-sm">You have answered <strong>{counts.done}</strong> of <strong>{p.questions.length}</strong> questions{counts.flagged > 0 && <>, and <strong>{counts.flagged}</strong> are marked for review</>}. You cannot change your answers after you submit.</p>
            {counts.done < p.questions.length && <p className="mt-2 alert alert-warn text-sm">{p.questions.length - counts.done} question(s) have no answer yet.</p>}
            <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn btn-light" onClick={() => setConfirming(false)} disabled={submitting}>Go back</button><button type="button" className="btn btn-gold" onClick={() => void submit(false)} disabled={submitting}>{submitting ? "Submitting…" : "Yes, submit"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
