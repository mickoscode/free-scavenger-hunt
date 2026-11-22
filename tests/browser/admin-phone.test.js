// Every signed-in organiser and site admin page on a small Android-sized phone (360 px wide): nothing may run off the right edge
// (the sign out button used to), and the bar's buttons must all be on screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

const WIDTH = 360;
// Under phone emulation the page quietly zooms out to fit wide content, so measure the elements themselves. Tables sit in a
// scrolling box on purpose, and the floating emoji are decoration.
const overflowing = (page) => page.evaluate((width) => [...document.querySelectorAll('body *')]
  .filter((e) => !e.closest('.float, .table-responsive, [hidden]') && e.getClientRects().length && e.getBoundingClientRect().right > width + 1)
  .slice(0, 5).map((e) => `${e.tagName.toLowerCase()}${e.className ? `.${String(e.className).split(' ')[0]}` : ''} ${e.textContent.trim().slice(0, 30)} -> ${Math.round(e.getBoundingClientRect().right)}px`), WIDTH);
// Line 1: "Made in Perth, Western Australia". Line 2: the links, side by side. Everything centred. Measured in ONE step: the page may
// still be scrolling smoothly, and two separate measurements would then disagree.
const footerLayout = async (page, width) => {
  const m = await page.evaluate(() => {
    const r = (e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
    return { made: r(document.querySelector('.footer-made')), links: [...document.querySelectorAll('.footer-links a')].map(r) };
  });
  assert.ok(m.links.length >= 1);
  assert.ok(m.made.bottom <= m.links[0].top + 1, 'the links are below the text, not beside it');
  assert.equal(new Set(m.links.map((l) => Math.round(l.top))).size, 1, 'the links share one line');
  assert.ok(Math.abs((m.made.left + m.made.right) / 2 - width / 2) < 12, 'the text is centred');
  assert.ok(Math.abs((Math.min(...m.links.map((l) => l.left)) + Math.max(...m.links.map((l) => l.right))) / 2 - width / 2) < 12, 'the links are centred');
};
const onScreen = async (page, id) => { const box = await page.locator(tid(id)).boundingBox(); return box !== null && box.x >= 0 && box.x + box.width <= WIDTH; };

test('signed-in organiser pages fit a 360 px phone, and the sign out button is always on screen', async () => {
  const h = await launch();
  try {
    const { page } = await h.phone('organiser', WIDTH);
    await page.goto(h.url('/admin/'));
    await page.fill(tid('reg-user'), 'gina');
    await page.fill(tid('reg-pass'), 'purple-giraffe-lunch-42');
    await page.click(tid('register-button'));
    await page.check(tid('codes-saved'));
    await page.click(tid('codes-continue'));
    await page.waitForSelector(tid('create-button'));
    const check = async (label) => {
      assert.deepEqual(await overflowing(page), [], `${label}: runs off the screen`);
      for (const id of ['admin-brand', 'nav-events', 'nav-user', 'logout']) assert.equal(await onScreen(page, id), true, `${label}: ${id} is not fully on screen`);
    };
    await check('dashboard');
    await footerLayout(page, WIDTH);
    await h.shot(page, '60-phone-dashboard');

    await page.click(`${tid('event-card')}[data-slug="demo-hunt"]`);
    await page.waitForSelector(tid('event-title'));
    for (const tab of ['overview', 'settings', 'questions', 'teams', 'scoring']) {
      await page.click(tid(`tab-${tab}`));
      await page.waitForTimeout(500);
      await check(`event ${tab}`);
      if (tab === 'questions') await h.shot(page, '61-phone-questions');
      if (tab === 'overview') await h.shot(page, '62-phone-overview');
    }
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test('the site admin page and its bar fit a 360 px phone too', async () => {
  const h = await launch();
  try {
    const { page } = await h.phone('site admin', WIDTH);
    await page.goto(h.url('/admin/'));
    await page.fill(tid('login-user'), 'siteadmin');
    await page.fill(tid('login-pass'), 'dev-password-123');
    await page.click(tid('login-button'));
    await page.waitForSelector(tid('nav-site'));
    await page.click(tid('nav-site'));
    await page.waitForSelector(tid('users-table'));
    assert.deepEqual(await overflowing(page), []);
    for (const id of ['admin-brand', 'nav-events', 'nav-site', 'nav-user', 'logout']) assert.equal(await onScreen(page, id), true, id);
    await footerLayout(page, WIDTH);
    await h.shot(page, '63-phone-site-admin');
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
