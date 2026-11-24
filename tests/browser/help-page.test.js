// The Help page and its footer link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

const footerLinks = (page, sel = '.footer-links a') => page.$$eval(sel, (els) => els.map((e) => `${e.textContent.trim()}=${e.getAttribute('href')}`));
const overflowing = (page, w) => page.evaluate((width) => [...document.querySelectorAll('body *')]
  .filter((e) => !e.closest('[hidden], .float, .table-responsive') && e.getClientRects().length && e.getBoundingClientRect().right > width + 1)
  .slice(0, 5).map((e) => `${e.tagName.toLowerCase()} ${e.textContent.trim().slice(0, 30)} -> ${Math.round(e.getBoundingClientRect().right)}px`), w);

test('Help is in the footer after About on every page that has a footer, and nowhere in a running game', async () => {
  const h = await launch();
  try {
    const { ctx, page } = await h.desktop('f');
    const api = (m, p, d) => ctx.request.fetch(h.url(p), { method: m, data: d, headers: { 'content-type': 'application/json' } });
    // visitor pages
    await page.goto(h.url('/'));
    assert.deepEqual(await footerLinks(page), ['About=/about/', 'Help=/help/']);
    await page.goto(h.url('/about/'));
    assert.deepEqual(await footerLinks(page), ['Home=/', 'About=/about/', 'Help=/help/']);
    await page.goto(h.url('/admin/'));
    await page.waitForSelector(tid('login-button'));
    assert.deepEqual(await footerLinks(page), ['Home=/', 'About=/about/', 'Help=/help/']);
    // the public header has Help (with a small icon) where About used to be; About is in the footer only; the organiser bar and page text have neither
    for (const p of ['/', '/about/', '/help/', '/admin/']) {
      await page.goto(h.url(p));
      assert.equal(await page.locator('header a[href="/help/"]').count(), 1, `${p}: one Help link in the header`);
      assert.match((await page.textContent('header a[href="/help/"]')).trim(), /^🛟\s*Help$/);
      assert.equal(await page.locator('header a[href="/about/"]').count(), 0, `${p}: no About link in the header`);
      // only the word is underlined, not the icon; and the icon still clicks through (it is inside the link)
      const deco = await page.$eval('header a[href="/help/"]', (a) => ({
        link: getComputedStyle(a).textDecorationLine,
        word: getComputedStyle(a.querySelector('.help-word')).textDecorationLine,
        wordText: a.querySelector('.help-word').textContent,
        icon: a.querySelector('[aria-hidden]').textContent,
        iconInside: a.contains(a.querySelector('[aria-hidden]')),
      }));
      assert.deepEqual(deco, { link: 'none', word: 'underline', wordText: 'Help', icon: '🛟', iconInside: true }, `${p}: header Help link`);
      assert.equal(await page.locator('.admin-nav a[href="/help/"], main a[href="/help/"]').count(), 0, `${p}: not in the organiser bar or the page`);
    }
    // clicking the icon itself goes to the Help page, like the word
    await page.goto(h.url('/'));
    await page.click('header a[href="/help/"] [aria-hidden]');
    await page.waitForURL((u) => u.pathname === '/help/');
    // the not-found page's header matches
    await page.goto(h.url('/e/zzzz/never-was/'));
    await page.waitForSelector(tid('lost-header'));
    assert.deepEqual(await page.$$eval(`${tid('lost-header')} .site-nav a`, (e) => e.map((a) => a.getAttribute('href'))), ['/help/']);
    // organiser pages
    assert.equal((await api('POST', '/api/auth/register', { username: 'helper', password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
    const made = await (await api('POST', '/api/admin/events', { slug: 'help-hunt', name: 'Help', timeZone: 'UTC' })).json();
    await page.goto(h.url('/admin/'));
    await page.waitForSelector(tid('event-card'));
    assert.deepEqual(await footerLinks(page), ['Home=/', 'About=/about/', 'Help=/help/']);
    await page.goto(h.url(`/admin/event/?id=${made.id}`));
    await page.waitForSelector(tid('event-title'));
    assert.deepEqual(await footerLinks(page), ['Home=/', 'About=/about/', 'Help=/help/']);
    // a hunt that is not found has the site footer, with Help
    await page.goto(h.url('/e/zzzz/never-was/'));
    await page.waitForSelector(tid('lost-footer'));
    assert.deepEqual(await footerLinks(page, `${tid('lost-footer')} .footer-links a`), ['Home=/', 'About=/about/', 'Help=/help/']);
    // but a game page never links out
    await page.goto(h.url(`/e/${made.org}/help-hunt/`));
    await page.waitForSelector(tid('event-name'));
    assert.equal(await page.locator('a[href="/help/"], a[href="/"], a[href="/about/"]').count(), 0);
    assert.deepEqual(h.errors.filter((e) => !/status of (400|401|409)/.test(e)), []);
  } finally {
    await h.close();
  }
});

for (const [label, width] of [['desktop', 1100], ['phone', 360]]) {
  test(`the Help page: contents, sections, working links, fits the screen (${label})`, async () => {
    const h = await launch();
    try {
      const { page } = await (label === 'phone' ? h.phone('h', 360) : h.desktop('h'));
      await page.goto(h.url('/help/'));
      assert.equal((await page.textContent(tid('help-title'))).trim(), 'Help');
      assert.match(await page.title(), /Help/);

      // the contents: two groups; every link points at something on the page
      assert.deepEqual(await page.$$eval(`${tid('toc')} .toc-group`, (e) => e.map((x) => x.textContent.trim())), ['For players', 'For organisers']);
      const tocHrefs = await page.$$eval(`${tid('toc')} a`, (e) => e.map((x) => x.getAttribute('href')));
      assert.ok(tocHrefs.length >= 12, `a contents entry for each section (${tocHrefs.length})`);
      const ids = new Set(await page.$$eval('[id]', (e) => e.map((x) => x.id)));
      for (const href of await page.$$eval('a[href^="#"]', (e) => e.map((x) => x.getAttribute('href')))) if (href !== '#top') assert.ok(ids.has(href.slice(1)), `${href} exists`);
      // the contents comes before the first section
      assert.equal(await page.evaluate(() => document.querySelector('.toc').compareDocumentPosition(document.querySelector('#players')) & Node.DOCUMENT_POSITION_FOLLOWING), 4);

      // what has to be explained is explained
      const text = (await page.textContent('body')).replace(/\s+/g, ' ');
      for (const phrase of [
        'Joining a hunt', 'Playing a hunt', 'Provisional and final scores', 'provisional results', 'final results', 'Return to your game',
        'Creating a hunt', 'Clone', 'Export and import', 'Create a new hunt', 'The phases of a hunt', 'Setting up', 'Waiting to start', 'In progress', 'Finished',
        'Overview', 'Settings', 'Questions', 'Teams', 'Scoring', 'Data', 'Publish final results', 'Delete all player data', 'Score adjustments', 'bonus or penalty', 'only when you publish the final results', 'and your reason',
        'Share this hunt', 'QR code', 'Download image', 'Print', 'join code', 'Team names', 'WhatsApp group', 'Photo challenges', 'recovery code', 'Limits',
      ]) assert.ok(text.toLowerCase().includes(phrase.toLowerCase()), `says "${phrase}"`);
      // the player part is brief next to the organiser part
      const parts = await page.evaluate(() => {
        const o = document.querySelector('#organisers');
        const range = (a, b) => { const r = document.createRange(); r.setStartAfter(a); r.setEndBefore(b); return r.toString().length; };
        return { players: range(document.querySelector('#players'), o), organisers: [...document.querySelectorAll('article > *')].filter((n) => n.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_PRECEDING).reduce((n, e) => n + e.textContent.length, 0) };
      });
      assert.ok(parts.players < parts.organisers / 2, `players ${parts.players} vs organisers ${parts.organisers}`);

      // the page is brief: the whole text stays well short of what it was
      assert.ok(text.length < 10000, `the help text is ${text.length} characters`);

      // the contents jump to the section without changing anything else
      await page.click(`${tid('toc')} a[href="#tab-scoring"]`).catch(async () => { await page.click(`${tid('toc')} a[href="#share"]`); });
      await page.waitForFunction(() => location.hash.length > 1);
      // every link to elsewhere on the site really exists
      const internal = [...new Set(await page.$$eval('a[href^="/"]', (e) => e.map((x) => x.getAttribute('href').split('#')[0])))];
      for (const href of internal) assert.equal((await page.request.get(h.url(href))).status(), 200, href);
      assert.equal(await page.locator('a[href^="http"]').count(), 0); // nothing leaves the site
      assert.equal(await page.getAttribute(tid('footer-help'), 'aria-current'), 'page');
      assert.deepEqual(await footerLinks(page), ['Home=/', 'About=/about/', 'Help=/help/']);
      assert.deepEqual(await overflowing(page, width), []);
      await h.shot(page, `100-help-${label}`);
      assert.deepEqual(h.errors, []);
    } finally {
      await h.close();
    }
  });
}

test('the Help page knows when an organiser is signed in', async () => {
  const h = await launch();
  try {
    const { ctx, page } = await h.desktop('s');
    assert.equal((await ctx.request.fetch(h.url('/api/auth/register'), { method: 'POST', data: { username: 'helpme', password: 'purple-giraffe-lunch-42', timeZone: 'UTC' }, headers: { 'content-type': 'application/json' } })).status(), 200);
    await page.goto(h.url('/help/'));
    await page.waitForSelector(tid('header-signout'));
    assert.equal((await page.textContent(tid('help-create'))).trim(), 'Hunt admin page');
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
