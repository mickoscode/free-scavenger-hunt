// The public front page and the About page, on a phone and on a desktop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

// Under phone emulation the page quietly zooms out to fit wide content, so scrollWidth alone cannot reveal it: check that no
// element (other than the decorative floating emoji) reaches past the right edge of the configured screen.
const noSideScroll = (page) => page.evaluate((width) => ![...document.querySelectorAll('body *')].some((e) => !e.closest('.float') && e.getBoundingClientRect().right > width + 1), page.viewportSize().width);

test('the front page keeps its original wording, is inviting, and leads to About; About says why the site exists', async () => {
  const h = await launch();
  try {
    for (const [label, open] of [['phone', h.phone], ['desktop', h.desktop]]) {
      const { page } = await open(label);
      await page.goto(h.url('/'));
      const body = await page.textContent('body');
      // the original copy, unchanged
      for (const phrase of [
        'Free Scavenger Hunt',
        'Run a scavenger hunt for your school, club or community. Teams join on their phones, answer questions around your venue and race the clock. No apps, no cost.',
        'Create your hunt', 'Joining a hunt?',
        "Scan the QR code your organiser gave you, or type the hunt's address below",
        'How it works',
        'Organisers create an event: zones with maps, questions (text, numbers or photo challenges), a start and finish time.',
        'Teams join by QR code, pick a team name, and answer in each zone while the clock runs.',
        'Everyone watches a live scoreboard. The organiser scores photos, then publishes the final results with a full breakdown for each team.',
      ]) assert.ok(body.replace(/\s+/g, ' ').includes(phrase), phrase);
      assert.equal((await page.textContent('.site-footer')).replace(/\s+/g, ' ').includes('Made in Perth, Western Australia'), true); // the footer, exactly as the owner worded it
      assert.equal(await page.locator('.hero-art').isVisible(), true);
      assert.equal(await page.locator('.chip').count(), 5);
      assert.equal(await page.locator('ol.steps li').count(), 3);
      assert.equal(await noSideScroll(page), true, `${label}: sideways scrolling`);
      const below = await page.evaluate(() => document.querySelector('.footer-made').getBoundingClientRect().bottom <= document.querySelector('.footer-links a').getBoundingClientRect().top + 1); // one step: the page may still be scrolling
      assert.ok(below, `${label}: the footer links belong on their own line below the text`);
      await h.shot(page, `50-front-${label}`);

      await page.click(tid('footer-about')); // About is in the footer
      await page.waitForURL(/\/about\/$/);
      assert.match(await page.textContent(tid('about-title')), /About Free Scavenger Hunt/);
      assert.doesNotMatch(await page.textContent('.about-hero'), /volunteer in Perth|Western Australia/); // the owner asked for the top section to stay free of this
      const about = (await page.textContent('body')).replace(/\s+/g, ' ');
      for (const phrase of ['Sorrento Surf Life Saving Club', 'parkrun', 'Why it\'s free', 'harvest your data', 'No advertising, no tracking, no analytics']) assert.ok(about.includes(phrase), phrase);
      assert.ok(about.includes('isn\'t connected to parkrun') && about.includes('isn\'t run by, or officially connected to, the club'));
      assert.equal(await page.locator(tid('privacy')).isVisible(), true);
      // the table of contents sits above the first section, and every entry leads to a real section, in the same order
      const order = await page.evaluate(() => {
        const toc = document.querySelector('[data-testid="toc"]');
        const first = document.querySelector('article section');
        const links = [...toc.querySelectorAll('a')].map((a) => a.getAttribute('href').slice(1));
        const headings = [...document.querySelectorAll('article section[id]')].map((x) => x.id);
        return { above: Boolean(toc.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING), links, headings, firstIsWhy: first.id === 'why' };
      });
      assert.equal(order.above, true, 'the table of contents is above the first section');
      assert.equal(order.firstIsWhy, true);
      assert.deepEqual(order.links, order.headings, 'one entry per section, in order');
      assert.equal((await page.textContent(tid('toc'))).toLowerCase().includes('on this page'), false, 'no visible heading on the table of contents');
      assert.equal(await page.getAttribute(tid('toc'), 'aria-label'), 'On this page'); // still announced to screen readers
      assert.ok(order.links.includes('photos'));
      await page.click('[data-testid="toc"] a[href="#photos"]');
      await page.waitForFunction(() => location.hash === '#photos');
      assert.equal(await page.locator(tid('photos')).isVisible(), true);
      const photos = (await page.textContent(tid('photos'))).replace(/\s+/g, ' ');
      for (const phrase of ['completely optional', 'WhatsApp group', 'never sent to, shared with or stored by this site', 'Only take part if you know and trust the organiser', '100% sure', 'parent or guardian', 'This site accepts no responsibility', 'at their own risk']) assert.ok(photos.includes(phrase), phrase);
      assert.equal(await page.locator(tid('photo-warning')).isVisible(), true);
      assert.equal(await page.getAttribute(tid('source-link'), 'rel'), 'noopener');
      assert.equal(await noSideScroll(page), true, `${label}: about sideways scrolling`);
      await h.shot(page, `51-about-${label}`);

      // the footer takes you home, and the one big button on to sign in / create
      await page.click(tid('footer-home'));
      await page.waitForURL((u) => u.pathname === '/');
      await page.click(tid('create-link'));
      await page.waitForURL(/\/admin\/$/);
    }
    // the plain address without a trailing slash finds the page too
    const { page } = await h.desktop('slashless');
    const res = await page.goto(h.url('/about'));
    assert.match(page.url(), /\/about\/$/);
    assert.equal(res.status(), 200);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test('the organiser page leads home and to About when signed out, keeps its footer when signed in, and fits a phone', async () => {
  const h = await launch();
  try {
    for (const [label, open] of [['phone', h.phone], ['desktop', h.desktop]]) {
      const { page } = await open(label);
      await page.goto(h.url('/admin/'));
      await page.waitForSelector(tid('login-button'));
      assert.equal(await page.locator(tid('public-header')).isVisible(), true);
      assert.equal(await page.getAttribute(tid('brand-home'), 'href'), '/');
      assert.equal(await page.getAttribute(tid('nav-help'), 'href'), '/help/');
      assert.equal(await page.getAttribute(tid('playing-home'), 'href'), '/');
      assert.equal(await page.getAttribute(tid('footer-home'), 'href'), '/');
      assert.equal(await page.getAttribute(tid('footer-about'), 'href'), '/about/');
      assert.equal(await page.locator('.perks li').count(), 3);
      assert.equal(await noSideScroll(page), true, `${label}: sign in page sideways scrolling`);
      await h.shot(page, `52-organiser-signin-${label}`);
      // the links really go there
      await page.click(tid('footer-home'));
      await page.waitForURL((u) => u.pathname === '/');
      await page.goto(h.url('/admin/'));
      await page.click(tid('footer-about'));
      await page.waitForURL(/\/about\/$/);
    }
    // signed in: the public header gives way to the organiser bar, and the footer stays (Home and About)
    const { page } = await h.desktop('signed-in');
    await page.goto(h.url('/admin/'));
    await page.fill(tid('reg-user'), 'frank');
    await page.fill(tid('reg-pass'), 'purple-giraffe-lunch-42');
    await page.click(tid('register-button'));
    await page.check(tid('codes-saved'));
    await page.click(tid('codes-continue'));
    await page.waitForSelector(tid('create-button'));
    assert.equal(await page.locator(tid('public-header')).isVisible(), false);
    assert.equal(await page.locator(tid('nav-user')).isVisible(), true);
    assert.equal(await page.getAttribute(tid('footer-home'), 'href'), '/');
    assert.equal(await page.getAttribute(tid('footer-about'), 'href'), '/about/');
    await h.shot(page, '53-organiser-dashboard');
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
