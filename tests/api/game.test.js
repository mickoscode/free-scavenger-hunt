// A whole game, the way people play it: an event admin builds an event, teams join and answer, the admin scores
// photos and publishes, teams read their results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client, createEvent, createWorld, GAME_END, GAME_START, register, sampleContent } from './helpers.js';

async function setup(opts) {
  const w = createWorld();
  const admin = await register(w, 'ann');
  const ev = await createEvent(admin, opts);
  return { w, admin, ev, base: `/api/events/${ev.slug}`, adminBase: `/api/admin/events/${ev.id}` };
}
const join = async (w, base, name, extra = {}) => {
  const c = client(w, `9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.1`);
  const r = await c.post(`${base}/join`, { name, ...extra });
  return { c, r };
};

test('phases follow the clock exactly: unconfigured, pre, active (inclusive), post', async () => {
  const w = createWorld();
  const admin = await register(w, 'ann');
  const created = await admin.post('/api/admin/events', { slug: 'phase-test', name: 'P' });
  const base = '/api/events/phase-test';
  assert.equal((await client(w).get(base)).body.status, 'unconfigured'); // no questions yet
  await createEvent(admin, { slug: 'phased' });
  const p = '/api/events/phased';
  w.set(GAME_START - 1);
  assert.equal((await client(w).get(p)).body.status, 'pre');
  w.set(GAME_START);
  assert.equal((await client(w).get(p)).body.status, 'active');
  w.set(GAME_END);
  assert.equal((await client(w).get(p)).body.status, 'active');
  w.set(GAME_END + 1);
  assert.equal((await client(w).get(p)).body.status, 'post');
  assert.ok(created.body.id);
});

test('joining: allowed before and during the game, refused after; names are checked', async () => {
  const { w, base } = await setup();
  w.set(GAME_START - 60_000);
  assert.equal((await join(w, base, 'Sea Dogs')).r.status, 200);
  assert.equal((await join(w, base, 'sea dogs')).r.body.error, 'name-taken');
  assert.equal((await join(w, base, '')).r.body.error, 'invalid-name');
  assert.equal((await join(w, base, 'x'.repeat(31))).r.body.reason, 'too-long');
  assert.equal((await join(w, base, 'F u c k')).r.body.reason, 'not-allowed');
  w.set(GAME_START + 1000);
  assert.equal((await join(w, base, 'Late Gulls')).r.status, 200);
  w.set(GAME_END + 1);
  assert.equal((await join(w, base, 'Too Late')).r.body.error, 'not-joinable');
});

test('team numbers start at 1 and the session survives (same cookie = same team)', async () => {
  const { w, base } = await setup();
  w.set(GAME_START - 1000);
  const a = await join(w, base, 'Alpha');
  const b = await join(w, base, 'Beta');
  assert.equal(a.r.body.number, 1);
  assert.equal(b.r.body.number, 2);
  assert.equal((await a.c.get(`${base}/me`)).body.number, 1);
  assert.equal((await client(w).get(`${base}/me`)).status, 401);
  assert.equal((await a.c.get(`${base}/session`)).body.joined, true);
});

test('the join code is required when set, never public, and a wrong one creates nothing', async () => {
  const { w, base, admin, ev } = await setup({ config: { joinCode: 'surf-24a' } });
  w.set(GAME_START - 1000);
  const info = await client(w).get(base);
  assert.equal(info.body.joinCodeRequired, true);
  assert.equal(JSON.stringify(info.body).includes('SURF24A'), false);
  assert.equal(JSON.stringify((await client(w).get(`${base}/scoreboard`)).body).includes('SURF24A'), false);
  assert.equal((await join(w, base, 'Alpha', { code: 'nope' })).r.body.error, 'wrong-code');
  assert.equal((await join(w, base, 'Alpha')).r.body.error, 'wrong-code');
  assert.equal((await client(w).get(`${base}/scoreboard`)).body.teams.length, 0);
  assert.equal((await join(w, base, 'Alpha', { code: 'SURF24A' })).r.status, 200);
  assert.equal((await join(w, base, 'Beta', { code: 'Surf 24a' })).r.status, 200);
  assert.equal((await admin.get(`/api/admin/events/${ev.id}`)).body.config.joinCode, 'SURF24A'); // admin sees it
});

test('with team names off, teams are "Team <n>" everywhere and the name is not asked', async () => {
  const { w, base } = await setup({ config: { teamNames: false } });
  w.set(GAME_START - 1000);
  const a = await join(w, base, 'ignored name');
  assert.equal(a.r.status, 200);
  await join(w, base, undefined);
  const sb = (await client(w).get(`${base}/scoreboard`)).body;
  assert.deepEqual(sb.teams.map((t) => t.name), ['Team 1', 'Team 2']);
  assert.equal((await a.c.get(`${base}/me`)).body.name, 'Team 1');
});

