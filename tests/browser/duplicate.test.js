// Duplicate on My hunts: a quick form with the copy's name and address filled in; and the hunt limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

const overflowing = (page, width) => page.evaluate((w) => [...document.querySelectorAll('body *')]
  .filter((e) => !e.closest('.float, .table-responsive, [hidden]') && e.getClientRects().length && e.getBoundingClientRect().right > w + 1)
  .slice(0, 5).map((e) => `${e.tagName.toLowerCase()} ${e.textContent.trim().slice(0, 30)} -> ${Math.round(e.getBoundingClientRect().right)}px`), width);

async function organiser(h, name, open = h.desktop) {
  const { ctx, page } = await open(name);
  const api = (method, path, data) => ctx.request.fetch(h.url(path), { method, data, headers: { 'content-type': 'application/json' } });
  assert.equal((await api('POST', '/api/auth/register', { username: name, password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
  return { page, api };
}
async function makeHunt(api, h, name, slug) {
  const res = await api('POST', '/api/admin/events', { slug, name, timeZone: 'UTC' });
  assert.equal(res.status(), 200, `could not create ${slug}`);
  const made = await res.json();
  const day = new Date(h.now()).toISOString().slice(0, 10);
  await api('PUT', `/api/admin/events/${made.id}/config`, { name, timeZone: 'UTC', day, start: '09:00', end: '12:00', teamNames: true, joinCode: '', whatsappUrl: '' });
  await api('PUT', `/api/admin/events/${made.id}/content`, { instructions: '# Hello', zones: [{ id: 'z1', name: 'Beach', map: null, questions: [{ id: 'q1', type: 'whole-number', text: 'How many flags fly at the beach?', answers: ['3'], score: 5 }] }] });
  return made;
}
const card = (slug) => `${tid('event-card')}[data-slug="${slug}"]`;

test('Duplicate opens a quick form with v2- names, makes a real copy, and numbers further copies sensibly', async () => {
  const h = await launch();
  try {
    const { page, api } = await organiser(h, 'kai');
    await makeHunt(api, h, 'Summer Fun Hunt', 'summer-fun-hunt');
    await page.goto(h.url('/admin/'));
    await page.waitForSelector(card('summer-fun-hunt'));
    assert.match((await page.textContent('#create-form h2')).trim(), /^Create a new hunt/);
    assert.equal((await page.textContent(`${card('summer-fun-hunt')} ${tid('event-duplicate')}`)).trim(), 'Duplicate ›');
    assert.equal(await page.isVisible(`${card('summer-fun-hunt')} ${tid('dup-form')}`), false);

    await page.click(`${card('summer-fun-hunt')} ${tid('event-duplicate')}`);
    await page.waitForSelector(`${card('summer-fun-hunt')} ${tid('dup-form')}`);
    assert.equal(await page.inputValue(`${card('summer-fun-hunt')} ${tid('dup-name')}`), 'v2-Summer Fun Hunt');
    assert.equal(await page.inputValue(`${card('summer-fun-hunt')} ${tid('dup-slug')}`), 'v2-summer-fun-hunt');
    await h.shot(page, '90-duplicate-form');
    // while the form is open a click on the card does not whisk you away
    await page.locator(card('summer-fun-hunt')).click({ position: { x: 300, y: 12 } });
    assert.equal(page.url(), h.url('/admin/'));

    // accept the defaults: you land on the copy, which has the original's questions
    await page.click(`${card('summer-fun-hunt')} ${tid('dup-create')}`);
    await page.waitForSelector(tid('event-title'));
    assert.equal(await page.textContent(tid('event-title')), 'v2-Summer Fun Hunt');
    await page.click(tid('tab-questions'));
    await page.waitForSelector(tid('editor-question'));
    assert.match(await page.locator(tid('q-text')).first().inputValue(), /How many flags fly at the beach/);
    assert.equal(await page.locator(tid('zone-name-input')).first().inputValue(), 'Beach');

    // back on My hunts: two hunts; the next copy of the original is v3, and a copy of a copy is v3 too (not v2-v2)
    await page.goto(h.url('/admin/'));
    await page.waitForSelector(card('v2-summer-fun-hunt'));
    await page.click(`${card('summer-fun-hunt')} ${tid('event-duplicate')}`);
    assert.equal(await page.inputValue(`${card('summer-fun-hunt')} ${tid('dup-slug')}`), 'v3-summer-fun-hunt');
    await page.click(`${card('v2-summer-fun-hunt')} ${tid('event-duplicate')}`);
    assert.equal(await page.inputValue(`${card('v2-summer-fun-hunt')} ${tid('dup-name')}`), 'v3-Summer Fun Hunt');
    assert.equal(await page.inputValue(`${card('v2-summer-fun-hunt')} ${tid('dup-slug')}`), 'v3-summer-fun-hunt');

    // changing the name carries the address along (until the address is edited by hand)
    await page.fill(`${card('v2-summer-fun-hunt')} ${tid('dup-name')}`, 'Winter Hunt 2027');
    assert.equal(await page.inputValue(`${card('v2-summer-fun-hunt')} ${tid('dup-slug')}`), 'winter-hunt-2027');
    await page.fill(`${card('v2-summer-fun-hunt')} ${tid('dup-slug')}`, 'my-own-address');
    await page.fill(`${card('v2-summer-fun-hunt')} ${tid('dup-name')}`, 'Winter Hunt 2028');
    assert.equal(await page.inputValue(`${card('v2-summer-fun-hunt')} ${tid('dup-slug')}`), 'my-own-address');
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test('Duplicate says so when the address is taken, can be cancelled, and nothing is made by mistake', async () => {
  const h = await launch();
  try {
    const { page, api } = await organiser(h, 'lena');
    await makeHunt(api, h, 'Alpha', 'alpha');
    await makeHunt(api, h, 'Beta', 'beta');
    await page.goto(h.url('/admin/'));
    await page.waitForSelector(card('alpha'));
    await page.click(`${card('alpha')} ${tid('event-duplicate')}`);
    await page.fill(`${card('alpha')} ${tid('dup-slug')}`, 'beta'); // already one of hers
    await page.click(`${card('alpha')} ${tid('dup-create')}`);
    await page.waitForSelector(`${card('alpha')} ${tid('dup-error')}:not([hidden])`);
    assert.match(await page.textContent(`${card('alpha')} ${tid('dup-error')}`), /already used by another hunt/);
    assert.equal(page.url(), h.url('/admin/'));
    assert.equal(await page.isEnabled(`${card('alpha')} ${tid('dup-create')}`), true); // she can fix it and try again
    await page.fill(`${card('alpha')} ${tid('dup-slug')}`, 'x'); // too short
    await page.click(`${card('alpha')} ${tid('dup-create')}`);
    await page.waitForSelector(`${card('alpha')} ${tid('dup-error')}:not([hidden])`);
    assert.match(await page.textContent(`${card('alpha')} ${tid('dup-error')}`), /3 to 40 lower case letters/);

    await page.click(`${card('alpha')} ${tid('dup-cancel')}`);
    assert.equal(await page.isVisible(`${card('alpha')} ${tid('dup-form')}`), false);
    assert.equal(await page.locator(tid('event-card')).count(), 2); // nothing was created
    // the card works as before once the form is closed
    await page.locator(card('alpha')).click({ position: { x: 300, y: 12 } });
    await page.waitForSelector(tid('event-title'));
    assert.deepEqual(h.errors.filter((e) => !/status of (400|409)/.test(e)), []);
  } finally {
    await h.close();
  }
});

test('at the hunt limit the forms give way to a plain note, and the Overview tab no longer offers a template', async () => {
  const h = await launch();
  try {
    const { page, api } = await organiser(h, 'max');
    const hunts = [];
    for (const n of ['one', 'two', 'three', 'four']) hunts.push(await makeHunt(api, h, `Hunt ${n}`, `hunt-${n}`)); // the default limit is 4
    await page.goto(h.url('/admin/'));
    await page.waitForSelector(card('hunt-one'));
    assert.equal(await page.locator(tid('event-duplicate')).count(), 0);
    assert.equal(await page.isVisible('#create-form'), false);
    assert.match(await page.textContent(tid('limit-note')), /reached your limit of 4 hunts.*ask the site admin/);
    assert.equal(await page.locator(tid('event-manage')).count(), 4); // Manage and Test are always there
    assert.equal(await page.locator(tid('event-test')).count(), 4);

    await page.goto(h.url(`/admin/event/?id=${hunts[0].id}#overview`));
    await page.waitForSelector(tid('qr'));
    assert.equal(await page.locator('text=template').count(), 0);
    assert.equal(await page.locator(tid('copy-hunt')).count(), 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test('the Duplicate form fits a 360 px phone', async () => {
  const h = await launch();
  try {
    const { page, api } = await organiser(h, 'nina', (label) => h.phone(label, 360));
    await makeHunt(api, h, 'A rather long hunt name for a small phone screen', 'a-rather-long-hunt-name-for-a-phone');
    await page.goto(h.url('/admin/'));
    await page.waitForSelector(card('a-rather-long-hunt-name-for-a-phone'));
    assert.deepEqual(await overflowing(page, 360), [], 'the card with three buttons');
    await page.click(`${tid('event-duplicate')}`);
    await page.waitForSelector(tid('dup-form'));
    assert.deepEqual(await overflowing(page, 360), [], 'the open form');
    await h.shot(page, '91-duplicate-phone');
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
