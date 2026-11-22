// The Demo Hunt every new organiser gets: a copy of the hunt called master-demo in the site admin's account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client, createMaster, createWorld, register, seedSiteAdmin } from './helpers.js';
import { demoWindow } from '../../api/demo/create.js';

const T0 = Date.UTC(2026, 10, 14, 2, 0, 0); // 10:00 in Perth
let ip = 0;
const signUp = async (w, name, tz = 'Australia/Perth') => {
  const c = client(w, `20.0.${Math.floor(ip / 250)}.${ip++ % 250}`);
  const reg = await c.post('/api/auth/register', { username: name, password: 'purple-giraffe-lunch-42', timeZone: tz });
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  const events = (await c.get('/api/admin/events')).body.events;
  const demo = events.find((e) => e.slug === 'demo-hunt') ?? null;
  return { c, reg, events, demo, detail: async () => (await c.get(`/api/admin/events/${demo.id}`)).body };
};
const zoneNames = (d) => d.content.zones.map((z) => z.name);

test('the window is 5 to 20 minutes after signup in the organiser\'s own time zone, and never crosses midnight', () => {
  assert.deepEqual(demoWindow(T0, 'Australia/Perth'), { day: '2026-11-14', start: '10:05', end: '10:20' });
  assert.deepEqual(demoWindow(T0 + 20_000, 'Australia/Perth'), { day: '2026-11-14', start: '10:06', end: '10:21' }); // a whole minute, never earlier than 5 minutes
  assert.deepEqual(demoWindow(T0, 'America/New_York'), { day: '2026-11-13', start: '21:05', end: '21:20' });
  const lateNight = Date.UTC(2026, 10, 14, 15, 50, 0); // 23:50 in Perth: it would end after midnight, so it starts at 00:01 the next day
  assert.deepEqual(demoWindow(lateNight, 'Australia/Perth'), { day: '2026-11-15', start: '00:01', end: '00:16' });
  assert.deepEqual(demoWindow(Date.UTC(2026, 10, 30, 15, 55, 0), 'Australia/Perth'), { day: '2026-12-01', start: '00:00', end: '00:15' }); // exactly midnight is fine
  assert.deepEqual(demoWindow(Date.UTC(2026, 10, 30, 15, 45, 0), 'Australia/Perth'), { day: '2026-12-01', start: '00:01', end: '00:16' }); // end of a month
});

test('with no master-demo a new organiser has no demo hunt, and signing up works exactly as before', async () => {
  const w = createWorld(T0);
  const a = await signUp(w, 'ann');
  assert.equal(a.reg.status, 200);
  assert.deepEqual(a.events, []);
  assert.match(a.reg.body.user.code, /^[a-z2-9]{4}$/);
});

test('a new organiser gets a copy of master-demo that opens 5 minutes later and runs for 15', async () => {
  const w = createWorld(T0);
  const master = await createMaster(w, { zones: ['Kings Park', 'Cottesloe Beach'], name: 'Perth Demo' });
  const a = await signUp(w, 'ann', 'Australia/Perth');
  assert.equal(a.demo.slug, 'demo-hunt');
  assert.equal(a.demo.org, a.reg.body.user.code); // in her own account, at her own address
  assert.equal(a.demo.owner, 'ann');
  const detail = await a.detail();
  assert.equal(detail.config.name, 'Perth Demo');
  assert.deepEqual(zoneNames(detail), ['Kings Park', 'Cottesloe Beach']);
  assert.equal(detail.content.instructions, master.content.instructions);
  assert.deepEqual([detail.config.day, detail.config.start, detail.config.end], ['2026-11-14', '10:05', '10:20']);

  const base = `/api/events/${a.demo.org}/demo-hunt`;
  const info = async () => (await client(w).get(`${base}/info`)).body;
  assert.equal((await info()).status, 'pre');
  w.advance(4 * 60_000 + 30_000);
  assert.equal((await info()).status, 'pre');
  w.advance(90_000); // 6 minutes after the account was made
  assert.equal((await info()).status, 'active');
  const player = client(w, '2.2.2.2');
  assert.equal((await player.post(`${base}/join`, { name: 'Tester' })).status, 200);
  const play = (await player.get(`${base}/play`)).body;
  assert.equal(play.zones.length, 2);
  assert.equal(JSON.stringify(play).includes('"answers"'), false);
  assert.equal((await player.post(`${base}/answer`, { zone: 'z1', question: 'q2', answer: 'Perth' })).status, 200);
  assert.equal((await client(w).get(`${base}/scoreboard`)).body.questionTotal, 4);
  w.advance(15 * 60_000); // 21 minutes after signup: it has finished
  assert.equal((await info()).status, 'post');
});

test('an edit to master-demo reaches organisers who sign up afterwards, and never anybody who signed up before', async () => {
  const w = createWorld(T0);
  const before = await signUp(w, 'early'); // no master yet: no demo
  assert.equal(before.demo, null);

  const master = await createMaster(w);
  const middle = await signUp(w, 'middle');
  const given = JSON.stringify(await middle.detail());

  const content = structuredClone(master.content);
  content.zones[0].name = 'Edited Zone';
  content.instructions = '# New instructions';
  assert.equal((await master.boss.put(`/api/admin/events/${master.id}/content`, content)).status, 200);
  assert.equal((await master.boss.put(`/api/admin/events/${master.id}/config`, { name: 'Renamed Demo', timeZone: 'UTC', day: '2030-01-01', start: '09:00', end: '10:00', teamNames: true })).status, 200);

  const late = await signUp(w, 'late');
  const detail = await late.detail();
  assert.equal(detail.content.zones[0].name, 'Edited Zone');
  assert.equal(detail.content.instructions, '# New instructions');
  assert.equal(detail.config.name, 'Renamed Demo');
  assert.equal(JSON.stringify(await middle.detail()), given); // byte for byte what she was given
});