test('questions are only sent while the game is active, and never with answers', async () => {
  const { w, base } = await setup();
  w.set(GAME_START - 1000);
  const t = await join(w, base, 'Alpha');
  const pre = (await t.c.get(`${base}/play`)).body;
  assert.equal(pre.zones.length, 0);
  assert.match(pre.instructions, /How to play/);
  w.set(GAME_START + 1000);
  const play = (await t.c.get(`${base}/play`)).body;
  assert.equal(play.zones.length, 2);
  assert.equal(play.zones[0].questions.length, 3);
  assert.equal(JSON.stringify(play).includes('crimson'), false);
  assert.equal(JSON.stringify(play).includes('"answers"'), false);
  assert.equal((await client(w).get(`${base}/play`)).status, 401);
});

test('answering: typo tolerance, once only, wrong format keeps the chance, nothing is revealed', async () => {
  const { w, base } = await setup();
  w.set(GAME_START - 1000);
  const t = await join(w, base, 'Alpha');
  assert.equal((await t.c.post(`${base}/answer`, { zone: 'z1', question: 'q1', answer: 'red' })).body.error, 'not-playing');
  w.set(GAME_START + 1000);
  assert.equal((await t.c.post(`${base}/answer`, { zone: 'z1', question: 'q2', answer: 'abc' })).body.error, 'invalid-answer');
  assert.equal((await t.c.post(`${base}/answer`, { zone: 'z1', question: 'q1', answer: '  RDE ' })).status, 200); // 1 typo ok? "red" has 3 chars -> 0 typos
  const me = (await t.c.get(`${base}/me`)).body;
  assert.deepEqual(me.done.answers, ['z1#q1']);
  assert.equal((await t.c.post(`${base}/answer`, { zone: 'z1', question: 'q1', answer: 'red' })).body.error, 'already-submitted');
  assert.equal((await t.c.post(`${base}/answer`, { zone: 'z1', question: 'q3', answer: 'x' })).body.error, 'no-question'); // photo via answer
  assert.equal((await t.c.post(`${base}/answer`, { zone: 'zx', question: 'q1', answer: 'x' })).body.error, 'no-question');
  const sb = (await client(w).get(`${base}/scoreboard`)).body;
  assert.equal(sb.teams[0].score, 0); // "rde" is wrong for a 3 letter answer
  assert.equal(JSON.stringify(me).includes('rde'), false);
});

