// Before the game starts the page says WHEN (time and date) if it is another day, and counts down only on the day itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

const J = { 'content-type': 'application/json' };

test('the hunt page and the play page say when the game starts, and count down only on the day', async () => {
  const h = await launch();
  try {
    const org = await h.desktop('org');
    const api = (m, p, d) => org.ctx.request.fetch(h.url(p), { method: m, data: d, headers: J });
    assert.equal((await api('POST', '/api/auth/register', { username: 'starttext', password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
    const made = await (await api('POST', '/api/admin/events', { slug: 'when-hunt', name: 'When', timeZone: 'UTC' })).json();
    await api('PUT', `/api/admin/events/${made.id}/content`, { instructions: '', zones: [{ id: 'z1', name: 'A', map: null, questions: [{ id: 'q1', type: 'whole-number', text: 'One?', answers: ['1'], score: 1 }] }] });
    const setClock = (iso) => { h.clock.offset = Date.parse(iso) - Date.now(); };
    const cfg = (day) => api('PUT', `/api/admin/events/${made.id}/config`, { name: 'When', timeZone: 'UTC', day, start: '08:30', end: '10:00', teamNames: true, joinCode: '', whatsappUrl: '', override: 'override' });

    // the info the page reads carries the hunt's time zone
    assert.equal((await cfg('2027-03-06')).status(), 200); // Saturday 6 Mar (the organiser's setup is done before the clock moves: a session lasts 12 hours)
    setClock('2027-03-04T03:00:00Z'); // Thursday 4 Mar 2027, 03:00 UTC
    const info = await (await api('GET', `/api/events/${made.org}/when-hunt/info`)).json();
    assert.equal(info.timeZone, 'UTC');

    const player = await h.phone('player', 360);
    const view = h.url(`/e/${made.org}/when-hunt/`);
    const says = async (page, text) => { await page.waitForFunction((t) => document.querySelector('[data-testid="status"]').textContent === t, text, { timeout: 8000 }); };
    await player.page.goto(view);
    await says(player.page, 'Game starts at 08:30 on Saturday 6 Mar'); // another day: no countdown at all
    await h.shot(player.page, '103-starts-at');
    // the day before, late in the evening: still "at ... on ..."
    setClock('2027-03-05T23:50:00Z');
    await player.page.reload();
    await says(player.page, 'Game starts at 08:30 on Saturday 6 Mar');

    // the day itself: hours, then minutes, then m:ss
    for (const [now, text] of [
      ['2027-03-06T00:05:00Z', 'Game starts in 8 hours'], // 8 h 25 min to go: rounded down
      ['2027-03-06T03:00:00Z', 'Game starts in 5 h 30 min'], // under 6 hours: by the minute
      ['2027-03-06T07:30:00Z', 'Game starts in 1 h 00 min'],
      ['2027-03-06T07:45:00Z', 'Game starts in 45 min'],
      ['2027-03-06T08:24:00Z', 'Game starts in 6 min'],
      ['2027-03-06T08:27:00Z', 'Game starts in 3:00'],
    ]) {
      setClock(now);
      await player.page.reload();
      await says(player.page, text);
    }
    // the last minutes tick by the second, on the page itself
    await player.page.waitForFunction(() => /^Game starts in 2:5\d$|^Game starts in 2:59$/.test(document.querySelector('[data-testid="status"]').textContent), null, { timeout: 8000 });

    // a team that joined sees the same on the play page; when the game starts it turns into the usual "Time left"
    assert.equal((await player.ctx.request.fetch(h.url(`/api/events/${made.org}/when-hunt/join`), { method: 'POST', data: { name: 'Early' }, headers: J })).status(), 200);
    setClock('2027-03-06T03:00:00Z');
    await player.page.goto(`${view}play/`);
    await says(player.page, 'Game starts in 5 h 30 min');
    setClock('2027-03-06T08:31:00Z');
    await player.page.reload();
    await player.page.waitForFunction(() => /^Time left: /.test(document.querySelector('[data-testid="status"]').textContent), null, { timeout: 8000 });
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test('the start is described in the hunt\'s own time zone, not the viewer\'s', async () => {
  const h = await launch();
  try {
    const org = await h.desktop('org2');
    const api = (m, p, d) => org.ctx.request.fetch(h.url(p), { method: m, data: d, headers: J });
    assert.equal((await api('POST', '/api/auth/register', { username: 'starttext2', password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
    const made = await (await api('POST', '/api/admin/events', { slug: 'perth-hunt', name: 'Perth', timeZone: 'Australia/Perth' })).json();
    await api('PUT', `/api/admin/events/${made.id}/content`, { instructions: '', zones: [{ id: 'z1', name: 'A', map: null, questions: [{ id: 'q1', type: 'whole-number', text: 'One?', answers: ['1'], score: 1 }] }] });
    // 16:50 on Friday 27 Nov 2026 in Perth; it is Tuesday 24 Nov, 00:10 UTC (08:10 Perth) now, and the viewer's own zone is a different one again
    h.clock.offset = Date.parse('2026-11-24T00:10:00Z') - Date.now();
    await api('PUT', `/api/admin/events/${made.id}/config`, { name: 'Perth', timeZone: 'Australia/Perth', day: '2026-11-27', start: '16:50', end: '18:20', teamNames: true, joinCode: '', whatsappUrl: '', override: 'override' });
    const ctx = await h.browser.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(h.url(`/e/${made.org}/perth-hunt/`));
    await page.waitForFunction(() => document.querySelector('[data-testid="status"]').textContent === 'Game starts at 16:50 on Friday 27 Nov');
    await ctx.close();
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
