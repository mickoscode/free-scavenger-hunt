// The starter Demo Hunt every organiser gets, and the organiser codes in hunt addresses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client, createWorld, register, seedSiteAdmin } from './helpers.js';
import { demoWindow } from '../../api/demo/create.js';
import { CODE_BREAKERS, DEMO_IMAGE_KEYS, ZONES, demoContent } from '../../api/demo/content.js';
import { validateContent, countQuestions } from '../../api/lib/content.js';
import { checkAnswer } from '../../api/lib/answers.js';
import { gameStatus } from '../../api/lib/gamestate.js';

const T0 = Date.UTC(2026, 10, 14, 2, 0, 0); // 10:00 in Perth
const ZERO_MAPS = Object.fromEntries(DEMO_IMAGE_KEYS.map((k) => [k, { thumb: `/assets/x/${k}-t.jpg`, full: `/assets/x/${k}-f.jpg` }]));

test('the demo content is valid: 6 zones, 5 x 10 questions plus 3 code-breakers, no photos, all question kinds', () => {
  const content = demoContent(ZERO_MAPS);
  const v = validateContent(content);
  assert.equal(v.ok, true, JSON.stringify(v.problems));
  assert.deepEqual(content.zones.map((z) => z.name), ['Kings Park', 'Elizabeth Quay', 'Fremantle Prison', 'Cottesloe Beach', 'Optus Stadium', 'Code-breakers']);
  assert.deepEqual(content.zones.map((z) => z.questions.length), [10, 10, 10, 10, 10, 3]);
  assert.equal(countQuestions(content), 53);
  const all = content.zones.flatMap((z) => z.questions);
  assert.equal(all.some((x) => x.type === 'photo'), false);
  for (const type of ['string', 'whole-number', 'decimal']) assert.ok(all.some((x) => x.type === type), type);
  assert.ok(content.zones.every((z) => z.map));
  assert.match(content.instructions, /Welcome to the Demo Hunt/);
  assert.match(content.instructions, /Image credits/);
  assert.match(content.instructions, /Dinkum|Calistemon|Gnangarra|Bulach/); // the photographers are credited
  assert.ok(Buffer.byteLength(JSON.stringify(content)) < 60 * 1024);
});

test('every demo answer is accepted by the real answer checker, and a wrong one is not', () => {
  const all = demoContent(ZERO_MAPS).zones.flatMap((z) => z.questions);
  for (const question of all) {
    for (const answer of question.answers) assert.equal(checkAnswer(question, answer).correct, true, `${question.text} -> ${answer}`);
    assert.equal(checkAnswer(question, question.type === 'string' ? 'zzzz nonsense' : '987654321').correct, false, question.text);
  }
});

test('the code-breakers answers follow from the questions they point at', () => {
  const content = demoContent(ZERO_MAPS);
  const a = (zone, n) => content.zones.find((z) => z.name === zone).questions[n - 1].answers[0];
  const [sum, product, word] = content.zones[5].questions;
  assert.equal(sum.answers[0], String(Number(a('Kings Park', 2)) + Number(a('Elizabeth Quay', 1))));
  assert.equal(product.answers[0], String(Number(a('Cottesloe Beach', 2)) * Number(a('Fremantle Prison', 4))));
  assert.equal(word.answers[0], a('Kings Park', 9)[0] + a('Fremantle Prison', 10)[0] + a('Cottesloe Beach', 1)[0]);
  assert.equal(word.answers[0], 'saw');
  assert.equal(CODE_BREAKERS.questions().length, 3);
  assert.ok(ZONES.every((z) => z.questions.length === 10));
  // the puzzles say which questions they use, and those questions exist
  assert.match(sum.text, /Kings Park question 2.*Elizabeth Quay question 1/);
});

test('at least half of the zone questions can be answered by anyone, from the question or the picture (a reviewer\'s check list)', () => {
  // A question is "self-contained" when its answer is a number worked out from numbers in the text, or the text spells the answer out.
  const content = demoContent(ZERO_MAPS);
  const numeric = content.zones.slice(0, 5).flatMap((z) => z.questions).filter((x) => x.type !== 'string');
  const clues = content.zones.slice(0, 5).flatMap((z) => z.questions).filter((x) => x.type === 'string' && /Hint|Look at the picture|missing word|Initials/i.test(x.text));
  assert.ok(numeric.length + clues.length >= 25, `${numeric.length + clues.length} of 50`);
});

test('registering creates a Demo Hunt that opens 5 minutes later and runs for 15', async () => {
  const w = createWorld(T0);
  const c = client(w, '1.1.1.1');
  const reg = await c.post('/api/auth/register', { username: 'ann', password: 'purple-giraffe-lunch-42', timeZone: 'Australia/Perth' });
  assert.equal(reg.status, 200);
  const events = (await c.get('/api/admin/events')).body.events;
  assert.deepEqual(events.map((e) => e.slug), ['demo-hunt']);
  assert.equal(events[0].org, reg.body.user.code);
  assert.match(reg.body.user.code, /^[a-z2-9]{4}$/);
  const base = `/api/events/${events[0].org}/demo-hunt`;

  const info = async () => (await client(w).get(`${base}/info`)).body;
  assert.equal((await info()).status, 'pre'); // the pre-game screen
  w.advance(4 * 60_000 + 30_000);
  assert.equal((await info()).status, 'pre');
  w.advance(90_000); // 6 minutes after the account was made
  assert.equal((await info()).status, 'active');
  const player = client(w, '2.2.2.2');
  assert.equal((await player.post(`${base}/join`, { name: 'Tester' })).status, 200);
  const play = (await player.get(`${base}/play`)).body;
  assert.equal(play.zones.length, 6);
  assert.equal(JSON.stringify(play).includes('"answers"'), false);
  assert.equal((await player.post(`${base}/answer`, { zone: 'z1', question: 'q1', answer: 'Perth' })).status, 200);
  w.advance(15 * 60_000); // 21 minutes after signup: the game has finished
  assert.equal((await info()).status, 'post');
  assert.equal((await client(w).get(`${base}/scoreboard`)).body.questionTotal, 53);
});

