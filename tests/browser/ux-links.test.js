// Small navigation conveniences: Back to top, the signed-in state of the public pages, and the Test button on My hunts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

const scrollY = (page) => page.evaluate(() => Math.round(window.scrollY));
const toBottom = (page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

async function organiser(h, name) {
  const { ctx, page } = await h.desktop(name);
  const api = (method, path, data) => ctx.request.fetch(h.url(path), { method, data, headers: { 'content-type': 'application/json' } });
  assert.equal((await api('POST', '/api/auth/register', { username: name, password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
  return { page, api };
}
async function hunt(api, h, slug, questions = 1) {
  const created = await (await api('POST', '/api/admin/events', { slug, name: `Hunt ${slug}`, timeZone: 'UTC' })).json();
  const day = new Date(h.now()).toISOString().slice(0, 10);
  await api('PUT', `/api/admin/events/${created.id}/config`, { name: `Hunt ${slug}`, timeZone: 'UTC', day, start: '00:00', end: '23:59', teamNames: true, joinCode: '', whatsappUrl: '' });
  const qs = Array.from({ length: questions }, (_, i) => ({ id: `q${i + 1}`, type: 'whole-number', text: `Question number ${i + 1}: what is one plus one?`, answers: ['2'], score: 1 }));
  assert.equal((await api('PUT', `/api/admin/events/${created.id}/content`, { instructions: '', zones: [{ id: 'z1', name: 'Zone', map: null, questions: qs }] })).status(), 200);
  return created;
}

test('the public pages know the organiser is signed in: Sign out in the header, and "Hunt admin page" instead of "Organiser sign in"', async () => {
  const h = await launch();
  try {
    const { page } = await organiser(h, 'hana');
    for (const path of ['/', '/about/']) {
      await page.goto(h.url(path));
      await page.waitForSelector(tid('header-signout'));
      assert.equal(await page.locator(tid('header-signin')).count(), 0, `${path}: no sign in button while signed in`);
      assert.equal(await page.textContent(tid('header-signout')), 'Sign out');
      if (path === '/') {
        assert.equal((await page.textContent(tid('signin-link'))).trim(), 'Hunt admin page');
        assert.equal(await page.getAttribute(tid('signin-link'), 'href'), '/admin/');
        await h.shot(page, '80-front-signed-in');
      }
    }
    // signing out from there really signs out, and the pages go back to inviting people in
    await page.click(tid('header-signout'));
    await page.waitForSelector(tid('header-signin'));
    assert.equal(await page.locator(tid('header-signout')).count(), 0);
    await page.goto(h.url('/'));
    await page.waitForSelector(tid('header-signin'));
    assert.match(await page.textContent(tid('signin-link')), /Organiser sign in/);
    assert.equal(await page.locator(tid('header-signout')).count(), 0);
    assert.equal((await page.evaluate(() => fetch('/api/admin/events').then((r) => r.status))), 401); // and the session really is gone

    // a visitor who never signed in sees the sign in buttons, and nothing is broken
    const visitor = (await h.desktop('visitor')).page;
    await visitor.goto(h.url('/'));
    assert.equal(await visitor.isVisible(tid('header-signin')), true);
    assert.match(await visitor.textContent(tid('signin-link')), /Organiser sign in/);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test('My hunts has a Test button next to Manage that goes to the page players see; Manage and the whole card still open the manager', async () => {
  const h = await launch();
  try {
    const { page, api } = await organiser(h, 'ivan');
    const created = await hunt(api, h, 'try-me');
    await page.goto(h.url('/admin/'));
    const card = `${tid('event-card')}[data-slug="try-me"]`;
    await page.waitForSelector(card);
    assert.equal(await page.getAttribute(`${card} ${tid('event-test')}`, 'href'), `/e/${created.org}/try-me/`);
    assert.equal((await page.textContent(`${card} ${tid('event-test')}`)).trim(), 'Test ›');
    assert.equal((await page.textContent(`${card} ${tid('event-manage')}`)).trim(), 'Manage ›');
    await h.shot(page, '81-my-hunts-test-button');

    // Test: opens the view page in a NEW tab (whatever state the game is in; this one is running) and leaves My hunts open
    assert.equal(await page.getAttribute(`${card} ${tid('event-test')}`, 'target'), '_blank');
    assert.match(await page.getAttribute(`${card} ${tid('event-test')}`, 'rel'), /noopener/);
    const [tab] = await Promise.all([page.context().waitForEvent('page'), page.click(`${card} ${tid('event-test')}`)]);
    await tab.waitForLoadState();
    assert.match(tab.url(), new RegExp(`/e/${created.org}/try-me/$`));
    await tab.waitForSelector(tid('event-name'));
    assert.match(await tab.textContent(tid('status')), /Time left/);
    assert.equal(await tab.evaluate(() => window.opener), null); // noopener: the new tab cannot reach back into the dashboard
    await tab.close();
    assert.equal(page.url(), h.url('/admin/')); // My hunts is still right where it was
    assert.equal(await page.isVisible(card), true);

    // Manage and the card itself both open the manager
    await page.goto(h.url('/admin/'));
    await page.click(`${card} ${tid('event-manage')}`);
    await page.waitForSelector(tid('event-title'));
    await page.goto(h.url('/admin/'));
    await page.locator(card).click({ position: { x: 40, y: 15 } }); // somewhere on the card that is not a button
    await page.waitForSelector(tid('event-title'));
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test('Back to top works on long pages, and does not disturb pages that keep their place in the address', async () => {
  const h = await launch();
  try {
    const { page, api } = await organiser(h, 'jade');
    const created = await hunt(api, h, 'long-one', 14);

    // the About page (hash links of its own)
    await page.goto(h.url('/about/'));
    await toBottom(page);
    assert.ok((await scrollY(page)) > 500);
    await page.click(tid('back-to-top'));
    await page.waitForFunction(() => window.scrollY < 4);

    // the hunt manager keeps its tab in the address: going to the top must not change tab
    await page.goto(h.url(`/admin/event/?id=${created.id}#questions`));
    await page.waitForSelector(tid('editor-zone'));
    await toBottom(page);
    assert.ok((await scrollY(page)) > 500, 'the question editor is a long page');
    await page.click(tid('back-to-top'));
    await page.waitForFunction(() => window.scrollY < 4);
    assert.equal(await page.evaluate(() => location.hash), '#questions');
    assert.equal(await page.locator(tid('editor-zone')).count(), 1);
    assert.match(await page.getAttribute(tid('tab-questions'), 'class'), /active/);
    await h.shot(page, '82-editor-bottom');

    // a player's zone page keeps its place in the address too
    const p = await h.phone('player');
    const t = p.page;
    await t.goto(h.url(`/e/${created.org}/long-one/`));
    await t.fill(tid('team-name'), 'Scrollers');
    await t.click(tid('join-button'));
    await t.waitForSelector(tid('zone-tile'));
    await t.click(tid('zone-tile'));
    await t.waitForSelector(tid('zone-top'));
    await toBottom(t);
    assert.ok((await scrollY(t)) > 500);
    await t.click(tid('zone-top'));
    await t.waitForFunction(() => window.scrollY < 4);
    assert.equal(await t.evaluate(() => location.hash), '#z1'); // still in the zone
    assert.equal(await t.locator(tid('zone-panel')).first().isVisible(), true);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
