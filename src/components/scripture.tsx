import { getPassages } from "@/server/bible-data";
import { TRANSLATIONS, type TranslationId } from "@/lib/bible";

/** Scripture is ALWAYS read from the Bible text by reference (public-domain translations), never typed into lessons from memory. */
export function ScriptureBlock({ refs, translation = "bsb", compact }: { refs: string[]; translation?: TranslationId; compact?: boolean }) {
  const t = TRANSLATIONS.find((x) => x.id === translation) ?? TRANSLATIONS[0];
  return (
    <div className="space-y-3">
      {refs.map((r) => {
        const ps = getPassages(r, translation);
        if (!ps.length) return <p key={r} className="text-sm text-mist">{r} <span className="text-xs">(text not available)</span></p>;
        return ps.map((p, i) => (
          <details key={r + i} open={!compact} className="scripture">
            <summary className="cursor-pointer font-sans text-sm font-bold text-navy">{p.label} <span className="font-normal text-mist">({t.name})</span></summary>
            <p className="mt-2 leading-relaxed">
              {p.verses.map((v) => (<span key={`${v.chapter}:${v.n}`}><sup className="mr-0.5 font-sans text-[10px] font-bold text-gold-700">{v.n}</sup>{v.text} </span>))}
            </p>
          </details>
        ));
      })}
    </div>
  );
}

export function TranslationPicker({ current, base }: { current: TranslationId; base: string }) {
  return (
    <form action={base} className="no-print flex items-center gap-2 text-sm"><label htmlFor="tr" className="text-mist">Bible text</label>
      <select id="tr" name="tr" defaultValue={current} className="input !min-h-9 !w-auto !py-1">{TRANSLATIONS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <button className="btn btn-light btn-sm">Apply</button></form>
  );
}