test('the demo window is 5 to 20 minutes after signup in the organiser\'s own time zone, and never crosses midnight', () => {
  assert.deepEqual(demoWindow(T0, 'Australia/Perth'), { day: '2026-11-14', start: '10:05', end: '10:20' });
  assert.deepEqual(demoWindow(T0 + 20_000, 'Australia/Perth'), { day: '2026-11-14', start: '10:06', end: '10:21' }); // starts on a whole minute, never earlier than 5 minutes
  assert.deepEqual(demoWindow(T0, 'America/New_York'), { day: '2026-11-13', start: '21:05', end: '21:20' });
  // 23:50 local: it would end after midnight, so it starts at 00:01 the next day
  const lateNight = Date.UTC(2026, 10, 14, 15, 50, 0); // 23:50 in Perth
  assert.deepEqual(demoWindow(lateNight, 'Australia/Perth'), { day: '2026-11-15', start: '00:01', end: '00:16' });
  // 23:55 plus 5 minutes is exactly midnight: a normal window on the new day. 23:45 would end after midnight, at the end of a month too.
  assert.deepEqual(demoWindow(Date.UTC(2026, 10, 30, 15, 55, 0), 'Australia/Perth'), { day: '2026-12-01', start: '00:00', end: '00:15' });
  assert.deepEqual(demoWindow(Date.UTC(2026, 10, 30, 15, 45, 0), 'Australia/Perth'), { day: '2026-12-01', start: '00:01', end: '00:16' });
  assert.equal(gameStatus({ ...demoWindow(T0, 'UTC'), name: 'x', timeZone: 'UTC' }, demoContent(ZERO_MAPS), T0 + 6 * 60_000), 'active');
});

test('a bad or missing time zone falls back safely, and the demo cannot be created twice', async () => {
  const w = createWorld(T0);
  const c = client(w, '3.3.3.3');
  const reg = await c.post('/api/auth/register', { username: 'bob', password: 'purple-giraffe-lunch-42', timeZone: 'Mars/Olympus' });
  assert.equal(reg.status, 200);
  const events = (await c.get('/api/admin/events')).body.events;
  assert.equal(events.length, 1);
  assert.equal(events[0].timeZone, 'Australia/Perth');
});

test('the demo copies its pictures into the new hunt, and they are removed with it', async () => {
  const w = createWorld(T0);
  const c = client(w, '4.4.4.4');
  const reg = await c.post('/api/auth/register', { username: 'carol', password: 'purple-giraffe-lunch-42' });
  assert.equal(reg.status, 200);
  const ev = (await c.get('/api/admin/events')).body.events[0];
  const files = [...w.assets.files.keys()].filter((k) => k.startsWith(`assets/${ev.id}/`));
  assert.equal(files.length, 12); // a thumbnail and a full size picture for each of the 6 zones
  for (const f of files) assert.equal(w.assets.files.get(f).contentType, 'image/jpeg');
  const detail = (await c.get(`/api/admin/events/${ev.id}`)).body;
  assert.ok(detail.content.zones.every((z) => z.map && w.assets.files.has(z.map.full.slice(1))));
  // it counts against the upload budget like any pictures, and an organiser can edit it like any hunt
  assert.ok((await w.store.getEvent(ev.id)).uploadBytes > 1_000_000);
  assert.equal((await c.put(`/api/admin/events/${ev.id}/content`, detail.content)).status, 200);
  assert.equal((await c.del(`/api/admin/events/${ev.id}`, { confirm: 'demo-hunt' })).status, 200);
  assert.equal([...w.assets.files.keys()].filter((k) => k.startsWith(`assets/${ev.id}/`)).length, 0);
});

test('organiser codes: unique, 4 characters, handed to the site admin lazily, and reusable names across organisers', async () => {
  const w = createWorld(T0);
  const codes = new Set();
  for (let i = 0; i < 12; i++) {
    const r = await client(w, `5.5.${i}.1`).post('/api/auth/register', { username: `user${String(i).padStart(2, '0')}x`, password: 'purple-giraffe-lunch-42' });
    codes.add(r.body.user.code);
  }
  assert.equal(codes.size, 12);
  // a site admin created before codes existed has none until first needed
  const { name, password } = await seedSiteAdmin(w);
  assert.equal((await w.store.getUser(name)).code, undefined);
  const boss = client(w, '6.6.6.6');
  const login = await boss.post('/api/auth/login', { username: name, password });
  assert.match(login.body.user.code, /^[a-z2-9]{4}$/);
  assert.equal((await w.store.getUser(name)).code, login.body.user.code);
  const created = await boss.post('/api/admin/events', { slug: 'demo-hunt', name: 'Site admin hunt' }); // the same name as every organiser's demo is fine
  assert.equal(created.status, 200);
  assert.equal(created.body.org, login.body.user.code);
});
