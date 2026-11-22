// Question editor: with several zones each can be folded away; "Fold all zones" / "Open all zones"; folded zones keep their content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

const overflowing = (page, w) => page.evaluate((width) => [...document.querySelectorAll('body *')]
  .filter((e) => !e.closest('[hidden], .float, .table-responsive') && e.getClientRects().length && e.getBoundingClientRect().right > width + 1)
  .slice(0, 5).map((e) => `${e.tagName.toLowerCase()} ${e.textContent.trim().slice(0, 30)}`), w);

for (const [label, width] of [['desktop', 1100], ['phone', 360]]) {
  test(`zones fold and open in the question editor (${label})`, async () => {
    const h = await launch();
    try {
      const { ctx, page } = await (label === 'phone' ? h.phone(`fold-${label}`, 360) : h.desktop(`fold-${label}`));
      const api = (m, p, d) => ctx.request.fetch(h.url(p), { method: m, data: d, headers: { 'content-type': 'application/json' } });
      assert.equal((await api('POST', '/api/auth/register', { username: `fold${label}`, password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
      const made = await (await api('POST', '/api/admin/events', { slug: 'fold-me', name: 'Fold Me', timeZone: 'UTC' })).json();
      const q = (n) => ({ id: `q${n}`, type: 'whole-number', text: `Question number ${n}?`, answers: [String(n)], score: 1 });
      const zones = ['Beach', 'Park', 'Cafe'].map((name, i) => ({ id: `z${i + 1}`, name, map: null, questions: [q(1), q(2), q(3)] }));
      assert.equal((await api('PUT', `/api/admin/events/${made.id}/content`, { instructions: '', zones })).status(), 200);

      await page.goto(h.url(`/admin/event/?id=${made.id}#questions`));
      await page.waitForSelector(tid('editor-zone'));
      const zone = (n) => page.locator(tid('editor-zone')).nth(n);
      const visibleQuestions = () => page.locator(`${tid('editor-question')}:visible`).count();
      assert.equal(await page.locator(tid('zone-toggle')).count(), 3);
      assert.equal(await visibleQuestions(), 9); // everything open to begin with
      assert.match(await zone(0).locator(tid('zone-toggle')).textContent(), /Zone 1: Beach.*3 questions/);

      // fold one zone: its questions go, the others stay; the page gets shorter
      const before = await page.evaluate(() => document.documentElement.scrollHeight);
      await zone(1).locator(tid('zone-toggle')).click();
      assert.equal(await zone(1).getAttribute('data-folded'), 'true');
      assert.equal(await zone(1).locator(tid('zone-toggle')).getAttribute('aria-expanded'), 'false');
      assert.equal(await visibleQuestions(), 6);
      assert.ok((await page.evaluate(() => document.documentElement.scrollHeight)) < before);
      assert.equal(page.url().split('#')[1], 'questions'); // the tab in the address is untouched
      // a folded zone can still be moved; it stays folded in its new place
      await zone(1).locator('[aria-label="Move zone down"]').click();
      assert.match(await zone(2).locator(tid('zone-toggle')).textContent(), /Zone 3: Park/);
      assert.equal(await zone(2).getAttribute('data-folded'), 'true');
      assert.equal(await zone(1).getAttribute('data-folded'), 'false');

      // fold all, then open one
      await page.click(tid('zones-collapse-all'));
      assert.equal(await visibleQuestions(), 0);
      await h.shot(page, `95-folded-${label}`);
      assert.deepEqual(await overflowing(page, width), []);
      await zone(0).locator(tid('zone-toggle')).click();
      assert.equal(await visibleQuestions(), 3);
      // edit inside the open zone; the header follows the name as you type
      await zone(0).locator(tid('zone-name-input')).fill('Beach front');
      assert.match(await zone(0).locator(tid('zone-toggle')).textContent(), /Zone 1: Beach front/);
      await zone(0).locator(tid('q-text')).first().fill('A changed question?');
      await page.click(tid('zones-expand-all'));
      assert.equal(await visibleQuestions(), 9);
      assert.equal(await zone(0).locator(tid('q-text')).first().inputValue(), 'A changed question?');

      // folded zones are still saved with everything in them
      await page.click(tid('zones-collapse-all'));
      await page.click(tid('save-content'));
      await page.waitForFunction(() => /Saved/.test(document.body.textContent));
      const saved = await (await api('GET', `/api/admin/events/${made.id}`)).json();
      assert.equal(saved.content.zones.length, 3);
      assert.equal(saved.content.zones[0].name, 'Beach front');
      assert.equal(saved.content.zones[0].questions[0].text, 'A changed question?');
      assert.equal(saved.content.zones.reduce((n, z) => n + z.questions.length, 0), 9);

      // one zone only: no folding controls at all
      await api('PUT', `/api/admin/events/${made.id}/content`, { instructions: '', zones: [zones[0]] });
      page.once('dialog', (d) => d.accept()); // leaving with nothing unsaved: no prompt expected, but never hang on one
      await page.reload();
      await page.waitForSelector(tid('editor-zone'));
      assert.equal(await page.locator(tid('zone-toggle')).count(), 0);
      assert.equal(await page.locator(tid('zones-collapse-all')).count(), 0);
      assert.equal(await visibleQuestions(), 3);
      assert.deepEqual(h.errors, []);
    } finally {
      await h.close();
    }
  });
}
