// A whole hunt through the real pages: an organiser registers, builds and runs an event, two teams play, photos are scored, the
// results are published. Also the site admin. Set SHOTS_DIR to keep screenshots of each step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, makePng, tid } from './helpers.js';

test('organiser builds a hunt, teams play it, results are published', async () => {
  const h = await launch();
  try {
    // ---- organiser registers and creates a hunt
    const org = await h.desktop('organiser');
    const a = org.page;
    a.on('dialog', (d) => d.accept());
    await a.goto(h.url('/admin/'));
    await h.shot(a, '01-signin');
    await a.fill(tid('reg-user'), 'ann');
    await a.fill(tid('reg-pass'), 'a-long-password-1');
    await a.click(tid('register-button'));
    await a.waitForSelector(tid('create-button'));
    await a.fill(tid('new-name'), 'Beach Hunt');
    assert.equal(await a.inputValue(tid('new-slug')), 'beach-hunt'); // suggested from the name
    await a.selectOption(tid('new-tz'), 'UTC');
    await h.shot(a, '02-dashboard');
    await a.click(tid('create-button'));
    await a.waitForSelector(tid('event-title'));

    // ---- questions: one zone with a text question, a number question and a photo challenge
    await a.waitForSelector(tid('add-zone'));
    await a.click(tid('add-zone'));
    await a.fill(tid('zone-name-input'), 'Beach');
    await a.click(tid('add-question'));
    await a.locator(tid('editor-question')).nth(0).locator(tid('q-text')).fill('What colour is the lifeguard tower?');
    await a.fill(tid('q-answers'), 'red\ncrimson');
    await a.click(tid('add-question'));
    const q2 = a.locator(tid('editor-question')).nth(1);
    await q2.locator(tid('q-type')).selectOption('whole-number');
    await q2.locator(tid('q-text')).fill('How many flags are flying?');
    await q2.locator(tid('q-answer')).fill('3');
    await a.click(tid('add-photo'));
    await a.locator(tid('editor-question')).nth(2).locator(tid('q-text')).fill('Photo of your team at the jetty');
    await a.fill(tid('instructions-input'), '# Rules\n\n- Stay together\n- Send photos to WhatsApp');
    await a.waitForSelector(`${tid('instructions-preview')} h3`); // the live preview of the instructions
    // a map, chosen from the organiser's own computer: shrunk in the browser, uploaded, shown at once
    const png = makePng();
    await a.setInputFiles(tid('map-file'), { name: 'map.png', mimeType: 'image/png', buffer: png });
    await a.waitForSelector(`${tid('editor-zone')} img[src^="/assets/"]`);
    await a.click(tid('zone-copy'));
    assert.equal(await a.locator(tid('editor-zone')).count(), 2);
    await a.locator(tid('editor-zone')).nth(1).locator('button', { hasText: 'Remove zone' }).click();
    assert.equal(await a.locator(tid('editor-zone')).count(), 1);
    await h.shot(a, '03-editor');
    await a.click(tid('save-content'));
    await a.waitForSelector('text=Saved.');

    // ---- settings: a game that is running right now (UTC)
    await a.click(tid('tab-settings'));
    const t = new Date(h.now());
    const hhmm = (d) => d.toISOString().slice(11, 16);
    await a.fill(tid('set-day'), t.toISOString().slice(0, 10));
    await a.fill(tid('set-start'), '00:00');
    await a.fill(tid('set-end'), '23:59');
    await a.click(tid('save-settings'));
    await a.waitForSelector('text=Saved.');
    await h.shot(a, '04-settings');
    void hhmm;
    await a.click(tid('tab-overview'));
    await a.waitForSelector(tid('qr'));
    await h.shot(a, '05-overview');
    assert.equal(await a.textContent(tid('event-status')), 'In progress');
    const link = await a.getAttribute(tid('event-link'), 'href');
    assert.match(link, /\/e\/beach-hunt\/$/);

    // ---- team 1 joins on a phone
    const p1 = await h.phone('team1');
    const t1 = p1.page;
    await t1.goto(link);
    await t1.waitForSelector(tid('join-button'));
    await h.shot(t1, '10-join');
    await t1.fill(tid('team-name'), 'Sea Dogs');
    await t1.click(tid('join-button'));
    await t1.waitForURL(/\/play\/$/);
    await t1.waitForSelector(tid('zone-tile'));
    assert.equal(await t1.textContent(tid('team-number')), 'Team 1');
    assert.equal(await t1.textContent(tid('team-label')), 'Sea Dogs');
    await t1.click('summary');
    await h.shot(t1, '11-play');
    assert.equal(await t1.locator(`${tid('zone-tile')} img`).count(), 1); // the zone's map thumbnail
    await t1.click(tid('zone-tile'));
    await t1.waitForSelector(tid('question'));
    await t1.fill(`${tid('question')}[data-question="q1"] ${tid('answer-input')}`, 'Red');
    await t1.click(`${tid('question')}[data-question="q1"] ${tid('answer-submit')}`);
    await t1.waitForSelector(`${tid('question')}[data-question="q1"][data-state="done"]`);
    assert.equal(await t1.locator(`${tid('question')}[data-question="q1"] ${tid('answer-input')}`).inputValue(), ''); // nothing about the answer stays on the page
    // numbers: letters cannot be typed
    await t1.locator(`${tid('question')}[data-question="q2"] ${tid('answer-input')}`).pressSequentially('3x');
    assert.equal(await t1.locator(`${tid('question')}[data-question="q2"] ${tid('answer-input')}`).inputValue(), '3');
    await t1.click(`${tid('question')}[data-question="q2"] ${tid('answer-submit')}`);
    await t1.click(`${tid('photo')} ${tid('photo-submit')}`);
    await t1.waitForSelector(`${tid('photo')}[data-state="done"]`);
    await h.shot(t1, '12-zone');
    assert.match(await t1.textContent(tid('panel-progress')), /completed/);

    // ---- team 2 joins and answers wrong; the scoreboard shows both
    const p2 = await h.phone('team2');
    const t2 = p2.page;
    await t2.goto(link);
    await t2.fill(tid('team-name'), 'Gulls');
    await t2.click(tid('join-button'));
    await t2.waitForSelector(tid('zone-tile'));
    await t2.click(tid('zone-tile'));
    await t2.fill(`${tid('question')}[data-question="q1"] ${tid('answer-input')}`, 'blue');
    await t2.click(`${tid('question')}[data-question="q1"] ${tid('answer-submit')}`);
    await t2.waitForSelector(`${tid('question')}[data-question="q1"][data-state="done"]`);

    await t1.goto(link);
    await t1.waitForSelector(tid('score-row'));
    await t1.waitForFunction(() => document.querySelectorAll('[data-testid="score-row"]').length === 2);
    const rows = await t1.locator(tid('score-row')).allTextContents();
    assert.match(rows[0], /Sea Dogs/);
    assert.match(rows[0], /3\/3/);
    assert.match(rows[0], /20/); // 10 + 10 for the two correct answers
    assert.equal(await t1.textContent(tid('board-heading')), 'provisional results:');
    assert.equal(await t1.locator(tid('score-row')).first().getAttribute('class').then((c) => c.includes('table-primary')), true); // own row highlighted
    await h.shot(t1, '13-board');

    // ---- organiser scores the photo
    await a.click(tid('tab-scoring'));
    await a.waitForSelector(tid('photo-row'));
    await a.check(`${tid('photo-row')} input[value="half"]`);
    await a.click(tid('apply'));
    await a.waitForSelector(`${tid('photo-row')}[data-decision="half"]`);
    await h.shot(a, '06-scoring');
    await a.click(tid('tab-teams'));
    await a.waitForSelector(tid('team-row'));
    await a.click(`${tid('team-row')} >> nth=0 >> ${tid('team-view')}`);
    await a.waitForSelector(tid('team-detail-heading'));
    assert.match(await a.textContent(tid('team-detail-heading')), /Sea Dogs: 1st of 2/);
    await h.shot(a, '07-teams');

    // ---- the game ends: the pages notice, the organiser publishes
    h.clock.offset = 48 * 3600 * 1000;
    await t1.goto(link);
    await t1.waitForSelector(tid('results-link'));
    assert.equal(await t1.isVisible(tid('play-link')), false);
    await t1.click(tid('results-link'));
    await t1.waitForSelector(tid('not-ready'));
    // two days passed on the server, so the organiser's 12 hour session has ended: sign in again
    await a.goto(h.url('/admin/'));
    await a.fill(tid('login-user'), 'ann');
    await a.fill(tid('login-pass'), 'a-long-password-1');
    await a.click(tid('login-button'));
    await a.click(tid('event-card'));
    await a.click(tid('tab-scoring'));
    await a.waitForSelector(tid('applied-all'));
    await a.check(tid('applied-all'));
    await a.click(tid('publish'));
    await a.waitForSelector(tid('unpublish'));
    await t1.reload();
    await t1.waitForSelector(tid('place'));
    assert.match(await t1.textContent(tid('place')), /You finished 1st of 2/);
    assert.match(await t1.textContent(tid('total')), /^30 points/); // 10 + 10 + half of the 20 point photo
    const cards = await t1.locator(tid('result-question')).allTextContents();
    assert.match(cards[0], /Your answer: Red/);
    assert.match(cards[0], /Official answer: red or crimson/);
    await h.shot(t1, '14-results');

    // anybody can open a summary from the scoreboard, without answers
    const viewer = await h.phone('viewer');
    await viewer.page.goto(link);
    await viewer.page.waitForSelector(`${tid('score-row')} a`);
    assert.equal(await viewer.page.textContent(tid('board-heading')), 'final results:');
    await viewer.page.click(`${tid('score-row')} a >> nth=1`);
    await viewer.page.waitForSelector(tid('place'));
    assert.match(await viewer.page.textContent(tid('place')), /Gulls finished 2nd of 2/);
    const summary = await viewer.page.textContent('body');
    assert.doesNotMatch(summary, /crimson|Your answer/);
    await h.shot(viewer.page, '15-summary');

    assert.deepEqual(h.errors, []);
  } finally {
    if (h.errors.length) console.log('BROWSER ERRORS', h.errors);
    await h.close();
  }
});

