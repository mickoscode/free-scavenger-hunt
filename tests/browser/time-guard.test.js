// Settings tab: start and end stay in order by themselves; no message, no error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

test('changing the start or the end on the Settings tab keeps them in order, and saving works', async () => {
  const h = await launch();
  try {
    const { ctx, page } = await h.desktop('tg');
    const api = (m, p, d) => ctx.request.fetch(h.url(p), { method: m, data: d, headers: { 'content-type': 'application/json' } });
    assert.equal((await api('POST', '/api/auth/register', { username: 'timeguard', password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
    const made = await (await api('POST', '/api/admin/events', { slug: 'times', name: 'Times', timeZone: 'UTC' })).json();
    await page.goto(h.url(`/admin/event/?id=${made.id}#settings`));
    await page.waitForSelector(tid('set-start'));
    const times = async () => [await page.inputValue(tid('set-start')), await page.inputValue(tid('set-end'))];
    assert.deepEqual(await times(), ['09:00', '12:00']);

    // start moved past the end (and left): end becomes start + 10
    await page.fill(tid('set-start'), '13:00');
    await page.locator(tid('set-start')).blur();
    assert.deepEqual(await times(), ['13:00', '13:10']);
    // end moved before the start: start becomes end - 10
    await page.fill(tid('set-end'), '12:00');
    await page.locator(tid('set-end')).blur();
    assert.deepEqual(await times(), ['11:50', '12:00']);
    // in order: nothing moves
    await page.fill(tid('set-start'), '08:30');
    await page.locator(tid('set-start')).blur();
    assert.deepEqual(await times(), ['08:30', '12:00']);
    // settles by itself shortly after a change, without leaving the field
    await page.fill(tid('set-start'), '23:58');
    await page.waitForFunction(() => document.querySelector('[data-testid="set-end"]').value === '23:59');
    assert.deepEqual(await times(), ['23:58', '23:59']);
    // no explanation anywhere, and it saves
    await page.fill(tid('set-start'), '10:00');
    await page.locator(tid('set-start')).blur();
    await page.fill(tid('set-end'), '11:30');
    await page.locator(tid('set-end')).blur();
    await page.click(tid('save-settings'));
    await page.waitForFunction(() => /Saved/.test(document.body.textContent));
    const got = await (await api('GET', `/api/admin/events/${made.id}`)).json();
    assert.deepEqual([got.config.start, got.config.end], ['10:00', '11:30']);
    assert.equal(await page.locator('p:visible, .alert:visible, [role=alert]:visible', { hasText: /end.*before.*start|must be after/i }).count(), 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test('times are corrected when saving straight from a time field (Enter), and when the browser reports only input events', async () => {
  const h = await launch();
  try {
    const { ctx, page } = await h.desktop('tg2');
    const api = (m, p, d) => ctx.request.fetch(h.url(p), { method: m, data: d, headers: { 'content-type': 'application/json' } });
    assert.equal((await api('POST', '/api/auth/register', { username: 'timeguard2', password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
    const made = await (await api('POST', '/api/admin/events', { slug: 'times2', name: 'Times', timeZone: 'UTC' })).json();
    await page.goto(h.url(`/admin/event/?id=${made.id}#settings`));
    await page.waitForSelector(tid('set-start'));
    // start moved past the end and Enter pressed at once, in the field: it is corrected before it is saved
    await page.fill(tid('set-start'), '14:00');
    await page.locator(tid('set-start')).press('Enter');
    await page.waitForFunction(() => /Saved/.test(document.body.textContent));
    let got = await (await api('GET', `/api/admin/events/${made.id}`)).json();
    assert.deepEqual([got.config.start, got.config.end], ['14:00', '14:10']);
    // only an input event is fired (no change, no blur): still corrected
    await page.evaluate(() => { const e = document.querySelector('[data-testid="set-end"]'); e.value = '13:00'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelector('[data-testid="set-start"]').value === '12:50');
    assert.equal(await page.inputValue(tid('set-end')), '13:00');
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test('editing the start and then, within a moment, the end: the later edit wins (no stale check undoes it)', async () => {
  const h = await launch();
  try {
    const { ctx, page } = await h.desktop('tg3');
    const api = (m, p, d) => ctx.request.fetch(h.url(p), { method: m, data: d, headers: { 'content-type': 'application/json' } });
    assert.equal((await api('POST', '/api/auth/register', { username: 'timeguard3', password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
    const made = await (await api('POST', '/api/admin/events', { slug: 'times3', name: 'Times', timeZone: 'UTC' })).json();
    await page.goto(h.url(`/admin/event/?id=${made.id}#settings`));
    await page.waitForSelector(tid('set-start'));
    // start to 14:00 (the end, 12:00, is now out of order) and straight away the end to 13:00, before any check has run: the later edit decides,
    // so the start follows it (12:50) instead of the end being pushed back to 14:10 by the check that was waiting for the start
    await page.evaluate(() => {
      const set = (id, v) => { const e = document.querySelector(`[data-testid="${id}"]`); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
      set('set-start', '14:00');
      set('set-end', '13:00');
    });
    await page.waitForTimeout(1500);
    assert.deepEqual([await page.inputValue(tid('set-start')), await page.inputValue(tid('set-end'))], ['12:50', '13:00']);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

