"use client";
import { useState } from "react";

/** Search box that hides wording rows not containing the typed text (rows carry data-wording). */
export function WordingFilter({ label, placeholder }: { label: string; placeholder: string }) {
  const [q, setQ] = useState("");
  return (
    <div>
      <label className="label" htmlFor="wording-q">{label}</label>
      <input id="wording-q" type="search" className="input" placeholder={placeholder} value={q}
        onChange={(e) => {
          const v = e.target.value; setQ(v);
          const needle = v.trim().toLowerCase();
          document.querySelectorAll<HTMLElement>("[data-wording]").forEach((el) => { el.hidden = !!needle && !(el.dataset.wording ?? "").includes(needle); });
          if (needle) document.querySelectorAll<HTMLDetailsElement>("details[data-wording-group]").forEach((d) => { d.open = true; });
        }} />
    </div>
  );
}
