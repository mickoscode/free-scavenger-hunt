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

test('My hunts: the explanations hide behind ? toggles (create form, recovery codes, clone) and open when pressed', async () => {
  const h = await launch();
  try {
    const { ctx, page } = await h.phone('help-dash', 360);
    const api = (m, p, d) => ctx.request.fetch(h.url(p), { method: m, data: d, headers: { 'content-type': 'application/json' } });
    assert.equal((await api('POST', '/api/auth/register', { username: 'helpdash', password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
    await page.goto(h.url('/admin/'));
    await page.waitForSelector(tid('create-button'));
    const form = '#create-form';
    assert.equal(await page.locator(`${form} .help-toggle`).count(), 4); // heading, name, address, time zone
    for (const id of ['#new-name-help', '#new-slug-help']) assert.equal(await page.isVisible(id), false, `${id} hidden at first`);
    assert.equal(await page.isVisible(`${form} p.small.text-muted`), false);
    await page.click(`${form} [aria-label="About Web address"]`);
    assert.equal(await page.isVisible('#new-slug-help'), true);
    assert.equal(await page.getAttribute(`${form} [aria-label="About Web address"]`, 'aria-expanded'), 'true');
    await page.click(`${form} [aria-label="About Web address"]`);
    assert.equal(await page.isVisible('#new-slug-help'), false);
    // the field still works, and the label still focuses it
    await page.click('label[for="new-name"]');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'new-name');
    // recovery codes card
    assert.equal(await page.isVisible('#recovery-card p.small.text-muted'), false);
    await page.click('#recovery-card .help-toggle');
    assert.equal(await page.isVisible('#recovery-card p.small.text-muted'), true);
    await h.shot(page, '94-help-dashboard');
    for (const el of await page.$$(`${form} .help-toggle, #recovery-card .help-toggle`)) { const b = await el.boundingBox(); assert.ok(Math.abs(b.width - b.height) < 0.5 && b.width <= 28); }
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
