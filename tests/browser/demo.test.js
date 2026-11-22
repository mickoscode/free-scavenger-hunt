// The Demo Hunt as a new organiser meets it: a copy of the site admin's master-demo that opens in 5 minutes. And the protections for a
// player in the middle of a game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, makePng, tid } from './helpers.js';

const signUp = async (h, name) => {
  const { page } = await h.desktop(name);
  await page.goto(h.url('/admin/'));
  await page.fill(tid('reg-user'), name);
  await page.fill(tid('reg-pass'), 'purple-giraffe-lunch-42');
  await page.click(tid('register-button'));
  await page.waitForSelector(tid('codes-panel'));
  await page.check(tid('codes-saved'));
  await page.click(tid('codes-continue'));
  await page.waitForSelector(tid('create-button'));
  return page;
};
const demoZones = async (page) => {
  await page.click(`${tid('event-card')}[data-slug="demo-hunt"]`);
  await page.waitForSelector(tid('event-title'));
  await page.click(tid('tab-questions'));
  await page.waitForSelector(tid('zone-name-input'));
  return page.locator(tid('zone-name-input')).evaluateAll((inputs) => inputs.map((i) => i.value));
};

// What the site admin does in a real deployment: a hunt called master-demo in their own account (here through the API).
async function makeMaster(h, zoneNames) {
  const boss = await h.desktop('site admin');
  const api = (method, path, data) => boss.ctx.request.fetch(h.url(path), { method, data, headers: { 'content-type': 'application/json' } });
  assert.equal((await api('POST', '/api/auth/login', { username: 'siteadmin', password: 'dev-password-123' })).status(), 200);
  const made = await (await api('POST', '/api/admin/events', { slug: 'master-demo', name: 'Demo Hunt', timeZone: 'UTC' })).json();
  const png = makePng().toString('base64');
  const save = async (names) => {
    const zones = [];
    for (const [i, name] of names.entries()) {
      const { map } = await (await api('POST', `/api/admin/events/${made.id}/zones/z${i + 1}/map`, { thumb: png, full: png })).json();
      zones.push({ id: `z${i + 1}`, name, map, questions: [
        { id: 'q1', type: 'whole-number', text: `${name}: two plus two?`, answers: ['4'], score: 5 },
        { id: 'q2', type: 'string', text: `${name}: capital of Western Australia?`, answers: ['perth'], score: 5 },
      ] });
    }
    assert.equal((await api('PUT', `/api/admin/events/${made.id}/content`, { instructions: '# Welcome to the demo', zones })).status(), 200);
  };
  await save(zoneNames);
  return { save };
}

