// Small navigation conveniences: Back to top, the signed-in state of the public pages, and the Play button on My hunts.
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
        assert.equal((await page.textContent(tid('create-link'))).trim(), 'Hunt admin page');
        assert.equal(await page.getAttribute(tid('create-link'), 'href'), '/admin/');
        assert.equal(await page.locator(tid('signin-link')).count(), 0); // one button, not two to the same place
        await h.shot(page, '80-front-signed-in');
      } else {
        assert.equal((await page.textContent(tid('about-create'))).trim(), 'Hunt admin page');
      }
    }
    // signing out from there really signs out, and the pages go back to inviting people in
    await page.click(tid('header-signout'));
    await page.waitForSelector(tid('header-signin'));
    assert.equal(await page.locator(tid('header-signout')).count(), 0);
    await page.goto(h.url('/'));
    await page.waitForSelector(tid('header-signin'));
    assert.match(await page.textContent(tid('create-link')), /Create your hunt/);
    assert.match(await page.textContent(tid('header-signin')), /Sign in/);
    assert.equal(await page.locator(tid('header-signout')).count(), 0);
    assert.equal((await page.evaluate(() => fetch('/api/admin/events').then((r) => r.status))), 401); // and the session really is gone

    // a visitor who never signed in sees the sign in buttons, and nothing is broken
    const visitor = (await h.desktop('visitor')).page;
    await visitor.goto(h.url('/'));
    assert.equal(await visitor.isVisible(tid('header-signin')), true);
    assert.match(await visitor.textContent(tid('create-link')), /Create your hunt/);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test('My hunts has a Play button next to Manage that goes to the page players see; Manage and the whole card still open the manager', async () => {
  const h = await launch();
  try {
    const { page, api } = await organiser(h, 'ivan');
    const created = await hunt(api, h, 'try-me');
    await page.goto(h.url('/admin/'));
    const card = `${tid('event-card')}[data-slug="try-me"]`;
    await page.waitForSelector(card);
    assert.equal(await page.getAttribute(`${card} ${tid('event-play')}`, 'href'), `/e/${created.org}/try-me/`);
    assert.equal((await page.textContent(`${card} ${tid('event-play')}`)).trim(), 'Play ›');
    assert.equal((await page.textContent(`${card} ${tid('event-manage')}`)).trim(), 'Manage ›');
    await h.shot(page, '81-my-hunts-test-button');

    // Test: opens the view page in a NEW tab (whatever state the game is in; this one is running) and leaves My hunts open
    assert.equal(await page.getAttribute(`${card} ${tid('event-play')}`, 'target'), '_blank');
    assert.match(await page.getAttribute(`${card} ${tid('event-play')}`, 'rel'), /noopener/);
    const [tab] = await Promise.all([page.context().waitForEvent('page'), page.click(`${card} ${tid('event-play')}`)]);
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

// No page offers two big buttons for the same place side by side. (The header, the footer and a link in the text may repeat a destination;
// that is navigation. What is checked here is the call-to-action area of each page.)
test('each public page has one call-to-action button to the organiser page, not two', async () => {
  const h = await launch();
  try {
    const visitor = (await h.desktop('v')).page;
    const big = (p) => p.evaluate(() => [...document.querySelectorAll('main a.btn[href="/admin/"], main a.btn[href="/"], main a.btn[href="/about/"]')].filter((e) => e.getClientRects().length).map((e) => e.getAttribute('href')));
    await visitor.goto(h.url('/'));
    assert.deepEqual((await big(visitor)).filter((x) => x === '/admin/'), ['/admin/']);
    await visitor.goto(h.url('/about/'));
    assert.deepEqual(await big(visitor), ['/admin/', '/about/'].filter((x) => x === '/admin/'));
    await visitor.goto(h.url('/admin/'));
    await visitor.waitForSelector(tid('login-button'));
    assert.deepEqual(await big(visitor), []); // no extra Home / About buttons: the header and footer have them
    assert.equal(await visitor.locator(tid('playing-home')).count(), 1); // the one in the text for people who are only here to play stays
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

// The WhatsApp "Test link" on the Settings tab opens the group's invite link. It is NOT the "Play" button on My hunts, whatever the hunt page is called.
test('Settings tab: the WhatsApp link button is called Test link and opens the invite link', async () => {
  const h = await launch();
  try {
    const { page, api } = await organiser(h, 'wanda');
    const created = await hunt(api, h, 'wa-hunt', [{ id: 'q1', type: 'string', text: 'Q?', answers: ['a'], score: 1 }]);
    await page.goto(h.url(`/admin/event/?id=${created.id}#settings`));
    await page.waitForSelector(tid('set-whatsapp'));
    await page.fill(tid('set-whatsapp'), 'https://chat.whatsapp.com/abcdefghij');
    const link = page.locator('a:has-text("Test link")');
    assert.equal(await link.count(), 1);
    assert.equal(await link.isVisible(), true);
    assert.equal(await link.getAttribute('href'), 'https://chat.whatsapp.com/abcdefghij');
    assert.equal(await page.locator('a:has-text("Play link")').count(), 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
