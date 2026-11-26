// Browser test harness: the real pages in Chromium against the dev server (in-memory store, a clock the test controls).
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { startDevServer } from '../../scripts/dev-server.js';

export async function launch() {
  // The tests must not depend on the time of day they happen to run at. A new hunt's default game is 09:00 to 12:00 (in its time zone), which
  // is "in progress", with its settings locked, if a test runs then; tests build "a game today, 00:00 to 23:59", which breaks within minutes of
  // midnight; and a demo hunt never crosses local midnight. So the test clock always starts at 14:00 UTC today (22:00 in Perth): clear of
  // the default window in UTC and in Perth, and far from midnight in both. FSH_TEST_REAL_CLOCK=1 uses the real clock instead.
  const DAY = 86_400_000;
  const startOfDay = Date.now() - (Date.now() % DAY);
  const clock = { offset: process.env.FSH_TEST_REAL_CLOCK === '1' ? 0 : startOfDay + 14 * 3_600_000 - Date.now() };
  const now = () => Date.now() + clock.offset;
  const app = await startDevServer({ port: 0, now, quiet: true });
  const browser = await chromium.launch();
  const url = (p = '/') => `http://localhost:${app.port}${p}`;
  const shots = process.env.SHOTS_DIR;
  const shot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); };
  const errors = [];
  // Every page of every context reports console errors and CSP violations, which fail the test.
  const watch = (page, label) => {
    page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|400|409|429)/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
  };
  const phone = async (label, width = 390) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    watch(page, label);
    return { ctx, page };
  };
  const desktop = async (label) => {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    const page = await ctx.newPage();
    watch(page, label);
    return { ctx, page };
  };
  return { app, clock, now, url, browser, shot, errors, phone, desktop, close: async () => { await browser.close(); await app.close(); } };
}

export const tid = (id) => `[data-testid="${id}"]`;

// A real, valid PNG (a flat colour) for upload tests.
export function makePng(width = 40, height = 30, [r, g, b] = [30, 120, 200]) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bit, RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
