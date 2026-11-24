// Browser test harness: the real pages in Chromium against the dev server (in-memory store, a clock the test controls).
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { startDevServer } from '../../scripts/dev-server.js';

export async function launch() {
  // Many tests build "a game today from 00:00 to 23:59", and a demo hunt never crosses local midnight, so a run that happens to start (or
  // straddle) midnight UTC would fail by chance. Within 30 minutes of UTC midnight the test clock therefore starts at midday instead.
  // FSH_TEST_MIDDAY_CLOCK=1 forces that, to check the whole suite behaves the same.
  const DAY = 86_400_000;
  const sinceMidnight = Date.now() % DAY;
  const nearMidnight = process.env.FSH_TEST_MIDDAY_CLOCK === '1' || sinceMidnight < 30 * 60_000 || sinceMidnight > DAY - 30 * 60_000;
  const clock = { offset: nearMidnight ? DAY / 2 - sinceMidnight : 0 };
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
