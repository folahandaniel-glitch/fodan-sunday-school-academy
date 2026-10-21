// Generates the Fodan Sunday School Academy logo family (SVG + PNG + ICO) into public/brand.
// Run: npm run brand:assets. The Super Admin can replace any variant from Admin -> Branding.
import fs from "node:fs";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const OUT = "public/brand";
fs.mkdirSync(OUT, { recursive: true });

const P = {
  light: { navy: "#0A1B3D", blue: "#12306B", gold: "#D8A31A", goldDeep: "#B5830B", ivory: "#FFF9EC", leaf: "#1F8A70", text: "#0A1B3D", sub: "#B5830B" },
  dark: { navy: "#FFF9EC", blue: "#9DB8F0", gold: "#F0BC3A", goldDeep: "#D8A31A", ivory: "#0A1B3D", leaf: "#52CDAE", text: "#FFF9EC", sub: "#F0BC3A" },
  mono: { navy: "#000", blue: "#000", gold: "#000", goldDeep: "#000", ivory: "#fff", leaf: "#000", text: "#000", sub: "#000" },
};

/** Emblem in a 200x200 box: a round badge holding an open Bible, a radiant cross rising from it, and a sprouting leaf for growth. */
function emblem(c, { badge = true } = {}) {
  const rays = [];
  for (let i = 0; i < 9; i++) {
    const a = (-160 + (i * 140) / 8) * (Math.PI / 180);
    const r1 = 40, r2 = i % 2 ? 52 : 58;
    rays.push(`<line x1="${(100 + Math.cos(a) * r1).toFixed(1)}" y1="${(78 + Math.sin(a) * r1).toFixed(1)}" x2="${(100 + Math.cos(a) * r2).toFixed(1)}" y2="${(78 + Math.sin(a) * r2).toFixed(1)}" stroke="${c.gold}" stroke-width="4" stroke-linecap="round"/>`);
  }
  return `<g>
    ${badge ? `<circle cx="100" cy="100" r="96" fill="${c.blue}"/><circle cx="100" cy="100" r="90" fill="none" stroke="${c.gold}" stroke-width="2.5"/>` : ""}
    ${rays.join("")}
    <rect x="95.5" y="44" width="9" height="46" rx="2.5" fill="${c.gold}"/>
    <rect x="83" y="56" width="34" height="9" rx="2.5" fill="${c.gold}"/>
    <path d="M100 150 C84 140 62 138 42 144 L42 104 C62 98 84 100 100 110 Z" fill="${c.ivory}" stroke="${c.goldDeep}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M100 150 C116 140 138 138 158 144 L158 104 C138 98 116 100 100 110 Z" fill="${c.ivory}" stroke="${c.goldDeep}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M100 110 L100 150" stroke="${c.goldDeep}" stroke-width="3" stroke-linecap="round"/>
    <path d="M52 116 C65 112 79 113 91 118 M52 126 C65 122 79 123 91 128 M52 136 C65 132 79 133 91 138" stroke="${c.blue}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".5"/>
    <path d="M148 116 C135 112 121 113 109 118 M148 126 C135 122 121 123 109 128 M148 136 C135 132 121 133 109 138" stroke="${c.blue}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".5"/>
    <path d="M100 168 L100 154" stroke="${c.leaf}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M100 160 C90 160 84 153 84 146 C92 146 100 150 100 160 Z M100 160 C110 160 116 153 116 146 C108 146 100 150 100 160 Z" fill="${c.leaf}"/>
  </g>`;
}

