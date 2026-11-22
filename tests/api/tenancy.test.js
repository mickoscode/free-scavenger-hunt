// Many independent event admins on one site: nobody can see or touch another's events; the site admin can.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client, createEvent, createWorld, GAME_START, register, sampleContent, seedSiteAdmin } from './helpers.js';

test('event admins only see and change their own events', async () => {
  const w = createWorld();
  const ann = await register(w, 'ann');
  const bob = await register(w, 'bob');
  const a = await createEvent(ann, { slug: 'anns-hunt' });
  const b = await createEvent(bob, { slug: 'bobs-hunt' });

  const mine = async (c, all = '') => (await c.get(`/api/admin/events${all}`)).body.events.map((e) => e.slug).filter((x) => x !== 'demo-hunt');
  assert.deepEqual(await mine(ann), ['anns-hunt']);
  assert.deepEqual(await mine(bob), ['bobs-hunt']);
  assert.deepEqual(await mine(ann, '?all=1'), ['anns-hunt']); // ?all is for the site admin only
  assert.equal((await ann.get('/api/admin/events?all=1')).body.events.every((e) => e.owner === 'ann'), true);

  const base = (id) => `/api/admin/events/${id}`;
  for (const [method, path, body] of [
    ['get', base(b.id)], ['put', `${base(b.id)}/config`, {}], ['put', `${base(b.id)}/content`, sampleContent()], ['get', `${base(b.id)}/teams`],
    ['get', `${base(b.id)}/photos`], ['post', `${base(b.id)}/publish`, { confirm: true }], ['post', `${base(b.id)}/player-data/delete`, { confirm: 'delete' }],
    ['del', base(b.id), { confirm: 'bobs-hunt' }], ['post', `${base(b.id)}/zones/z1/map`, {}],
  ]) {
    const r = await ann[method](path, body);
    assert.equal(r.status, 400, `${method} ${path}`);
    assert.equal(r.body.error, 'no-event', `${method} ${path}`);
  }
  assert.equal((await bob.get(base(b.id))).status, 200);
  assert.ok(a.id !== b.id);
});

test('team sessions never cross events, even with the same team name and number', async () => {
  const w = createWorld(GAME_START - 1000);
  const ann = await register(w, 'ann');
  const bob = await register(w, 'bob');
  const one = await createEvent(ann, { slug: 'one' });
  const two = await createEvent(bob, { slug: 'one' }); // the same hunt name under another organiser is a different hunt
  assert.notEqual(one.org, two.org);
  const player = client(w, '8.8.8.8');
  assert.equal((await player.post(`${one.base}/join`, { name: 'Same Name' })).body.number, 1);
  assert.equal((await player.get(`${one.base}/me`)).status, 200);
  assert.equal((await player.get(`${two.base}/me`)).status, 401);
  assert.equal((await client(w, '8.8.8.9').post(`${two.base}/join`, { name: 'Same Name' })).body.number, 1);
  assert.equal((await client(w).get(`${one.base}/scoreboard`)).body.teams.length, 1);
  assert.equal((await client(w).get(`/api/events/${two.org}/one/scoreboard`)).body.teams.length, 1);
  assert.equal((await client(w).get(`/api/events/${one.org}/nosuch/scoreboard`)).body.error, 'no-event');
  assert.equal((await client(w).get('/api/events/ABCD/one/scoreboard')).body.error, 'no-event'); // not a valid code
});

test('slugs are unique, validated, and an event limit applies per user', async () => {
  const w = createWorld();
  const ann = await register(w, 'ann');
  const bob = await register(w, 'bob');
  assert.equal((await ann.post('/api/admin/events', { slug: 'Bad Slug', name: 'x' })).body.error, 'invalid-slug');
  assert.equal((await ann.post('/api/admin/events', { slug: 'a', name: 'x' })).body.error, 'invalid-slug');
  assert.equal((await ann.post('/api/admin/events', { slug: 'taken', name: 'x' })).status, 200);
  assert.equal((await ann.post('/api/admin/events', { slug: 'taken', name: 'x' })).body.error, 'slug-taken'); // within one organiser
  assert.equal((await bob.post('/api/admin/events', { slug: 'taken', name: 'x' })).status, 200); // another organiser may reuse the name
  for (let i = 1; i < 3; i++) await ann.post('/api/admin/events', { slug: `event-${i}`, name: 'x' }); // the default limit is 3 hunts
  assert.equal((await ann.post('/api/admin/events', { slug: 'one-too-many', name: 'x' })).body.error, 'event-limit');
  assert.equal((await ann.get('/api/admin/events')).body.canCreate, false);
});

