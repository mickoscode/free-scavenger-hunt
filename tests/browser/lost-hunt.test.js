// A deleted (or never existing) hunt: the error page has the site's header and footer and a way home; a live hunt still has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

for (const [label, width] of [['desktop', 1100], ['phone', 360]]) {
  test(`a deleted hunt shows "could not load" with the site header and footer (${label})`, async () => {
    const h = await launch();
    try {
      const org = await (label === 'phone' ? h.phone('org', 360) : h.desktop('org'));
      const api = (m, p, d) => org.ctx.request.fetch(h.url(p), { method: m, data: d, headers: { 'content-type': 'application/json' } });
      assert.equal((await api('POST', '/api/auth/register', { username: `lost${label}`, password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
      const made = await (await api('POST', '/api/admin/events', { slug: 'gone-hunt', name: 'Gone', timeZone: 'UTC' })).json();
      const player = await (label === 'phone' ? h.phone('p', 360) : h.desktop('p'));
      const url = h.url(`/e/${made.org}/gone-hunt/`);

      // while it exists: a game page, no way out to the site
      await player.page.goto(url);
      await player.page.waitForSelector(tid('event-name'));
      assert.equal(await player.page.locator('a[href="/"]').count(), 0);
      assert.equal(await player.page.locator(tid('lost-header')).count(), 0);

      // deleted on purpose: the same address now shows the not-found page, with the way home
      assert.equal((await api('DELETE', `/api/admin/events/${made.id}`, { confirm: 'gone-hunt' })).status(), 200);
      await player.page.goto(url);
      await player.page.waitForSelector(tid('load-error'));
      assert.match(await player.page.textContent(tid('load-error')), /Could not load this hunt/);
      assert.equal(await player.page.isVisible(tid('lost-header')), true);
      assert.equal(await player.page.isVisible(tid('lost-footer')), true);
      assert.equal(await player.page.getAttribute(`${tid('lost-header')} .site-brand`, 'href'), '/');
      assert.equal(await player.page.getAttribute(`${tid('lost-footer')} .footer-links a`, 'href'), '/');
      assert.equal(await player.page.isVisible(tid('join-button')), false);
      const edge = await player.page.evaluate(() => Math.max(...[...document.querySelectorAll('body *')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().right)));
      assert.ok(edge <= width + 1, `nothing off the right edge (${edge})`);
      await player.page.waitForTimeout(6000); // the page refreshes every 5 s: still exactly one header and footer
      assert.equal(await player.page.locator(tid('lost-header')).count(), 1);
      assert.equal(await player.page.locator(tid('lost-footer')).count(), 1);
      await h.shot(player.page, `98-lost-hunt-${label}`);
      await player.page.click(`${tid('lost-header')} .site-brand`);
      await player.page.waitForURL((u) => u.pathname === '/');

      // an address that never existed behaves the same
      await player.page.goto(h.url(`/e/${made.org}/never-was/`));
      await player.page.waitForSelector(tid('lost-header'));
      assert.deepEqual(h.errors.filter((e) => !/status of (400|409|401)/.test(e)), []);
    } finally {
      await h.close();
    }
  });
}
