// The starter Demo Hunt as a new organiser meets it, and the protections for a player in the middle of a game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

test('a new organiser finds a Demo Hunt that opens in 5 minutes, and players can play it', async () => {
  const h = await launch();
  try {
    const org = await h.desktop('org');
    const a = org.page;
    await a.goto(h.url('/admin/'));
    await a.fill(tid('reg-user'), 'dana');
    await a.fill(tid('reg-pass'), 'purple-giraffe-lunch-42');
    await a.click(tid('register-button'));
    await a.waitForSelector(tid('codes-panel'));
    await a.check(tid('codes-saved'));
    await a.click(tid('codes-continue'));
    const card = `${tid('event-card')}[data-slug="demo-hunt"]`;
    await a.waitForSelector(card);
    assert.match(await a.textContent(card), /Demo Hunt/);
    assert.match(await a.textContent(card), /\/e\/[a-z2-9]{4}\/demo-hunt\//);
    assert.match(await a.textContent('#new-prefix'), /^\/e\/[a-z2-9]{4}\/$/); // the organiser's code in front of any new hunt name
    await h.shot(a, '40-dashboard-with-demo');
    await a.click(card);
    await a.waitForSelector(tid('event-title'));
    assert.equal(await a.textContent(tid('event-status')), 'Waiting to start');
    await a.click(tid('tab-questions'));
    await a.waitForSelector(tid('editor-zone'));
    assert.equal(await a.locator(tid('editor-zone')).count(), 6);
    assert.equal(await a.locator(tid('editor-question')).count(), 53);
    await h.shot(a, '41-demo-editor');
    await a.click(tid('tab-overview'));
    await a.waitForSelector(tid('event-link'));
    const link = await a.getAttribute(tid('event-link'), 'href');
    assert.match(link, /\/e\/[a-z2-9]{4}\/demo-hunt\/$/);

    // a player arrives early: pre-game screen
    const p = await h.phone('player');
    const t = p.page;
    await t.goto(link);
    await t.waitForSelector(tid('join-button'));
    assert.match(await t.textContent(tid('status')), /Game starts in: [0-9]+ min/);
    assert.equal(await t.locator('a[href="/"]').count(), 0); // nothing on a game page leads away from the game
    await t.fill(tid('team-name'), 'Early Birds');
    await t.click(tid('join-button'));
    await t.waitForURL(/\/play\/$/);
    await t.waitForSelector(tid('team-number'));
    assert.equal(await t.locator(tid('zone-tile')).count(), 0); // no questions before the start
    await h.shot(t, '42-demo-pre-game');

    // six minutes after signup the game is on
    h.clock.offset = 6 * 60_000;
    await t.reload();
    await t.waitForSelector(tid('zone-tile'));
    assert.equal(await t.locator(tid('zone-tile')).count(), 6);
    assert.equal(await t.locator(`${tid('zone-tile')} img`).count(), 6); // every zone has its picture
    await h.shot(t, '43-demo-zones');
    await t.click(`${tid('zone-tile')}[data-zone="z1"]`);
    await t.waitForSelector(tid('question'));
    assert.equal(await t.locator(`${tid('zone-panel')}[data-zone="z1"] ${tid('question')}`).count(), 10);
    assert.match(await t.locator(`${tid('zone-panel')}[data-zone="z1"] ${tid('q-number')}`).first().textContent(), /Question 1 of 10/);
    await t.fill(`${tid('question')}[data-question="q1"] ${tid('answer-input')}`, 'Perth');
    await t.click(`${tid('question')}[data-question="q1"] ${tid('answer-submit')}`);
    await t.waitForSelector(`${tid('question')}[data-question="q1"][data-state="done"]`);
    await h.shot(t, '44-demo-zone-panel');
    await t.click(tid('zone-back'));
    await t.click(`${tid('zone-tile')}[data-zone="z6"]`); // the code-breakers
    assert.equal(await t.locator(`${tid('zone-panel')}[data-zone="z6"] ${tid('question')}`).count(), 3);
    await h.shot(t, '45-demo-code-breakers');

    // the game ends after 15 minutes
    h.clock.offset = 21 * 60_000;
    await t.goto(link);
    await t.waitForSelector(tid('results-link'));
    assert.match(await t.textContent(tid('status')), /Game over/);
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
    await api('POST', '/api/auth/register', { username: 'erin', password: 'purple-giraffe-lunch-42', timeZone: 'UTC' });
    const created = await (await api('POST', '/api/admin/events', { slug: 'quick-hunt', name: 'Quick Hunt', timeZone: 'UTC' })).json();
    const day = new Date(h.now()).toISOString().slice(0, 10);
    await api('PUT', `/api/admin/events/${created.id}/config`, { name: 'Quick Hunt', timeZone: 'UTC', day, start: '00:00', end: '23:59', teamNames: true, joinCode: '', whatsappUrl: '' });
    await api('PUT', `/api/admin/events/${created.id}/content`, { instructions: '', zones: [{ id: 'z1', name: 'Zone', map: null, questions: [{ id: 'q1', type: 'whole-number', text: 'One plus one?', answers: ['2'], score: 5 }] }] });

    const p = await h.phone('player');
    const t = p.page;
    await t.goto(h.url('/'));
    assert.equal(await t.isVisible(tid('continue-card')), false); // nothing to continue yet
    await t.goto(h.url(`/e/${created.org}/quick-hunt/`));
    await t.fill(tid('team-name'), 'Wanderers');
    await t.click(tid('join-button'));
    await t.waitForSelector(tid('zone-tile'));
    // every page of the game has clear buttons back to the scoreboard, and no link to the site's front page
    assert.equal(await t.locator('a[href="/"]').count(), 0);
    assert.equal(await t.getAttribute(tid('back-to-board'), 'class').then((c) => c.includes('btn')), true);

    // they type the site's plain address (or tap an old link): the front page offers the way back
    await t.goto(h.url('/'));
    await t.waitForSelector(tid('continue-card'));
    await h.shot(t, '46-continue-card');
    assert.match(await t.textContent(tid('continue-card')), /Quick Hunt/);
    await t.click(tid('continue-link'));
    await t.waitForSelector(tid('play-link'));
    await t.click(tid('play-link'));
    await t.waitForSelector(tid('zone-tile'));
    assert.equal(await t.textContent(tid('team-label')), 'Wanderers'); // the session was never lost
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