test('a full game: scoring, ranks with ties, photo re-scoring, publishing and results', async () => {
  const { w, base, admin, adminBase } = await setup();
  w.set(GAME_START - 1000);
  const alpha = await join(w, base, 'Alpha');
  const beta = await join(w, base, 'Beta');
  const gamma = await join(w, base, 'Gamma');
  w.set(GAME_START + 1000);

  // Alpha: q1 right (10), q2 right (20), photo sent. Beta: q1 right (10), z2 right (5) = 15. Gamma: nothing.
  for (const [zone, question, answer] of [['z1', 'q1', 'Red'], ['z1', 'q2', '2.50']]) assert.equal((await alpha.c.post(`${base}/answer`, { zone, question, answer })).status, 200);
  assert.equal((await alpha.c.post(`${base}/photo`, { zone: 'z1', question: 'q3' })).status, 200);
  assert.equal((await alpha.c.post(`${base}/photo`, { zone: 'z1', question: 'q3' })).body.error, 'already-submitted');
  await beta.c.post(`${base}/answer`, { zone: 'z1', question: 'q1', answer: 'crimson' });
  await beta.c.post(`${base}/answer`, { zone: 'z2', question: 'q1', answer: '6' });
  await gamma.c.post(`${base}/answer`, { zone: 'z2', question: 'q1', answer: '7' }); // wrong, still counts as done

  let sb = (await client(w).get(`${base}/scoreboard`)).body;
  assert.deepEqual(sb.teams.map((t) => [t.rank, t.name, t.done, t.score]), [[1, 'Alpha', 3, 30], [2, 'Beta', 2, 15], [3, 'Gamma', 1, 0]]);
  assert.equal(sb.questionTotal, 4);
  assert.equal(sb.teams[0].number, undefined); // numbers are only public once results are published

  // Admin scores the photo; re-scoring corrects rather than adds.
  let photos = (await admin.get(`${adminBase}/photos`)).body;
  assert.equal(photos.items.length, 1);
  assert.equal(photos.items[0].teamName, 'Alpha');
  assert.equal(photos.items[0].decision, null);
  const score = (decision) => admin.post(`${adminBase}/photos/score`, { team: 1, zone: 'z1', question: 'q3', decision });
  assert.equal((await score('full')).status, 200);
  assert.equal((await score('half')).status, 200);
  assert.equal((await score('half')).status, 200);
  sb = (await client(w).get(`${base}/scoreboard`)).body;
  assert.equal(sb.teams[0].score, 45); // 10 + 20 + 15
  assert.equal((await score('bogus')).body.error, 'invalid-decision');
  assert.equal((await admin.post(`${adminBase}/photos/score`, { team: 2, zone: 'z1', question: 'q3', decision: 'full' })).body.error, 'no-photo');

  // Before the game ends nothing can be published and nobody gets results.
  assert.equal((await admin.post(`${adminBase}/publish`, { confirm: true })).body.error, 'game-not-over');
  assert.equal((await alpha.c.get(`${base}/results`)).body.published, false);
  assert.equal((await client(w).get(`${base}/results/team/1`)).body.published, false);

  w.set(GAME_END + 1);
  assert.equal((await alpha.c.post(`${base}/answer`, { zone: 'z2', question: 'q1', answer: '6' })).body.error, 'not-playing');
  assert.equal((await score('zero')).status, 200); // scoring continues after the game
  assert.equal((await score('full')).status, 200);
  assert.equal((await admin.post(`${adminBase}/publish`, {})).body.error, 'confirmation-required');
  assert.equal((await admin.post(`${adminBase}/publish`, { confirm: true })).body.resultsPublished, true);
  assert.equal((await score('half')).body.error, 'results-published');

  sb = (await client(w).get(`${base}/scoreboard`)).body;
  assert.equal(sb.resultsPublished, true);
  assert.equal(sb.teams[0].number, 1);

  const own = (await alpha.c.get(`${base}/results`)).body;
  assert.equal(own.published, true);
  assert.equal(own.results.place, 1);
  assert.equal(own.results.teamCount, 3);
  assert.equal(own.results.total, 60);
  const z1 = own.results.zones[0];
  assert.equal(z1.questions[0].yourAnswer, 'Red');
  assert.deepEqual(z1.questions[0].officialAnswers, ['red', 'crimson']);
  assert.equal(z1.photos[0].decision, 'full');
  assert.equal(own.results.zones[1].questions[0].answered, false);

  // Anybody can see a summary of any team, without a single answer.
  const summary = (await client(w).get(`${base}/results/team/2`)).body;
  assert.equal(summary.results.place, 2);
  const text = JSON.stringify(summary);
  for (const secret of ['crimson', 'yourAnswer', 'officialAnswers']) assert.equal(text.includes(secret), false, secret);
  assert.equal((await client(w).get(`${base}/results/team/99`)).body.error, 'no-team');

  // Return to provisional.
  await admin.post(`${adminBase}/unpublish`);
  assert.equal((await alpha.c.get(`${base}/results`)).body.published, false);
});

test('equal scores share a place (1, 1, 3)', async () => {
  const { w, base } = await setup();
  w.set(GAME_START - 1000);
  const [a, b, c] = [await join(w, base, 'A'), await join(w, base, 'B'), await join(w, base, 'C')];
  w.set(GAME_START + 1000);
  await a.c.post(`${base}/answer`, { zone: 'z2', question: 'q1', answer: '6' });
  await b.c.post(`${base}/answer`, { zone: 'z2', question: 'q1', answer: '6' });
  await c.c.post(`${base}/answer`, { zone: 'z2', question: 'q1', answer: '1' });
  const sb = (await client(w).get(`${base}/scoreboard`)).body;
  assert.deepEqual(sb.teams.map((t) => [t.rank, t.name]), [[1, 'A'], [1, 'B'], [3, 'C']]);
});

test('admin: remove a team, view a team, delete player data restarts numbering', async () => {
  const { w, base, admin, adminBase } = await setup();
  w.set(GAME_START - 1000);
  const a = await join(w, base, 'A');
  await join(w, base, 'B');
  assert.equal((await admin.get(`${adminBase}/teams/1/results`)).body.name, 'A');
  assert.equal((await admin.del(`${adminBase}/teams/1`)).status, 200);
  assert.equal((await a.c.get(`${base}/me`)).status, 401); // its session no longer works
  assert.equal((await admin.get(`${adminBase}/teams`)).body.teams.length, 1);
  assert.equal((await admin.del(`${adminBase}/player-data/delete`)).body.error, 'method-not-allowed');
  assert.equal((await admin.post(`${adminBase}/player-data/delete`, {})).body.error, 'confirmation-required');
  assert.equal((await admin.post(`${adminBase}/player-data/delete`, { confirm: 'delete' })).status, 200);
  assert.equal((await join(w, base, 'A')).r.body.number, 1);
});

