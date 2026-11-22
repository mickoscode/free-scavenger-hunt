// Draws the "Code-breakers" zone picture of the demo hunt: an original cipher-disc logo with the project name in it.
// Output: api/demo/images/code-breakers-{thumb,full}.jpg  (run: node scripts/make-demo-logo.js). Uses the Chromium from Playwright.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const W = 1280;
const H = 960;
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

// faint columns of digits and letters, like falling code
const glyphs = '01ABCDEF23456789XYZ';
const columns = Array.from({ length: 41 }, (_, i) => {
  const x = 12 + i * 31.5;
  const rows = Array.from({ length: 34 }, () => glyphs[Math.floor(rnd() * glyphs.length)]);
  const opacity = (0.07 + rnd() * 0.16).toFixed(2);
  return `<text x="${x}" y="0" font-size="22" fill="#38e8ff" opacity="${opacity}">${rows.map((c, r) => `<tspan x="${x}" dy="${r === 0 ? 30 : 28}">${c}</tspan>`).join('')}</text>`;
}).join('');

const cx = 640;
const cy = 392;
const ring = (chars, r, size, fill, startDeg = 0) => chars.map((c, i) => {
  const a = startDeg + (360 / chars.length) * i;
  return `<text transform="translate(${cx} ${cy}) rotate(${a}) translate(0 ${-r})" font-size="${size}" fill="${fill}" text-anchor="middle" font-weight="700">${c}</text>`;
}).join('');
const ticks = Array.from({ length: 52 }, (_, i) => {
  const a = (360 / 52) * i;
  const long = i % 2 === 0;
  return `<line transform="translate(${cx} ${cy}) rotate(${a})" x1="0" y1="${-(long ? 306 : 310)}" x2="0" y2="-318" stroke="#38e8ff" stroke-width="${long ? 3 : 2}" opacity=".85"/>`;
}).join('');
const spokes = Array.from({ length: 8 }, (_, i) => `<line transform="translate(${cx} ${cy}) rotate(${i * 45})" x1="0" y1="-60" x2="0" y2="-168" stroke="#ff3ec9" stroke-width="2" opacity=".55"/>`).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'DejaVu Sans Mono','Liberation Mono',Menlo,Consolas,monospace">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#12306b"/><stop offset=".55" stop-color="#0a1736"/><stop offset="1" stop-color="#040815"/></radialGradient>
    <linearGradient id="title" x1="0" x2="1"><stop offset="0" stop-color="#38e8ff"/><stop offset=".55" stop-color="#9d8bff"/><stop offset="1" stop-color="#ff3ec9"/></linearGradient>
    <radialGradient id="core" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff3ec9" stop-opacity=".55"/><stop offset="1" stop-color="#ff3ec9" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${columns}
  <rect width="${W}" height="${H}" fill="url(#bg)" opacity=".55"/>

  <!-- the cipher disc -->
  <circle cx="${cx}" cy="${cy}" r="330" fill="#38e8ff" opacity=".10" filter="url(#soft)"/>
  <g filter="url(#glow)">
    <circle cx="${cx}" cy="${cy}" r="322" fill="#050c22" stroke="#38e8ff" stroke-width="5"/>
    ${ticks}
    <circle cx="${cx}" cy="${cy}" r="246" fill="none" stroke="#ff3ec9" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="186" fill="#081431" stroke="#38e8ff" stroke-width="3"/>
  </g>
  ${ring([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], 270, 30, '#e8fbff')}
  ${ring([...'0123456789ABCDEF'], 214, 28, '#ff8be0', 11)}
  ${spokes}
  <circle cx="${cx}" cy="${cy}" r="120" fill="url(#core)"/>
  <!-- keyhole -->
  <g filter="url(#glow)">
    <circle cx="${cx}" cy="${cy - 22}" r="40" fill="#ffffff"/>
    <path d="M ${cx - 22} ${cy + 8} L ${cx + 22} ${cy + 8} L ${cx + 38} ${cy + 86} L ${cx - 38} ${cy + 86} Z" fill="#ffffff"/>
    <circle cx="${cx}" cy="${cy - 22}" r="40" fill="none" stroke="#ff3ec9" stroke-width="5"/>
  </g>
  <circle cx="${cx}" cy="${cy - 22}" r="15" fill="#081431"/>
  <path d="M ${cx - 7} ${cy - 12} L ${cx + 7} ${cy - 12} L ${cx + 13} ${cy + 52} L ${cx - 13} ${cy + 52} Z" fill="#081431"/>
  <!-- a marker on the disc -->
  <path d="M ${cx} ${cy - 338} l 20 -34 l -40 0 z" fill="#ff3ec9" filter="url(#glow)"/>

  <!-- the name -->
  <g filter="url(#glow)" text-anchor="middle">
    <text x="${cx}" y="826" font-size="104" font-weight="800" fill="url(#title)" letter-spacing="4">CODE-BREAKERS</text>
  </g>
  <g text-anchor="middle">
    <text x="${cx + 36}" y="898" font-size="44" font-weight="700" fill="#e8fbff" letter-spacing="10">FREE SCAVENGER HUNT</text>
    <!-- the site's star badge -->
    <g transform="translate(${cx - 372} 862)"><circle cx="24" cy="24" r="24" fill="#0d6efd"/><path d="M24 9l4.8 10.4 11.4 1.3-8.4 7.8 2.2 11.2L24 34.1 13.9 39.7l2.2-11.2-8.4-7.8 11.4-1.3z" fill="#fff"/></g>
  </g>
</svg>`;

const browser = await chromium.launch();
for (const [kind, w] of [['full', 1280], ['thumb', 320]]) {
  const page = await browser.newPage({ viewport: { width: w, height: Math.round((w * H) / W) } });
  await page.setContent(`<html><body style="margin:0;background:#040815">${svg.replace(`width="${W}" height="${H}"`, `width="${w}" height="${Math.round((w * H) / W)}"`)}</body></html>`);
  const buf = await page.screenshot({ type: 'jpeg', quality: kind === 'full' ? 88 : 90 });
  await writeFile(new URL(`../api/demo/images/code-breakers-${kind}.jpg`, import.meta.url), buf);
  console.log(kind, buf.length, 'bytes');
  await page.close();
}
await browser.close();