test('a new organiser gets a copy of master-demo that opens in 5 minutes, players can play it, and later edits reach only later signups', async () => {
  const h = await launch();
  try {
    // before any master-demo exists a new organiser simply has no demo, and nothing is broken
    const none = await signUp(h, 'early');
    assert.equal(await none.locator(`${tid('event-card')}[data-slug="demo-hunt"]`).count(), 0);
    assert.equal(await none.isVisible('#no-events'), true);

    const master = await makeMaster(h, ['Zone One', 'Zone Two']);
    const a = await signUp(h, 'dana');
    const card = `${tid('event-card')}[data-slug="demo-hunt"]`;
    await a.waitForSelector(card);
    assert.match(await a.textContent(card), /Demo Hunt/);
    assert.match(await a.textContent(card), /\/e\/[a-z2-9]{4}\/demo-hunt\//);
    assert.match(await a.textContent('#new-prefix'), /^\/e\/[a-z2-9]{4}\/$/);
    await h.shot(a, '40-dashboard-with-demo');
    assert.deepEqual(await demoZones(a), ['Zone One', 'Zone Two']);
    await a.click(tid('tab-overview'));
    assert.equal(await a.textContent(tid('event-status')), 'Waiting to start');
    await a.waitForSelector(tid('event-link'));
    const link = await a.getAttribute(tid('event-link'), 'href');
    assert.match(link, /\/e\/[a-z2-9]{4}\/demo-hunt\/$/);

    // a player arrives early: the pre-game screen, no questions yet, nothing on the page leads out of the game
    const p = await h.phone('player');
    const t = p.page;
    await t.goto(link);
    await t.waitForSelector(tid('join-button'));
    assert.match(await t.textContent(tid('status')), /Game starts in: (\d+ min|\d+:\d{2})/);
    assert.equal(await t.locator('a[href="/"]').count(), 0);
    await t.fill(tid('team-name'), 'Early Birds');
    await t.click(tid('join-button'));
    await t.waitForURL(/\/play\/$/);
    await t.waitForSelector(tid('team-number'));
    assert.equal(await t.locator(tid('zone-tile')).count(), 0);

    // six minutes after signup the game is on, with the master's zones and pictures
    h.clock.offset = 6 * 60_000;
    await t.reload();
    await t.waitForSelector(tid('zone-tile'));
    assert.equal(await t.locator(tid('zone-tile')).count(), 2);
    assert.equal(await t.locator(`${tid('zone-tile')} img`).count(), 2);
    await t.click(`${tid('zone-tile')}[data-zone="z1"]`);
    await t.waitForSelector(tid('question'));
    assert.match(await t.locator(`${tid('zone-panel')}[data-zone="z1"] ${tid('q-number')}`).first().textContent(), /Question 1 of 2/);
    await t.fill(`${tid('question')}[data-question="q2"] ${tid('answer-input')}`, 'Perth');
    await t.click(`${tid('question')}[data-question="q2"] ${tid('answer-submit')}`);
    await t.waitForSelector(`${tid('question')}[data-question="q2"][data-state="done"]`);
    h.clock.offset = 21 * 60_000; // it ends after 15 minutes
    await t.goto(link);
    await t.waitForSelector(tid('results-link'));
    assert.match(await t.textContent(tid('status')), /Game over/);

    // the site admin edits master-demo: the next organiser gets the edit, earlier organisers keep what they were given
    await master.save(['Edited Zone']);
    const b = await signUp(h, 'erin');
    await b.waitForSelector(card);
    assert.deepEqual(await demoZones(b), ['Edited Zone']);
    await a.goto(h.url('/admin/'));
    assert.deepEqual(await demoZones(a), ['Zone One', 'Zone Two']);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test('a player who leaves the game by accident is led straight back', async () => {
  const h = await launch();
  try {
    const org = await h.desktop('org');
    const api = (method, path, data) => org.ctx.request.fetch(h.url(path), { method, data, headers: { 'content-type': 'application/json' } });
    await api('POST', '/api/auth/register', { username: 'erin2', password: 'purple-giraffe-lunch-42', timeZone: 'UTC' });
    const created = await (await api('POST', '/api/admin/events', { slug: 'quick-hunt', name: 'Quick Hunt', timeZone: 'UTC' })).json();
    const day = new Date(h.now()).toISOString().slice(0, 10);
    await api('PUT', `/api/admin/events/${created.id}/config`, { name: 'Quick Hunt', timeZone: 'UTC', day, start: '00:00', end: '23:59', teamNames: true, joinCode: '', whatsappUrl: '' });
    await api('PUT', `/api/admin/events/${created.id}/content`, { instructions: '', zones: [{ id: 'z1', name: 'Zone', map: null, questions: [{ id: 'q1', type: 'whole-number', text: 'One plus one?', answers: ['2'], score: 5 }] }] });

    const p = await h.phone('player');
    const t = p.page;
    await t.goto(h.url('/'));
    assert.equal(await t.isVisible(tid('continue-card')), false);
    await t.goto(h.url(`/e/${created.org}/quick-hunt/`));
    await t.fill(tid('team-name'), 'Wanderers');
    await t.click(tid('join-button'));
    await t.waitForSelector(tid('zone-tile'));
    assert.equal(await t.locator('a[href="/"]').count(), 0);
    assert.equal(await t.getAttribute(tid('back-to-board'), 'class').then((c) => c.includes('btn')), true);

    await t.goto(h.url('/'));
    await t.waitForSelector(tid('continue-card'));
    await h.shot(t, '46-continue-card');
    assert.match(await t.textContent(tid('continue-card')), /Quick Hunt/);
    await t.click(tid('continue-link'));
    await t.waitForSelector(tid('play-link'));
    await t.click(tid('play-link'));
    await t.waitForSelector(tid('zone-tile'));
    assert.equal(await t.textContent(tid('team-label')), 'Wanderers');
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