test('the site admin sees everything, manages users, and can act on any event', async () => {
  const w = createWorld();
  const { name, password } = await seedSiteAdmin(w);
  const boss = client(w, '6.6.6.6');
  assert.equal((await boss.post('/api/auth/login', { username: name, password })).body.user.role, 'site-admin');
  const ann = await register(w, 'ann', 'secret-garden-walk-9');
  const ev = await createEvent(ann, { slug: 'anns-hunt' });

  assert.deepEqual((await boss.get('/api/admin/events?all=1')).body.events.map((e) => e.slug).sort(), ['anns-hunt', 'demo-hunt']); // every hunt of every organiser
  assert.equal((await boss.get(`/api/admin/events/${ev.id}`)).status, 200);
  assert.equal((await boss.put(`/api/admin/events/${ev.id}/config`, { name: 'Edited', timeZone: 'Australia/Perth', day: '2026-11-14', start: '09:00', end: '12:00', teamNames: true })).status, 200);

  const users = (await boss.get('/api/site/users')).body.users;
  assert.deepEqual(users.map((u) => [u.name, u.eventCount]), [['ann', 2], ['siteadmin', 0]]); // her own hunt and the starter demo
  assert.equal((await ann.get('/api/site/users')).body.error, 'not-allowed'); // event admins cannot

  // suspend: their session stops working at once and they cannot log in
  assert.equal((await boss.patch('/api/site/users/ann', { status: 'suspended' })).status, 200);
  assert.equal((await ann.get('/api/admin/events')).status, 401);
  assert.equal((await client(w, '1.2.3.4').post('/api/auth/login', { username: 'ann', password: 'secret-garden-walk-9' })).body.error, 'account-suspended');
  await boss.patch('/api/site/users/ann', { status: 'active', maxEvents: 1 });
  assert.equal((await client(w, '1.2.3.4').post('/api/auth/login', { username: 'ann', password: 'secret-garden-walk-9' })).status, 200);

  // reset password: temporary password works, the old one and old sessions do not
  const reset = (await boss.post('/api/site/users/ann/reset-password')).body;
  assert.match(reset.password, /^[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}$/);
  assert.equal((await ann.get('/api/admin/events')).status, 401);
  assert.equal((await client(w, '1.2.3.5').post('/api/auth/login', { username: 'ann', password: reset.password })).status, 200);
  assert.equal((await client(w, '1.2.3.6').post('/api/auth/login', { username: 'ann', password: 'secret-garden-walk-9' })).body.error, 'invalid-login');

  // the site admin cannot be suspended or deleted through the API
  assert.equal((await boss.patch('/api/site/users/siteadmin', { status: 'suspended' })).status, 400);
  assert.equal((await boss.del('/api/site/users/siteadmin', { confirm: 'siteadmin' })).status, 400);

  // deleting a user deletes their events
  assert.equal((await boss.del('/api/site/users/ann', {})).body.error, 'invalid-request');
  assert.equal((await boss.del('/api/site/users/ann', { confirm: 'ann' })).status, 200);
  assert.equal((await client(w).get(`/api/events/${ev.org}/anns-hunt/info`)).body.error, 'no-event');
});

test('maps: uploads are checked by content and size, stored under the event, replaced and cleaned up', async () => {
  const w = createWorld();
  const ann = await register(w, 'ann');
  const ev = await createEvent(ann, { slug: 'maps' });
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]).toString('base64');
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]).toString('base64');
  const up = (body) => ann.post(`/api/admin/events/${ev.id}/zones/z1/map`, body);

  assert.equal((await up({ thumb: Buffer.from('not an image at all').toString('base64'), full: png })).body.error, 'invalid-image');
  assert.equal((await up({ thumb: png, full: Buffer.alloc(600 * 1024, 0xff).toString('base64') })).body.error, 'invalid-image');
  const { map } = (await up({ thumb: png, full: jpg })).body;
  assert.match(map.thumb, new RegExp(`^/assets/${ev.id}/z1-[a-z0-9]+-thumb\\.png$`));
  assert.ok(w.assets.files.has(map.full.slice(1)));

  const content = sampleContent({ z1: map });
  assert.equal((await ann.put(`/api/admin/events/${ev.id}/content`, content)).status, 200);
  // a map address the server did not issue for this event is refused
  const forged = sampleContent({ z1: { thumb: '/assets/other-event/x.png', full: map.full } });
  assert.equal((await ann.put(`/api/admin/events/${ev.id}/content`, forged)).body.error, 'invalid-content');
  // replacing the map removes the old files; deleting the event removes the rest
  const second = (await up({ thumb: png, full: jpg })).body.map;
  await ann.put(`/api/admin/events/${ev.id}/content`, sampleContent({ z1: second }));
  assert.equal(w.assets.files.has(map.thumb.slice(1)), false);
  assert.equal((await ann.del(`/api/admin/events/${ev.id}`, { confirm: 'wrong' })).body.error, 'confirmation-required');
  assert.equal((await ann.del(`/api/admin/events/${ev.id}`, { confirm: 'maps' })).status, 200);
  assert.equal([...w.assets.files.keys()].filter((k) => k.startsWith(`assets/${ev.id}/`)).length, 0);
});

