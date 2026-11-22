// Share this hunt: the heading link and the QR code both open a dialog with the link, a big QR code to download, and print.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

test('Share this hunt: link, copy, QR download and print sheet, on desktop and a 360 px phone', async () => {
  const h = await launch();
  try {
    for (const [label, open, width] of [['desk', h.desktop, 1100], ['phone', (l) => h.phone(l, 360), 360]]) {
      const { ctx, page } = await open(`share-${label}`);
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
      const api = (m, p, d) => ctx.request.fetch(h.url(p), { method: m, data: d, headers: { 'content-type': 'application/json' } });
      assert.equal((await api('POST', '/api/auth/register', { username: `sh${label}`, password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
      const made = await (await api('POST', '/api/admin/events', { slug: 'share-me', name: 'Share Me', timeZone: 'UTC' })).json();
      await page.goto(h.url(`/admin/event/?id=${made.id}#overview`));
      await page.waitForSelector(tid('share-open'));
      assert.match(await page.textContent(tid('share-open')), /Share this hunt/);
      assert.equal(await page.locator(`${tid('share-open')} svg`).count(), 1); // the share icon

      for (const trigger of ['share-open', 'qr-open']) { // both ways in
        await page.click(tid(trigger));
        await page.waitForSelector(`${tid('share-dialog')}[open]`);
        const url = await page.inputValue(tid('share-url'));
        assert.match(url, /\/e\/[a-z0-9]{4}\/share-me\/$/);
        await page.click(tid('share-copy'));
        await page.waitForFunction((sel) => /Copied|Ctrl\+C/.test(document.querySelector(sel).textContent), tid('share-copy'));
        if (trigger === 'share-open') {
          await h.shot(page, `92-share-${label}`);
          const box = await page.locator(tid('share-dialog')).boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'dialog fits the screen');
          const href = await page.getAttribute(tid('share-download'), 'href');
          assert.match(href, /^data:image\/png;base64,/);
          assert.equal(await page.getAttribute(tid('share-download'), 'download'), 'share-me-qr.png');
          const [dl] = await Promise.all([page.waitForEvent('download'), page.click(tid('share-download'))]);
          assert.equal(dl.suggestedFilename(), 'share-me-qr.png');
          // print: the sheet is built with the name and the code
          await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
          await page.click(tid('share-print'));
          assert.equal(await page.evaluate(() => window.__printed), true);
          assert.equal(await page.locator('#print-sheet h1').textContent(), 'Share Me');
          assert.equal(await page.locator('#print-sheet img').count(), 1);
        }
        await page.click(tid('share-close'));
        await page.waitForSelector(tid('share-dialog'), { state: 'detached' });
      }
    }
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
