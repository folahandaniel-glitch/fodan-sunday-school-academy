import { Fragment, type ReactNode } from "react";

/** Minimal, safe Markdown: paragraphs, ## / ### headings, lists, > quotes, **bold**, *italic*. Output is React nodes only (never raw HTML). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("**") ? <strong key={i++}>{t.slice(2, -2)}</strong> : <em key={i++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className={className ?? "prose-fssa"}>
      {blocks.map((b, i) => {
        const t = b.trim();
        if (!t) return null;
        if (t.startsWith("### ")) return <h3 key={i}>{inline(t.slice(4))}</h3>;
        if (t.startsWith("## ")) return <h2 key={i}>{inline(t.slice(3))}</h2>;
        if (t.startsWith("# ")) return <h2 key={i}>{inline(t.slice(2))}</h2>;
        if (t.split("\n").every((l) => l.startsWith("> "))) return <blockquote key={i}>{inline(t.split("\n").map((l) => l.slice(2)).join(" "))}</blockquote>;
        if (t.split("\n").every((l) => /^[-*] /.test(l))) return <ul key={i}>{t.split("\n").map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
        if (t.split("\n").every((l) => /^\d+\. /.test(l))) return <ol key={i}>{t.split("\n").map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ""))}</li>)}</ol>;
        return <p key={i}>{t.split("\n").map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}
