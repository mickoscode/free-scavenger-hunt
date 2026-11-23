// Score adjustments: the organiser adds one bonus or penalty (with a reason) per team on the Scoring tab; it only counts once the final
// results are published; the team sees the points and the reason on its results page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

const J = { 'content-type': 'application/json' };
const overflowing = (page, w) => page.evaluate((width) => [...document.querySelectorAll('body *')]
  .filter((e) => !e.closest('[hidden], .float, .table-responsive') && e.getClientRects().length && e.getBoundingClientRect().right > width + 1)
  .slice(0, 5).map((e) => `${e.tagName.toLowerCase()} ${(e.getAttribute('data-testid') ?? e.textContent.trim()).slice(0, 30)} -> ${Math.round(e.getBoundingClientRect().right)}px`), w);

for (const [label, width] of [['desktop', 1100], ['phone', 360]]) {
  test(`adjusting team scores on the Scoring tab, publishing, and what the team sees (${label})`, async () => {
    const h = await launch();
    try {
      const org = await (label === 'phone' ? h.phone('org', 360) : h.desktop('org'));
      const api = (m, p, d) => org.ctx.request.fetch(h.url(p), { method: m, data: d, headers: J });
      assert.equal((await api('POST', '/api/auth/register', { username: `adj${label}`, password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
      const made = await (await api('POST', '/api/admin/events', { slug: 'adj-hunt', name: 'Adj', timeZone: 'UTC' })).json();
      const day = new Date(h.now()).toISOString().slice(0, 10);
      const cfg = (start, end) => api('PUT', `/api/admin/events/${made.id}/config`, { name: 'Adj', timeZone: 'UTC', day, start, end, teamNames: true, joinCode: '', whatsappUrl: '', override: 'override' });
      await api('PUT', `/api/admin/events/${made.id}/content`, { instructions: '', zones: [{ id: 'z1', name: 'A', map: null, questions: [{ id: 'q1', type: 'whole-number', text: 'One?', answers: ['1'], score: 10 }] }] });
      assert.equal((await cfg('00:00', '23:59')).status(), 200);
      const join = `/api/events/${made.org}/adj-hunt`;

      // eight teams (more than six, so the list gets a search box); Alpha is the one we follow
      const alpha = await h.phone('alpha', 390);
      assert.equal((await alpha.ctx.request.fetch(h.url(`${join}/join`), { method: 'POST', data: { name: 'Alpha' }, headers: J })).status(), 200);
      await alpha.ctx.request.fetch(h.url(`${join}/answer`), { method: 'POST', data: { zone: 'z1', question: 'q1', answer: '1' }, headers: J });
      for (const name of ['Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']) {
        const c = await h.browser.newContext();
        assert.equal((await c.request.fetch(h.url(`${join}/join`), { method: 'POST', data: { name }, headers: J })).status(), 200);
        await c.close();
      }
      // the game is over
      assert.equal((await cfg('00:00', '00:01')).status(), 200);
      h.clock.offset = 2 * 3600 * 1000;

      await org.page.goto(h.url(`/admin/event/?id=${made.id}#scoring`));
      await org.page.waitForSelector(tid('adjust-row'));
      const row = (n) => org.page.locator(`${tid('adjust-row')}[data-team="${n}"]`);
      assert.equal(await org.page.locator(tid('adjust-row')).count(), 8);
      assert.equal(await org.page.isVisible(tid('adjust-filter')), true);
      assert.match(await row(1).textContent(), /Alpha/);
      assert.equal((await row(1).locator(tid('adj-final')).textContent()).trim(), 'Final 10');

      // a penalty: points without a reason is not saved, says why; with a reason it saves and the final total is previewed
      await row(1).locator(tid('adj-points')).fill('-5');
      await row(1).locator(tid('adj-points')).blur();
      assert.match(await row(1).locator(tid('adj-state')).textContent(), /Add a reason/);
      assert.equal((await row(1).locator(tid('adj-final')).textContent()).trim(), 'Final 5');
      assert.equal((await (await api('GET', `/api/admin/events/${made.id}/teams`)).json()).teams.find((t) => t.number === 1).adjustment, null);
      await row(1).locator(tid('adj-reason')).fill('Late back');
      await row(1).locator(tid('adj-reason')).blur();
      await org.page.waitForFunction(() => document.querySelector('[data-testid="adjust-row"][data-team="1"] [data-testid="adj-state"]').textContent.includes('Saved'));
      assert.equal(await row(1).getAttribute('data-adjusted'), 'true');
      // a bonus for another team, reusing the suggested reason
      assert.ok((await org.page.locator('#adjust-reasons option').evaluateAll((o) => o.map((x) => x.value))).includes('Late back'));
      await row(2).locator(tid('adj-points')).fill('3.5');
      await row(2).locator(tid('adj-reason')).fill('Bonus for fair play');
      await row(2).locator(tid('adj-reason')).blur();
      await org.page.waitForFunction(() => document.querySelector('[data-testid="adjust-row"][data-team="2"] [data-testid="adj-state"]').textContent.includes('Saved'));
      // and a third that is then changed to nothing
      await row(3).locator(tid('adj-points')).fill('9');
      await row(3).locator(tid('adj-reason')).fill('Oops');
      await row(3).locator(tid('adj-reason')).blur();
      await org.page.waitForFunction(() => document.querySelector('[data-testid="adjust-row"][data-team="3"] [data-testid="adj-state"]').textContent.includes('Saved'));
      await row(3).locator(tid('adj-points')).fill('');
      await row(3).locator(tid('adj-points')).blur();
      await org.page.waitForFunction(() => document.querySelector('[data-testid="adjust-row"][data-team="3"] [data-testid="adj-state"]').textContent.includes('Removed'));
      assert.equal(await row(3).locator(tid('adj-reason')).inputValue(), '');

      // the search box
      await org.page.fill(tid('adjust-filter'), 'bra');
      assert.equal(await org.page.locator(`${tid('adjust-row')}:visible`).count(), 1);
      await org.page.fill(tid('adjust-filter'), '');
      assert.equal(await org.page.locator(`${tid('adjust-row')}:visible`).count(), 8);
      await h.shot(org.page, `101-adjustments-${label}`);
      assert.deepEqual(await overflowing(org.page, width), []);

      // nothing counts yet: the public scoreboard and Alpha's own score are the running totals
      const board = async () => (await (await alpha.ctx.request.fetch(h.url(`${join}/scoreboard`), { headers: J })).json());
      assert.equal((await board()).teams.find((t) => t.name === 'Alpha').score, 10);
      assert.equal((await (await alpha.ctx.request.fetch(h.url(`${join}/me`))).json()).score, 10);
      assert.match(await org.page.textContent(tid('adjusted-line')), /2 teams have a score adjustment: it is added when you publish/);

      // publish; the rows become read-only
      await org.page.check(tid('applied-all'));
      await org.page.click(tid('publish'));
      await org.page.waitForSelector(tid('unpublish'));
      await org.page.waitForFunction(() => document.querySelector('[data-testid="adj-points"]').disabled);
      assert.equal(await org.page.locator(tid('adjust-note')).textContent().then((t) => /read-only/.test(t)), true);

      // now they count: scoreboard, and Alpha's results page shows the penalty and the reason
      const after = (await board()).teams;
      assert.equal(after.find((t) => t.name === 'Alpha').score, 5);
      assert.equal(after.find((t) => t.name === 'Bravo').score, 3.5);
      await alpha.page.goto(h.url(`/e/${made.org}/adj-hunt/results/`));
      await alpha.page.waitForSelector(tid('result-adjustment'));
      assert.equal(await alpha.page.getAttribute(tid('result-adjustment'), 'data-direction'), 'penalty');
      assert.match(await alpha.page.textContent(tid('adjustment-points')), /^−5 points$/);
      assert.equal((await alpha.page.textContent(tid('adjustment-reason'))).trim(), 'Late back');
      assert.match(await alpha.page.textContent(tid('total')), /^5 points$/);
      await h.shot(alpha.page, `102-results-adjustment-${label}`);
      assert.deepEqual(await overflowing(alpha.page, 390), []);

      // a team's summary seen by anybody: the points, not the reason; a team without an adjustment has no card
      const visitor = await h.desktop('visitor');
      await visitor.page.goto(h.url(`/e/${made.org}/adj-hunt/results/?team=1`));
      await visitor.page.waitForSelector(tid('result-adjustment'));
      assert.match(await visitor.page.textContent(tid('adjustment-points')), /−5 points/);
      assert.equal(await visitor.page.locator(tid('adjustment-reason')).count(), 0);
      assert.equal((await visitor.page.content()).includes('Late back'), false);
      await visitor.page.goto(h.url(`/e/${made.org}/adj-hunt/results/?team=4`));
      await visitor.page.waitForSelector(tid('total'));
      assert.equal(await visitor.page.locator(tid('result-adjustment')).count(), 0);
      const bravo = await h.browser.newContext();
      await bravo.request.fetch(h.url(`${join}/scoreboard`)); // (scoreboard is public)
      await bravo.close();

      // back to provisional: the adjustments are editable again and the scoreboard is back to the running totals
      await org.page.click(tid('unpublish'));
      await org.page.waitForFunction(() => !document.querySelector('[data-testid="adj-points"]').disabled);
      assert.equal((await board()).teams.find((t) => t.name === 'Alpha').score, 10);
      assert.deepEqual(h.errors.filter((e) => !/status of (400|401|409)/.test(e)), []);
    } finally {
      await h.close();
    }
  });
}