test('content is validated: types, answers, scores, counts, ids', async () => {
  const w = createWorld();
  const ann = await register(w, 'ann');
  const ev = await createEvent(ann, { slug: 'content' });
  const put = (c) => ann.put(`/api/admin/events/${ev.id}/content`, c);
  const zone = (q) => ({ instructions: '', zones: [{ id: 'z1', name: 'Z', map: null, questions: [q] }] });
  const good = { id: 'q1', type: 'string', text: 'T', answers: ['a'], score: 5 };
  assert.equal((await put(zone(good))).status, 200);
  for (const [bad, field] of [
    [{ ...good, type: 'essay' }, 'type'], [{ ...good, answers: [] }, 'answers'], [{ ...good, text: '' }, 'text'], [{ ...good, score: -1 }, 'score'],
    [{ ...good, score: 'ten' }, 'score'], [{ ...good, type: 'whole-number', answers: ['1.5'] }, 'answers'], [{ ...good, type: 'decimal', answers: ['1', '2'] }, 'answers'],
    [{ ...good, id: 'BAD ID' }, 'id'],
  ]) {
    const r = await put(zone(bad));
    assert.equal(r.body.error, 'invalid-content', field);
    assert.ok(r.body.problems.some((p) => p.endsWith(field)), `${field}: ${r.body.problems}`);
  }
  assert.equal((await put({ instructions: 'x'.repeat(21 * 1024), zones: [] })).body.error, 'invalid-content');
  const many = Array.from({ length: 21 }, (_, i) => ({ id: `z${i}`, name: 'Z', map: null, questions: [] }));
  assert.equal((await put({ zones: many })).body.error, 'invalid-content');
  assert.equal((await put({ zones: [{ id: 'z1', name: 'a', questions: [] }, { id: 'z1', name: 'b', questions: [] }] })).body.error, 'invalid-content'); // duplicate id
  // a photo challenge needs no answer
  assert.equal((await put(zone({ id: 'p1', type: 'photo', text: 'Selfie', answers: [], score: 10 }))).status, 200);
});

test('duplicating a hunt copies settings, questions and maps (not teams), and respects ownership and limits', async () => {
  const w = createWorld(GAME_START - 1000);
  const ann = await register(w, 'ann');
  const bob = await register(w, 'bob');
  const ev = await createEvent(ann, { slug: 'original' });
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]).toString('base64');
  const { map } = (await ann.post(`/api/admin/events/${ev.id}/zones/z1/map`, { thumb: png, full: png })).body;
  await ann.put(`/api/admin/events/${ev.id}/content`, sampleContent({ z1: map }));
  await client(w, '5.5.5.5').post(`${ev.base}/join`, { name: 'Team A' });

  assert.equal((await bob.post(`/api/admin/events/${ev.id}/duplicate`, { slug: 'stolen', name: 'x' })).body.error, 'no-event');
  assert.equal((await ann.post(`/api/admin/events/${ev.id}/duplicate`, { slug: 'original', name: 'x' })).body.error, 'slug-taken');
  const copy = (await ann.post(`/api/admin/events/${ev.id}/duplicate`, { slug: 'next-year', name: 'Next year' })).body;
  const got = (await ann.get(`/api/admin/events/${copy.id}`)).body;
  assert.equal(got.config.name, 'Next year');
  assert.equal(got.teamCount, 0);
  assert.equal(got.content.zones.length, 2);
  assert.notEqual(got.content.zones[0].map.full, map.full); // its own copy of the picture
  assert.ok(w.assets.files.has(got.content.zones[0].map.full.slice(1)));
  // deleting the original leaves the copy's maps alone
  await ann.del(`/api/admin/events/${ev.id}`, { confirm: 'original' });
  assert.ok(w.assets.files.has(got.content.zones[0].map.full.slice(1)));
});
