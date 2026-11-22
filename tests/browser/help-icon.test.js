// The small '?' help buttons on the Settings tab are circles and must not distort the layout (start and end time line up).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

for (const [label, width] of [['desktop', 1100], ['phone', 360]]) {
  test(`help ? buttons are small circles and Start/End line up (${label})`, async () => {
    const h = await launch();
    try {
      const { ctx, page } = await (label === 'phone' ? h.phone(`help-${label}`, 360) : h.desktop(`help-${label}`));
      const api = (m, p, d) => ctx.request.fetch(h.url(p), { method: m, data: d, headers: { 'content-type': 'application/json' } });
      assert.equal((await api('POST', '/api/auth/register', { username: `help${label}`, password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
      const made = await (await api('POST', '/api/admin/events', { slug: 'help-me', name: 'Help Me', timeZone: 'UTC' })).json();
      await page.goto(h.url(`/admin/event/?id=${made.id}#settings`));
      await page.waitForSelector(tid('set-start'));
      const sizes = await page.$$eval('.help-toggle', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; }));
      assert.ok(sizes.length > 0, 'there are help buttons');
      for (const [w, ht] of sizes) { assert.equal(w, ht, `round, not oval (${w} x ${ht})`); assert.ok(w <= 28, `small (${w}px)`); }
      const [s, e] = await Promise.all([page.locator(tid('set-start')).boundingBox(), page.locator(tid('set-end')).boundingBox()]);
      if (Math.abs(s.x - e.x) > 20) assert.ok(Math.abs(s.y - e.y) <= 1, `start and end sit on one line (${s.y} vs ${e.y})`); // side by side: same top
      else assert.ok(e.y > s.y); // stacked on a phone: end below start, same left edge
      assert.ok(Math.abs(s.x - e.x) <= 1 || Math.abs(s.y - e.y) <= 1);
      assert.ok(e.x + e.width <= width + 1);
      await h.shot(page, `93-help-${label}`);
      assert.deepEqual(h.errors, []);
    } finally {
      await h.close();
    }
  });
}