const svg = (w, h, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"><title>${title}</title>${body}</svg>`;
const SERIF = `font-family="Georgia, 'Times New Roman', serif"`;
const SANS = `font-family="'Segoe UI', Arial, Helvetica, sans-serif"`;

const horizontal = (c) => svg(560, 200, `${emblem(c)}
  <text x="212" y="86" ${SERIF} font-size="50" font-weight="700" fill="${c.text}" letter-spacing="1">FODAN</text>
  <text x="212" y="122" ${SERIF} font-size="30" font-weight="700" fill="${c.text}">Sunday School Academy</text>
  <text x="214" y="150" ${SANS} font-size="14" font-weight="700" fill="${c.sub}" letter-spacing="2.2">TEACH. LEARN. GROW IN THE WORD.</text>
  <text x="214" y="172" ${SANS} font-size="12" fill="${c.text}" opacity=".75">A ministry of Fodan Gospel Outreach</text>`, "Fodan Sunday School Academy");

const stacked = (c) => svg(360, 330, `<g transform="translate(80 0)">${emblem(c)}</g>
  <text x="180" y="236" text-anchor="middle" ${SERIF} font-size="44" font-weight="700" fill="${c.text}" letter-spacing="1">FODAN</text>
  <text x="180" y="270" text-anchor="middle" ${SERIF} font-size="26" font-weight="700" fill="${c.text}">Sunday School Academy</text>
  <text x="180" y="300" text-anchor="middle" ${SANS} font-size="12.5" font-weight="700" fill="${c.sub}" letter-spacing="2">TEACH. LEARN. GROW IN THE WORD.</text>`, "Fodan Sunday School Academy");

const emblemSvg = (c) => svg(200, 200, emblem(c), "Fodan Sunday School Academy emblem");
const appIcon = (c) => svg(512, 512, `<rect width="512" height="512" rx="112" fill="${c.blue}"/><g transform="translate(56 56) scale(2)">${emblem(c, { badge: false })}</g>`, "Fodan Sunday School Academy");
const maskable = (c) => svg(512, 512, `<rect width="512" height="512" fill="${c.blue}"/><g transform="translate(116 116) scale(1.4)">${emblem(c, { badge: false })}</g>`, "Fodan Sunday School Academy");

const files = {
  "emblem.svg": emblemSvg(P.light), "emblem-dark.svg": emblemSvg(P.dark), "emblem-mono.svg": emblemSvg(P.mono),
  "horizontal.svg": horizontal(P.light), "horizontal-dark.svg": horizontal(P.dark), "horizontal-mono.svg": horizontal(P.mono),
  "stacked.svg": stacked(P.light), "stacked-dark.svg": stacked(P.dark), "stacked-mono.svg": stacked(P.mono),
  "app-icon.svg": appIcon(P.light), "favicon.svg": appIcon(P.light), "maskable.svg": maskable(P.light),
};
for (const [n, s] of Object.entries(files)) fs.writeFileSync(`${OUT}/${n}`, s);

const png = async (name, w, h, density = 300) => sharp(Buffer.from(files[name]), { density }).resize(w, h, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
fs.writeFileSync(`${OUT}/emblem.png`, await png("emblem.svg", 512, 512));
fs.writeFileSync(`${OUT}/horizontal.png`, await png("horizontal.svg", 1120, 400));
fs.writeFileSync(`${OUT}/stacked.png`, await png("stacked.svg", 720, 660));
for (const s of [16, 32, 48]) fs.writeFileSync(`${OUT}/favicon-${s}.png`, await png("app-icon.svg", s, s, 600));
fs.writeFileSync(`${OUT}/icon-192.png`, await png("app-icon.svg", 192, 192));
fs.writeFileSync(`${OUT}/icon-512.png`, await png("app-icon.svg", 512, 512));
fs.writeFileSync(`${OUT}/maskable-512.png`, await png("maskable.svg", 512, 512));
fs.writeFileSync(`${OUT}/apple-touch-icon.png`, await png("maskable.svg", 180, 180));
fs.writeFileSync(`${OUT}/favicon.ico`, await pngToIco([`${OUT}/favicon-16.png`, `${OUT}/favicon-32.png`, `${OUT}/favicon-48.png`]));
console.log("Brand assets written to", OUT, fs.readdirSync(OUT).length, "files");
