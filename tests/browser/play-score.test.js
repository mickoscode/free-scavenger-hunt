// The play page shows the team's own running score on the right of the countdown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

for (const [label, width] of [['desktop', 1100], ['phone', 360]]) {
  test(`the play page shows "Score: N" at the right of "Time left" and keeps it up to date (${label})`, async () => {
    const h = await launch();
    try {
      const org = await h.desktop('org');
      const api = (m, p, d) => org.ctx.request.fetch(h.url(p), { method: m, data: d, headers: { 'content-type': 'application/json' } });
      assert.equal((await api('POST', '/api/auth/register', { username: `score${label}`, password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
      const made = await (await api('POST', '/api/admin/events', { slug: 'score-hunt', name: 'Score', timeZone: 'UTC' })).json();
      const day = new Date(h.now()).toISOString().slice(0, 10);
      const qs = [
        { id: 'q1', type: 'whole-number', text: 'One?', answers: ['1'], score: 10 },
        { id: 'q2', type: 'whole-number', text: 'Two?', answers: ['2'], score: 5.5 },
        { id: 'q3', type: 'photo', text: 'A photo', answers: [], score: 20 },
      ];
      assert.equal((await api('PUT', `/api/admin/events/${made.id}/content`, { instructions: '', zones: [{ id: 'z1', name: 'A', map: null, questions: qs }] })).status(), 200);
      const cfg = (start, end) => api('PUT', `/api/admin/events/${made.id}/config`, { name: 'Score', timeZone: 'UTC', day, start, end, teamNames: true, joinCode: '', whatsappUrl: 'https://chat.whatsapp.com/abcdefghij', override: 'override' });
      assert.equal((await cfg('00:00', '23:59')).status(), 200);

      const { page } = await (label === 'phone' ? h.phone('p', 360) : h.desktop('p'));
      await page.goto(h.url(`/e/${made.org}/score-hunt/`));
      await page.fill(tid('team-name'), 'Scorers');
      await page.click(tid('join-button'));
      await page.waitForURL(/\/play\/$/);
      await page.waitForSelector(tid('zone-tile'));

      // on the right of the countdown, same row, right aligned
      await page.waitForSelector(`${tid('score')}:not([hidden])`);
      assert.equal((await page.textContent(tid('score'))).trim(), 'Score: 0');
      const [st, sc] = await Promise.all([page.locator(tid('status')).boundingBox(), page.locator(tid('score')).boundingBox()]);
      assert.ok(sc.x > st.x + st.width - 1, 'score is to the right of the countdown');
      assert.ok(Math.abs((st.y + st.height / 2) - (sc.y + sc.height / 2)) < 6, 'one row');
      assert.ok(Math.abs((sc.x + sc.width) - (await page.evaluate(() => document.querySelector('main').getBoundingClientRect().right - parseFloat(getComputedStyle(document.querySelector('main')).paddingRight)))) < 3, 'right aligned');
      assert.ok(sc.x + sc.width <= width + 1);
      assert.match(await page.textContent(tid('status')), /Time left/);

      // a correct answer adds its points at once, a wrong one adds nothing
      await page.click(tid('zone-tile'));
      await page.fill(`${tid('question')}[data-question="q1"] ${tid('answer-input')}`, '1');
      await page.click(`${tid('question')}[data-question="q1"] ${tid('answer-submit')}`);
      await page.waitForFunction(() => document.querySelector('[data-testid="score"]').textContent === 'Score: 10');
      await page.fill(`${tid('question')}[data-question="q2"] ${tid('answer-input')}`, '9');
      await page.click(`${tid('question')}[data-question="q2"] ${tid('answer-submit')}`);
      await page.waitForSelector(`${tid('question')}[data-question="q2"][data-state="done"]`);
      assert.equal((await page.textContent(tid('score'))).trim(), 'Score: 10');
      await h.shot(page, `99-play-score-${label}`);

      // the organiser scores the photo: it shows up by itself on the next refresh (half = 10 points)
      await page.click(`${tid('photo')} ${tid('photo-submit')}`);
      await page.waitForSelector(`${tid('photo')}[data-state="done"]`);
      const photos = await (await api('GET', `/api/admin/events/${made.id}/photos`)).json();
      const item = (photos.photos ?? photos.items ?? photos)[0];
      assert.ok(item, 'a photo is waiting to be scored');
      assert.equal((await api('POST', `/api/admin/events/${made.id}/photos/score`, { team: item.team ?? item.number ?? 1, zone: 'z1', question: 'q3', decision: 'half' })).status(), 200);
      await page.reload();
      await page.waitForFunction(() => document.querySelector('[data-testid="score"]').textContent === 'Score: 20');

      // after the game: still shown (provisional) ; before the game: not shown
      assert.equal((await cfg('00:00', '00:01')).status(), 200); // (the day is today; the clock moves on)
      h.clock.offset += 2 * 3600 * 1000;
      await page.reload();
      await page.waitForSelector(tid('message'));
      assert.equal((await page.textContent(tid('score'))).trim(), 'Score: 20');
      assert.deepEqual(h.errors, []);
    } finally {
      await h.close();
    }
  });
}
