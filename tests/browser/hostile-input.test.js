// Every piece of text a person controls (hunt, zone, question and instructions text, team names, organiser name) is filled with
// markup and script, then every page that shows it is opened in a real browser: none of it may run, and it must appear as plain text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, tid } from './helpers.js';

const PWN = '<img src=x onerror="window.__pwned=1">';
const TEAM = '<img src=x onerror=__pwned=1>'; // 30 characters at most

test('hostile text in names, questions and instructions is shown as text and never runs', async () => {
  const h = await launch();
  try {
    const org = await h.desktop('org');
    const api = (method, path, data) => org.ctx.request.fetch(h.url(path), { method, data, headers: { 'content-type': 'application/json' } });
    assert.equal((await api('POST', '/api/auth/register', { username: 'mallory', password: 'purple-giraffe-lunch-42' })).status(), 200);
    const created = await (await api('POST', '/api/admin/events', { slug: 'evil-hunt', name: PWN, timeZone: 'UTC' })).json();
    const day = new Date(h.now()).toISOString().slice(0, 10);
    await api('PUT', `/api/admin/events/${created.id}/config`, { name: PWN, timeZone: 'UTC', day, start: '00:00', end: '23:59', teamNames: true, joinCode: '', whatsappUrl: '' });
    const content = {
      instructions: `# ${PWN}\n\n- ${PWN}\n- <script>window.__pwned=1</script>\n- [click](javascript:window.__pwned=1)\n\n**${PWN}**`,
      zones: [{ id: 'z1', name: PWN, map: null, questions: [
        { id: 'q1', type: 'string', text: PWN, answers: [PWN], score: 5 },
        { id: 'q2', type: 'photo', text: `${PWN} WhatsApp`, answers: [], score: 5 },
      ] }],
    };
    assert.equal((await api('PUT', `/api/admin/events/${created.id}/content`, content)).status(), 200);

    // a team with a hostile name plays; a viewer watches
    const p = await h.phone('team');
    const player = p.page;
    await player.goto(h.url('/e/evil-hunt/'));
    await player.fill(tid('team-name'), TEAM);
    await player.click(tid('join-button'));
    await player.waitForSelector(tid('zone-tile'));
    await player.click('summary');
    await player.click(tid('zone-tile'));
    await player.waitForSelector(tid('question'));
    await player.fill(`${tid('question')} ${tid('answer-input')}`, PWN);
    await player.click(`${tid('question')} ${tid('answer-submit')}`);
    await player.waitForSelector(`${tid('question')}[data-state="done"]`);
    assert.match(await player.textContent(tid('panel-name')), /<img src=x/); // shown literally
    assert.match(await player.textContent(tid('team-label')), /<img src=x/);
    assert.equal(await player.evaluate(() => window.__pwned), undefined);
    assert.equal(await player.locator('img[src="x"]').count(), 0); // no element was created from the text

    const v = await h.phone('viewer');
    await v.page.goto(h.url('/e/evil-hunt/'));
    await v.page.waitForSelector(tid('score-row'));
    assert.match(await v.page.textContent(tid('score-row')), /<img src=x/);
    assert.equal(await v.page.evaluate(() => window.__pwned), undefined);
    assert.equal(await v.page.locator('img[src="x"]').count(), 0);

    // the organiser's own pages show everything too
    const a = org.page;
    for (const tab of ['questions', 'teams', 'scoring', 'overview', 'settings']) {
      await a.goto(h.url(`/admin/event/?id=${created.id}#${tab}`));
      await a.waitForSelector(tid(`tab-${tab}`));
      await a.waitForTimeout(400);
      assert.equal(await a.evaluate(() => window.__pwned), undefined, tab);
      assert.equal(await a.locator('img[src="x"]').count(), 0, tab);
    }
    await a.goto(h.url('/admin/'));
    await a.waitForSelector(tid('event-card'));
    assert.equal(await a.evaluate(() => window.__pwned), undefined);
    assert.equal(await a.locator('img[src="x"]').count(), 0);
    assert.match(await a.textContent(tid('event-card')), /<img src=x/);

    // the content security policy would have blocked inline handlers anyway: nothing was reported blocked (the text never became markup)
    assert.deepEqual(h.errors.filter((e) => /Content Security Policy/i.test(e)), []);
  } finally {
    await h.close();
  }
});
