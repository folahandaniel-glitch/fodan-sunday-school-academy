/** Mixes two #rrggbb colours; t = share of `b`. Used to derive tints and shades from the Super Admin's brand colours. */
export function mix(a: string, b: string, t: number) {
  const p = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const ch = (i: number) => Math.round(p(a, i) * (1 - t) + p(b, i) * t).toString(16).padStart(2, "0");
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}
