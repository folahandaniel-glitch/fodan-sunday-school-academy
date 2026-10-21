/** Allow-list SVG sanitiser: drops scripts, event handlers, external references, foreignObject and anything not on the list. */
const TAGS = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "text", "tspan", "defs", "lineargradient", "radialgradient", "stop", "clippath", "mask", "title", "desc", "symbol", "use", "pattern"]);
const DROP_WITH_CONTENT = new Set(["script", "style", "foreignobject", "iframe", "object", "embed", "audio", "video", "animate", "set", "animatetransform", "animatemotion", "image", "a", "link", "meta"]);
const ATTRS = new Set(["id", "class", "viewbox", "width", "height", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset", "opacity", "transform", "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "clip-path", "clip-rule", "mask", "text-anchor", "font-family", "font-size", "font-weight", "letter-spacing", "dominant-baseline", "xmlns", "role", "aria-label", "preserveaspectratio", "patternunits", "fx", "fy", "href", "xlink:href", "version", "dx", "dy", "textlength", "lengthadjust"]);

export class UnsafeSvgError extends Error {}

export function sanitizeSvg(input: string): string {
  if (input.length > 600_000) throw new UnsafeSvgError("SVG is too large (limit 600 KB).");
  let s = input.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").trim();
  if (/<!ENTITY/i.test(input)) throw new UnsafeSvgError("SVG entities are not allowed.");
  if (!/^<svg[\s>]/i.test(s)) throw new UnsafeSvgError("That file is not an SVG image.");
  let out = ""; let i = 0; let skip: string | null = null; let depthSkip = 0;
  const re = /<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    i++;
    if (m[4] !== undefined) { if (!skip) out += m[4].replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, "&amp;"); continue; }
    if (m[2] === undefined) continue; // stray "<"
    const closing = m[1] === "/"; const name = m[2].toLowerCase(); const rawAttrs = m[3] ?? "";
    const selfClose = /\/\s*$/.test(rawAttrs);
    if (skip) {
      if (name === skip && !selfClose) { if (closing) { if (depthSkip === 0) skip = null; else depthSkip--; } else depthSkip++; }
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) { if (!closing && !selfClose) { skip = name; depthSkip = 0; } continue; }
    if (!TAGS.has(name)) continue; // unknown element: drop the tag, keep nothing of it
    if (closing) { out += `</${name === "lineargradient" ? "linearGradient" : name === "radialgradient" ? "radialGradient" : name === "clippath" ? "clipPath" : name}>`; continue; }
    const attrs: string[] = [];
    for (const a of rawAttrs.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const key = a[1].toLowerCase(); const val = a[3] ?? a[4] ?? "";
      if (key.startsWith("on") || !ATTRS.has(key)) continue;
      if ((key === "href" || key === "xlink:href") && !val.startsWith("#")) continue; // internal references only
      if (/javascript:|data:|expression\(|url\(\s*['"]?\s*(https?:|\/\/|data:)/i.test(val)) continue;
      attrs.push(`${a[1]}="${val.replace(/"/g, "&quot;")}"`);
    }
    const tag = name === "lineargradient" ? "linearGradient" : name === "radialgradient" ? "radialGradient" : name === "clippath" ? "clipPath" : name;
    if (tag === "svg" && !attrs.some((x) => x.startsWith("xmlns="))) attrs.unshift('xmlns="http://www.w3.org/2000/svg"');
    out += `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}${selfClose ? "/" : ""}>`;
  }
  if (!/^<svg[\s>]/.test(out) || !/<\/svg>\s*$/.test(out)) throw new UnsafeSvgError("The SVG could not be cleaned safely.");
  void i;
  return out;
}