test('site admin: sees organisers, can suspend one, reset a password, and close registration', async () => {
  const h = await launch();
  try {
    const org = await h.desktop('org');
    await org.page.goto(h.url('/admin/'));
    await org.page.fill(tid('reg-user'), 'bob');
    await org.page.fill(tid('reg-pass'), 'a-long-password-1');
    await org.page.click(tid('register-button'));
    await org.page.waitForSelector(tid('create-button'));
    assert.equal(await org.page.isVisible(tid('nav-site')), false); // organisers do not see the site menu

    const boss = await h.desktop('boss');
    const p = boss.page;
    await p.goto(h.url('/admin/'));
    await p.fill(tid('login-user'), 'siteadmin');
    await p.fill(tid('login-pass'), 'dev-password-123');
    await p.click(tid('login-button'));
    await p.click(tid('nav-site'));
    await p.waitForSelector(`${tid('user-row')}[data-user="bob"]`);
    await h.shot(p, '20-site');
    await p.locator(`${tid('user-row')}[data-user="bob"] button`, { hasText: 'Reset password' }).click();
    await p.waitForSelector('#temp-password:not([hidden])');
    assert.match(await p.textContent('#temp-password'), /Temporary password for bob: [a-z0-9]{5}-/);
    await p.locator(`${tid('user-row')}[data-user="bob"] button`, { hasText: 'Suspend' }).click();
    await p.waitForSelector(`${tid('user-row')}[data-user="bob"] >> text=suspended`);
    await org.page.reload();
    await org.page.waitForSelector(tid('login-button')); // bob's session ended

    await p.uncheck(tid('registration-open'));
    await boss.page.waitForTimeout(300);
    const visitor = await h.desktop('visitor');
    await visitor.page.goto(h.url('/admin/'));
    await visitor.page.waitForSelector('#registration-closed:not([hidden])');
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