test('a copy is independent: its pictures are its own files, removed with it, and deleting the master changes nothing for it', async () => {
  const w = createWorld(T0);
  const master = await createMaster(w);
  const a = await signUp(w, 'ann');
  const detail = await a.detail();
  const mine = [...w.assets.files.keys()].filter((k) => k.startsWith(`assets/${a.demo.id}/`));
  assert.equal(mine.length, 4); // a thumbnail and a full size picture for each of the 2 zones
  for (const z of detail.content.zones) assert.ok(z.map.full.startsWith(`/assets/${a.demo.id}/`) && w.assets.files.has(z.map.full.slice(1)));
  assert.equal(detail.teamCount, 0);

  await master.boss.del(`/api/admin/events/${master.id}`, { confirm: 'master-demo' });
  for (const z of (await a.detail()).content.zones) assert.ok(w.assets.files.has(z.map.full.slice(1))); // still there
  assert.equal((await signUp(w, 'bob')).demo, null); // nothing to copy any more

  assert.equal((await a.c.put(`/api/admin/events/${a.demo.id}/content`, (await a.detail()).content)).status, 200); // she can edit hers like any hunt
  assert.equal((await a.c.del(`/api/admin/events/${a.demo.id}`, { confirm: 'demo-hunt' })).status, 200);
  assert.equal([...w.assets.files.keys()].filter((k) => k.startsWith(`assets/${a.demo.id}/`)).length, 0);
});

test('what is copied and what is not: no join code, WhatsApp link, teams or dates; the organiser\'s own time zone', async () => {
  const w = createWorld(T0);
  const master = await createMaster(w);
  assert.equal((await master.boss.put(`/api/admin/events/${master.id}/config`, {
    name: 'Demo Hunt', timeZone: 'Europe/Dublin', day: '2030-05-05', start: '09:00', end: '17:00', teamNames: false, joinCode: 'SECRET1', whatsappUrl: 'https://chat.whatsapp.com/AbCdEf1234567',
  })).status, 200);
  await client(w, '1.2.3.4').post(`/api/events/${master.org}/master-demo/join`, { code: 'SECRET1' }); // a team on the master

  const a = await signUp(w, 'ann', 'America/New_York');
  const detail = await a.detail();
  assert.equal(detail.config.teamNames, false); // the master's choice
  assert.equal(detail.config.joinCode, '');
  assert.equal(detail.config.whatsappUrl, '');
  assert.equal(detail.teamCount, 0);
  assert.equal(detail.config.timeZone, 'America/New_York');
  assert.deepEqual([detail.config.day, detail.config.start, detail.config.end], ['2026-11-13', '21:05', '21:20']); // not the master's 2030 date
  assert.equal(JSON.stringify(detail).includes('SECRET1') || JSON.stringify(detail).includes('AbCdEf1234567'), false);
});

test('only a hunt called master-demo in a site admin\'s account counts, and only if it has questions', async () => {
  const w = createWorld(T0);
  const ann = await register(w, 'ann'); // an ordinary organiser
  const theirs = await ann.post('/api/admin/events', { slug: 'master-demo', name: 'Not the master' });
  assert.equal(theirs.status, 200);
  assert.equal((await ann.put(`/api/admin/events/${theirs.body.id}/content`, { instructions: '', zones: [{ id: 'z1', name: 'Hers', map: null, questions: [{ id: 'q1', type: 'string', text: 'x?', answers: ['y'], score: 1 }] }] })).status, 200);
  assert.equal((await signUp(w, 'bob')).demo, null); // an organiser's hunt of that name is just a hunt

  const { name, password } = await seedSiteAdmin(w);
  const boss = client(w, '6.6.6.6');
  await boss.post('/api/auth/login', { username: name, password });
  await boss.post('/api/admin/events', { slug: 'master-demo', name: 'Empty master' }); // a site admin's, but with nothing in it
  assert.equal((await signUp(w, 'cat')).demo, null);
});

test('if copying the master fails for any reason, signup still works, with no demo and nothing left behind', async () => {
  const w = createWorld(T0);
  await createMaster(w);
  const original = w.assets.copy;
  w.assets.copy = async () => { throw new Error('the storage service is down'); };
  const errors = console.error;
  console.error = () => {};
  try {
    const a = await signUp(w, 'ann'); // registration succeeded
    assert.equal(a.demo, null);
  } finally {
    console.error = errors;
    w.assets.copy = original;
  }
  const ids = new Set((await w.store.listEvents()).map((e) => e.id));
  for (const key of w.assets.files.keys()) assert.ok(ids.has(key.split('/')[1]), `orphaned file ${key}`);
  assert.equal((await w.store.listEventsByOwner('ann')).length, 0);
});

test('organiser codes: unique, 4 characters, and given to the site admin the first time it is needed', async () => {
  const w = createWorld(T0);
  const codes = new Set();
  for (let i = 0; i < 12; i++) codes.add((await signUp(w, `user${String(i).padStart(2, '0')}x`)).reg.body.user.code);
  assert.equal(codes.size, 12);
  const { name, password } = await seedSiteAdmin(w);
  assert.equal((await w.store.getUser(name)).code, undefined);
  const boss = client(w, '6.6.6.6');
  const login = await boss.post('/api/auth/login', { username: name, password });
  assert.match(login.body.user.code, /^[a-z2-9]{4}$/);
  assert.equal((await w.store.getUser(name)).code, login.body.user.code);
  const made = await boss.post('/api/admin/events', { slug: 'demo-hunt', name: 'Same name as every demo' }); // fine: names are per organiser
  assert.equal(made.body.org, login.body.user.code);
});
