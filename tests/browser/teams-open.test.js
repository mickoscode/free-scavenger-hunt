// Teams tab with a real-sized game (23 teams): clicking a team name opens its answers directly under it, in view, and they stay open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

const J = { 'content-type': 'application/json' };

for (const [label, width, height, touch] of [['laptop', 1366, 768, false], ['phone', 390, 800, true]]) {
  test(`opening a team on the Teams tab shows its answers right under it, in view, with 23 teams (${label})`, async () => {
    const h = await launch();
    try {
      const org = await h.desktop('org');
      const api = (m, p, d) => org.ctx.request.fetch(h.url(p), { method: m, data: d, headers: J });
      assert.equal((await api('POST', '/api/auth/register', { username: `open${label}`, password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
      const made = await (await api('POST', '/api/admin/events', { slug: 'open-hunt', name: 'Open', timeZone: 'UTC' })).json();
      const day = new Date(h.now()).toISOString().slice(0, 10);
      const zones = [1, 2, 3, 4].map((z) => ({ id: `z${z}`, name: `Zone ${z}`, map: null, questions: [1, 2, 3, 4].map((i) => ({ id: `q${i}`, type: 'whole-number', text: `Q ${z}.${i}`, answers: [String(i)], score: 10 })) }));
      await api('PUT', `/api/admin/events/${made.id}/content`, { instructions: '', zones });
      const cfg = (start, end) => api('PUT', `/api/admin/events/${made.id}/config`, { name: 'Open', timeZone: 'UTC', day, start, end, teamNames: true, joinCode: '', whatsappUrl: '', override: 'override' });
      assert.equal((await cfg('00:00', '23:59')).status(), 200);
      const base = `/api/events/${made.org}/open-hunt`;
      for (let t = 1; t <= 23; t += 1) {
        const c = await h.browser.newContext();
        assert.equal((await c.request.fetch(h.url(`${base}/join`), { method: 'POST', data: { name: `Team ${String.fromCharCode(64 + t)}` }, headers: J })).status(), 200);
        for (const z of zones) for (const q of z.questions.slice(0, 2)) await c.request.fetch(h.url(`${base}/answer`), { method: 'POST', data: { zone: z.id, question: q.id, answer: t % 2 ? q.answers[0] : '9' }, headers: J });
        await c.close();
      }
      const ctx = await h.browser.newContext({ viewport: { width, height }, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
      await ctx.addCookies(await org.ctx.cookies());
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(h.url(`/admin/event/?id=${made.id}#teams`));
      await page.reload();
      await page.waitForSelector(tid('team-row'));
      assert.equal(await page.locator(tid('team-row')).count(), 23);

      const rowOf = (n) => page.locator(`${tid('team-row')}[data-team="${n}"]`);
      const inView = () => page.evaluate(() => { const r = document.querySelector('[data-testid="team-detail"]').getBoundingClientRect(); return r.top >= -1 && r.top < innerHeight; });

      // scroll down the list first, like a person looking for team 17
      await rowOf(17).scrollIntoViewIfNeeded();
      await rowOf(17).locator(tid('team-view')).click();
      await page.waitForSelector(tid('team-detail-heading'));
      assert.match(await page.textContent(tid('team-detail-heading')), /Team Q: \d+(st|nd|rd|th) of 23/);
      // directly under the team that was clicked (not at the end of the list), and visible without scrolling by hand
      assert.equal(await page.evaluate(() => document.querySelector('[data-testid="team-detail-row"]').previousElementSibling.getAttribute('data-team')), '17');
      await page.waitForFunction(() => { const r = document.querySelector('[data-testid="team-detail"]').getBoundingClientRect(); return r.top >= -1 && r.top < innerHeight; });
      assert.equal(await inView(), true);
      assert.equal(await page.locator(`${tid('team-detail')} .result-card`).count(), 16);
      assert.equal(await rowOf(17).locator(tid('team-view')).getAttribute('aria-expanded'), 'true');
      await h.shot(page, `104-team-open-${label}`);

      // it stays open (and where it is) through the 5 s refresh, and keeps showing the team
      // (first let the page's own smooth scroll to the team finish: wait until the position has not moved for a moment)
      await page.waitForFunction(() => new Promise((resolve) => { const y = scrollY; setTimeout(() => resolve(scrollY === y), 700); }), null, { timeout: 15000 });
      const before = await page.evaluate(() => Math.round(scrollY));
      await page.waitForTimeout(6500);
      assert.equal(await page.locator(tid('team-detail-heading')).count(), 1);
      assert.equal(await page.evaluate(() => document.querySelector('[data-testid="team-detail-row"]').previousElementSibling.getAttribute('data-team')), '17');
      assert.ok(Math.abs((await page.evaluate(() => Math.round(scrollY))) - before) < 3, 'the page did not jump');

      // opening another team closes the first; clicking the open team (or Close) closes it
      await rowOf(3).locator(tid('team-view')).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="team-detail-row"]')?.previousElementSibling?.getAttribute('data-team') === '3');
      assert.equal(await page.locator(tid('team-detail-row')).count(), 1);
      await page.waitForSelector(tid('team-detail-heading'));
      await page.click(tid('team-detail-close'));
      assert.equal(await page.locator(tid('team-detail-row')).count(), 0);
      await rowOf(5).locator(tid('team-view')).click();
      await page.waitForSelector(tid('team-detail-heading'));
      await rowOf(5).locator(tid('team-view')).click();
      assert.equal(await page.locator(tid('team-detail-row')).count(), 0);
      assert.deepEqual(errors, []);
      await ctx.close();
    } finally {
      await h.close();
    }
  });
}