test('rules while the game is active: configuration and player data are locked unless overridden; content is locked once teams exist', async () => {
  const { w, base, admin, adminBase } = await setup();
  w.set(GAME_START - 1000);
  await join(w, base, 'A');
  assert.equal((await admin.put(`${adminBase}/content`, sampleContent())).body.error, 'players-exist');
  w.set(GAME_START + 1000);
  const cfg = { name: 'New name', timeZone: 'Australia/Perth', day: '2026-11-14', start: '09:00', end: '13:00', teamNames: true };
  assert.equal((await admin.put(`${adminBase}/config`, cfg)).body.error, 'game-active');
  assert.equal((await admin.put(`${adminBase}/config`, { ...cfg, override: 'override' })).status, 200);
  assert.equal((await admin.post(`${adminBase}/player-data/delete`, { confirm: 'delete' })).body.error, 'game-active');
  assert.equal((await admin.post(`${adminBase}/player-data/delete`, { confirm: 'delete', override: 'override' })).status, 200);
  assert.equal((await admin.get(`${adminBase}/teams`)).body.teams.length, 0);
  assert.equal((await client(w).get(base)).body.name, 'New name');
});

test('configuration is validated, and changing it returns published results to provisional', async () => {
  const { w, admin, adminBase, base } = await setup();
  const ok = { name: 'Beach Hunt', timeZone: 'Australia/Perth', day: '2026-11-14', start: '09:00', end: '12:00', teamNames: true };
  for (const [bad, field] of [[{ day: '2026-02-30' }, 'day'], [{ start: '9am' }, 'start'], [{ end: '08:00' }, 'end-before-start'], [{ timeZone: 'Mars/Base' }, 'timeZone'], [{ whatsappUrl: 'https://evil.example/x' }, 'whatsappUrl'], [{ joinCode: 'ab' }, 'joinCode'], [{ name: ' ' }, 'name']]) {
    const r = await admin.put(`${adminBase}/config`, { ...ok, ...bad });
    assert.equal(r.status, 400, field);
    assert.ok(r.body.problems.includes(field), field);
  }
  // publish, then save identical settings (stays published), then different settings (back to provisional)
  w.set(GAME_END + 1);
  await admin.post(`${adminBase}/publish`, { confirm: true });
  await admin.put(`${adminBase}/config`, ok);
  assert.equal((await client(w).get(base)).body.resultsPublished, true);
  await admin.put(`${adminBase}/config`, { ...ok, name: 'Renamed' });
  assert.equal((await client(w).get(base)).body.resultsPublished, false);
});

test('the WhatsApp link is only given to a team, and only accepted in its real form', async () => {
  const { w, base } = await setup({ config: { whatsappUrl: 'https://chat.whatsapp.com/AbCdEf1234567?mode=xyz' } });
  w.set(GAME_START - 1000);
  const pub = JSON.stringify((await client(w).get(base)).body) + JSON.stringify((await client(w).get(`${base}/scoreboard`)).body);
  assert.equal(pub.includes('whatsapp'), false);
  const t = await join(w, base, 'Alpha');
  assert.equal((await t.c.get(`${base}/me`)).body.whatsappUrl, 'https://chat.whatsapp.com/AbCdEf1234567');
});

test('public responses are cacheable for a moment; anything with a session is not', async () => {
  const { w, base } = await setup();
  w.set(GAME_START - 1000);
  const t = await join(w, base, 'Alpha');
  assert.match((await client(w).get(base)).headers['cache-control'], /s-maxage=3/);
  assert.match((await client(w).get(`${base}/scoreboard`)).headers['cache-control'], /s-maxage=3/);
  assert.equal((await t.c.get(`${base}/me`)).headers['cache-control'], 'no-store');
  assert.equal((await t.c.get(`${base}/results`)).headers['cache-control'], 'no-store');
  assert.equal((await client(w).get('/api/events/missing')).body.error, 'no-event');
});

test('the game information is the same at /info (what the pages use and CloudFront caches) and at the bare address, and carries nothing personal', async () => {
  const { w, base } = await setup({ config: { joinCode: 'surf-24a', whatsappUrl: 'https://chat.whatsapp.com/AbCdEf1234567' } });
  w.set(GAME_START - 1000);
  const a = await client(w).get(`${base}/info`);
  const b = await client(w).get(base);
  assert.deepEqual(a.body, b.body);
  assert.match(a.headers['cache-control'], /s-maxage=3/);
  const text = JSON.stringify(a.body);
  for (const secret of ['SURF24A', 'whatsapp', 'secret', 'owner']) assert.equal(text.toLowerCase().includes(secret.toLowerCase()), false, secret);
  // only these two paths are ever cached by CloudFront; nothing else in the API may claim to be cacheable
  const cacheable = [];
  for (const path of [`${base}/me`, `${base}/play`, `${base}/results`, '/api/auth/me', '/api/admin/events']) {
    if (/s-maxage/.test((await client(w).get(path)).headers['cache-control'])) cacheable.push(path);
  }
  assert.deepEqual(cacheable, []);
});
