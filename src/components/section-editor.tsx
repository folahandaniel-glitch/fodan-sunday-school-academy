"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Eye, EyeOff } from "lucide-react";

type Sec = { id: string; type: string; hidden?: boolean; data: Record<string, unknown> };
type Field = [key: string, label: string, kind?: "area" | "text"];
const SCHEMA: Record<string, { label: string; fields: Field[]; items?: { key: string; label: string; fields: Field[] } }> = {
  hero: { label: "Hero banner", fields: [["eyebrow", "Small heading above"], ["title", "Headline"], ["subtitle", "Subtitle", "area"], ["primaryLabel", "Main button text"], ["primaryHref", "Main button link (starts with /)"], ["secondaryLabel", "Second button text"], ["secondaryHref", "Second button link"]] },
  text: { label: "Text page", fields: [["title", "Title"], ["body", "Body (blank line between paragraphs; ## Heading; - list; **bold**)", "area"]] },
  features: { label: "Feature cards", fields: [["title", "Section title"]], items: { key: "items", label: "Card", fields: [["icon", "Icon (book, calendar, shield, clipboard, users, lock, building, award, chart, cap)"], ["title", "Title"], ["body", "Description", "area"]] } },
  steps: { label: "Numbered steps", fields: [["title", "Section title"]], items: { key: "items", label: "Step", fields: [["title", "Title"], ["body", "Description", "area"]] } },
  faq: { label: "Frequently asked questions", fields: [["title", "Section title"]], items: { key: "items", label: "Question", fields: [["q", "Question"], ["a", "Answer", "area"]] } },
  cta: { label: "Call to action", fields: [["title", "Title"], ["body", "Text", "area"], ["label", "Button text"], ["href", "Button link"]] },
  contact: { label: "Contact form", fields: [["title", "Title"], ["body", "Introduction", "area"]] },
  categories: { label: "Curriculum categories (automatic)", fields: [["title", "Section title"]] },
  pricing: { label: "Pricing plans (automatic)", fields: [["title", "Section title"], ["body", "Introduction", "area"]] },
};

const input = "input";
export function SectionEditor({ initial, name = "sections" }: { initial: Sec[]; name?: string }) {
  const [secs, setSecs] = useState<Sec[]>(initial);
  const set = (i: number, fn: (s: Sec) => Sec) => setSecs((a) => a.map((s, j) => (j === i ? fn(s) : s)));
  const move = (i: number, d: number) => setSecs((a) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b; });
  const [adding, setAdding] = useState("text");
  return (
    <div className="space-y-4">
      <input type="hidden" name={name} value={JSON.stringify(secs)} />
      {secs.map((s, i) => {
        const sch = SCHEMA[s.type]; if (!sch) return null;
        const items = sch.items ? ((s.data[sch.items.key] as Record<string, string>[]) ?? []) : [];
        return (
          <fieldset key={s.id} className={`card card-pad ${s.hidden ? "opacity-60" : ""}`}>
            <legend className="px-2 font-display text-lg text-navy">{sch.label}{s.hidden && " (hidden)"}</legend>
            <div className="mb-3 flex flex-wrap gap-1">
              <button type="button" className="btn btn-light btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={14} /></button>
              <button type="button" className="btn btn-light btn-sm" onClick={() => move(i, 1)} disabled={i === secs.length - 1} aria-label="Move down"><ArrowDown size={14} /></button>
              <button type="button" className="btn btn-light btn-sm" onClick={() => set(i, (x) => ({ ...x, hidden: !x.hidden }))}>{s.hidden ? <><Eye size={14} /> Show</> : <><EyeOff size={14} /> Hide</>}</button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => { if (window.confirm("Delete this section?")) setSecs((a) => a.filter((_, j) => j !== i)); }}><Trash2 size={14} /> Delete</button>
            </div>
            <div className="space-y-3">
              {sch.fields.map(([k, label, kind]) => (
                <div key={k}><label className="label" htmlFor={`${s.id}-${k}`}>{label}</label>
                  {kind === "area" ? <textarea id={`${s.id}-${k}`} className={input} rows={4} value={String(s.data[k] ?? "")} onChange={(e) => set(i, (x) => ({ ...x, data: { ...x.data, [k]: e.target.value } }))} /> : <input id={`${s.id}-${k}`} className={input} value={String(s.data[k] ?? "")} onChange={(e) => set(i, (x) => ({ ...x, data: { ...x.data, [k]: e.target.value } }))} />}</div>
              ))}
              {sch.items && (
                <div className="space-y-3">
                  {items.map((it, j) => (
                    <div key={j} className="rounded-xl border border-line p-3">
                      <p className="mb-2 flex items-center justify-between text-sm font-semibold">{sch.items!.label} {j + 1}<button type="button" className="text-danger" onClick={() => set(i, (x) => ({ ...x, data: { ...x.data, [sch.items!.key]: items.filter((_, n) => n !== j) } }))}>Remove</button></p>
                      <div className="space-y-2">{sch.items!.fields.map(([k, label, kind]) => (
                        <div key={k}><label className="label" htmlFor={`${s.id}-${j}-${k}`}>{label}</label>
                          {kind === "area" ? <textarea id={`${s.id}-${j}-${k}`} className={input} rows={3} value={String(it[k] ?? "")} onChange={(e) => set(i, (x) => ({ ...x, data: { ...x.data, [sch.items!.key]: items.map((y, n) => (n === j ? { ...y, [k]: e.target.value } : y)) } }))} /> : <input id={`${s.id}-${j}-${k}`} className={input} value={String(it[k] ?? "")} onChange={(e) => set(i, (x) => ({ ...x, data: { ...x.data, [sch.items!.key]: items.map((y, n) => (n === j ? { ...y, [k]: e.target.value } : y)) } }))} />}</div>))}</div>
                    </div>))}
                  <button type="button" className="btn btn-light btn-sm" onClick={() => set(i, (x) => ({ ...x, data: { ...x.data, [sch.items!.key]: [...items, {}] } }))}><Plus size={14} /> Add {sch.items.label.toLowerCase()}</button>
                </div>
              )}
            </div>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="add-type">Section type to add</label>
        <select id="add-type" className="input !w-auto" value={adding} onChange={(e) => setAdding(e.target.value)}>{Object.entries(SCHEMA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <button type="button" className="btn btn-light" onClick={() => setSecs((a) => [...a, { id: `s${Date.now().toString(36)}`, type: adding, data: {} }])}><Plus size={16} /> Add section</button>
      </div>
    </div>
  );
}
