// Data tab: export a hunt (a json file plus its pictures), import those files into another hunt; errors are simple; locked once teams join.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launch, tid } from './helpers.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function organiser(h, name, open = h.desktop) {
  const { ctx, page } = await open(name);
  const api = (m, p, d) => ctx.request.fetch(h.url(p), { method: m, data: d, headers: { 'content-type': 'application/json' } });
  assert.equal((await api('POST', '/api/auth/register', { username: name, password: 'purple-giraffe-lunch-42', timeZone: 'UTC' })).status(), 200);
  return { ctx, page, api };
}
const blank = async (api, slug, name) => (await (await api('POST', '/api/admin/events', { slug, name, timeZone: 'UTC' })).json());

test('export, then import into a different hunt: questions, instructions, settings and the picture all arrive', async () => {
  const h = await launch();
  try {
    const { page, api } = await organiser(h, 'dana');
    const a = await blank(api, 'source-hunt', 'Source Hunt');
    const map = await (await api('POST', `/api/admin/events/${a.id}/zones/z1/map`, { thumb: PNG, full: PNG })).json();
    assert.ok(map.map?.full, 'picture uploaded');
    const zones = [
      { id: 'z1', name: 'Beach', map: map.map, questions: [{ id: 'q1', type: 'whole-number', text: 'How many flags?', answers: ['3'], score: 5 }, { id: 'q2', type: 'photo', text: 'A gull', answers: [], score: 20 }] },
      { id: 'z2', name: 'Park', map: null, questions: [{ id: 'q1', type: 'string', text: 'Name the cafe', answers: ['Joes'], score: 10 }] },
    ];
    assert.equal((await api('PUT', `/api/admin/events/${a.id}/content`, { instructions: '# Rules\n- Be kind', zones })).status(), 200);
    await api('PUT', `/api/admin/events/${a.id}/config`, { name: 'Source Hunt', timeZone: 'UTC', day: '2027-03-04', start: '10:00', end: '11:30', teamNames: false, joinCode: 'KEEP12', whatsappUrl: '' });

    // ---- export: two downloads (the json and the one picture)
    await page.goto(h.url(`/admin/event/?id=${a.id}#data`));
    await page.waitForSelector(tid('export-download'));
    const downloads = [];
    page.on('download', (d) => downloads.push(d));
    await page.click(tid('export-download'));
    await page.waitForSelector(`${tid('export-note')}:not([hidden])`);
    await page.waitForFunction(() => /Saved/.test(document.querySelector('[data-testid="export-note"]').textContent));
    assert.deepEqual(downloads.map((d) => d.suggestedFilename()).sort(), ['source-hunt.json', 'zone1-map.webp'.replace('webp', 'png')].sort());
    const files = [];
    for (const d of downloads) files.push({ name: d.suggestedFilename(), mimeType: d.suggestedFilename().endsWith('.json') ? 'application/json' : 'image/png', buffer: await readFile(await d.path()) });
    const exported = JSON.parse(files.find((f) => f.name.endsWith('.json')).buffer.toString());
    assert.equal(exported.zones[0].map, './zone1-map.png');
    assert.doesNotMatch(JSON.stringify(exported), /KEEP12/);

    // ---- import into a fresh hunt
    const b = await blank(api, 'target-hunt', 'Target Hunt');
    await page.goto(h.url(`/admin/event/?id=${b.id}#data`));
    await page.waitForSelector(tid('import-files'));
    await page.setInputFiles(tid('import-files'), files);
    await page.click(tid('import-check'));
    await page.waitForSelector(tid('import-summary'));
    assert.match(await page.textContent(tid('import-summary')), /2 zones and 3 questions, and 1 of 1 picture/);
    assert.equal(await page.locator(tid('import-missing')).count(), 0);
    page.once('dialog', (d) => d.accept());
    await page.click(tid('import-go'));
    await page.waitForSelector(tid('import-done'));
    await h.shot(page, '96-data-imported');

    const got = await (await api('GET', `/api/admin/events/${b.id}`)).json();
    assert.equal(got.config.name, 'Source Hunt');
    assert.equal(got.config.day, '2027-03-04');
    assert.equal(got.config.teamNames, false);
    assert.equal(got.config.joinCode, ''); // the target's own access settings are untouched (the join code is not in the file)
    assert.equal(got.content.instructions, '# Rules\n- Be kind');
    assert.deepEqual(got.content.zones.map((z) => [z.name, z.questions.length]), [['Beach', 2], ['Park', 1]]);
    assert.deepEqual(got.content.zones[0].questions.map((q) => [q.type, q.answers]), [['whole-number', ['3']], ['photo', []]]);
    assert.ok(got.content.zones[0].map?.full && got.content.zones[1].map === null);
    assert.equal(got.teamCount, 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test('Data tab: simple errors, a missing picture is reported, paste works, and nothing changes when the file is refused', async () => {
  const h = await launch();
  try {
    const { page, api } = await organiser(h, 'eli');
    const a = await blank(api, 'hunt-a', 'Hunt A');
    await api('PUT', `/api/admin/events/${a.id}/content`, { instructions: 'keep me', zones: [{ id: 'z1', name: 'Old zone', map: null, questions: [{ id: 'q1', type: 'string', text: 'Old?', answers: ['old'], score: 1 }] }] });
    await page.goto(h.url(`/admin/event/?id=${a.id}#data`));
    await page.waitForSelector(tid('import-text'));
    const check = async (text) => { await page.fill(tid('import-text'), text); await page.click(tid('import-check')); await page.waitForSelector(`${tid('import-result')}:not([hidden])`); return page.textContent(tid('import-result')); };

    assert.match(await check(''), /Choose a hunt file, or paste/);
    assert.match(await check('{ nope'), /not valid JSON/);
    assert.match(await check('{"format":"other"}'), /does not look like a hunt file from this site/);
    // passes the quick check but the site's own rules refuse it (a whole number answer that is not a number): nothing is replaced
    const bad = JSON.stringify({ format: 'free-scavenger-hunt', version: 1, zones: [{ name: 'New', questions: [{ type: 'whole-number', text: 'How many?', answers: ['lots'] }] }] });
    assert.match(await check(bad), /Found 1 zone and 1 question/);
    page.once('dialog', (d) => d.accept());
    await page.click(tid('import-go'));
    await page.waitForSelector(`${tid('import-result')}.alert-danger`);
    assert.match(await page.textContent(tid('import-result')), /Zone 1, question 1 needs a valid answer/);
    const same = await (await api('GET', `/api/admin/events/${a.id}`)).json();
    assert.equal(same.content.zones[0].name, 'Old zone');
    assert.equal(same.content.instructions, 'keep me');

    // a picture that was not chosen is reported but does not stop the import; declining the confirmation changes nothing
    const ok = JSON.stringify({ format: 'free-scavenger-hunt', version: 1, zones: [{ name: 'Fresh', map: './zone1-map.png', questions: [{ type: 'string', text: 'Fresh?', answers: ['yes'] }] }] });
    assert.match(await check(ok), /Found 1 zone and 1 question, and 0 of 1 picture/);
    assert.match(await page.textContent(tid('import-missing')), /Zone 1: no picture file named zone1-map.png/);
    page.once('dialog', (d) => d.dismiss());
    await page.click(tid('import-go'));
    assert.equal((await (await api('GET', `/api/admin/events/${a.id}`)).json()).content.zones[0].name, 'Old zone');
    page.once('dialog', (d) => d.accept());
    await page.click(tid('import-go'));
    await page.waitForSelector(tid('import-done'));
    assert.equal((await (await api('GET', `/api/admin/events/${a.id}`)).json()).content.zones[0].name, 'Fresh');
    assert.deepEqual(h.errors.filter((e) => !/status of (400|409)/.test(e)), []);
  } finally {
    await h.close();
  }
});

test('My hunts has a Data button after Clone, and the Data tab explains itself with ? toggles; import is locked once teams join', async () => {
  const h = await launch();
  try {
    const { page, api } = await organiser(h, 'fay', (l) => h.phone(l, 360));
    const a = await blank(api, 'hunt-f', 'Hunt F');
    await page.goto(h.url('/admin/'));
    await page.waitForSelector(tid('event-data'));
    const labels = (await page.locator(`${tid('event-card')} .btn:visible`).allTextContents()).map((t) => t.trim());
    assert.deepEqual(labels, ['Manage ›', 'Play ›', 'Clone ›', 'Data ›']);
    const right = await page.$eval(tid('event-data'), (e) => e.getBoundingClientRect().right);
    assert.ok(right <= 360);
    await page.click(tid('event-data'));
    await page.waitForSelector(tid('export-download'));
    assert.match(page.url(), /#data$/);
    assert.equal(await page.locator('.help-toggle').count(), 2);
    assert.equal(await page.locator('section p:visible', { hasText: 'Why: keep a copy' }).count(), 0); // hidden until the ? is pressed
    await page.locator('.help-toggle').first().click();
    assert.equal(await page.locator('section p:visible', { hasText: 'Why: keep a copy' }).count(), 1);
    assert.equal(await page.isDisabled(tid('import-check')), false);
    await h.shot(page, '97-data-phone');

    // players have joined: import is locked, export still there
    const { ctx: pc } = await h.phone('player', 360);
    const slug = (await (await api('GET', `/api/admin/events/${a.id}`)).json());
    await api('PUT', `/api/admin/events/${a.id}/content`, { instructions: '', zones: [{ id: 'z1', name: 'Z', map: null, questions: [{ id: 'q1', type: 'string', text: 'Q?', answers: ['a'], score: 1 }] }] });
    const day = new Date(h.now()).toISOString().slice(0, 10);
    await api('PUT', `/api/admin/events/${a.id}/config`, { name: 'Hunt F', timeZone: 'UTC', day, start: '00:00', end: '23:59', teamNames: true, joinCode: '', whatsappUrl: '' });
    const joined = await pc.request.fetch(h.url(`/api/events/${slug.org}/hunt-f/join`), { method: 'POST', data: { name: 'Lions' }, headers: { 'content-type': 'application/json' } });
    assert.equal(joined.status(), 200, 'a team joined');
    await page.reload();
    await page.waitForSelector(tid('import-locked'));
    assert.equal(await page.isDisabled(tid('import-check')), true);
    assert.equal(await page.isEnabled(tid('export-download')), true);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
