// Attacks, as tests. Anything a hostile visitor, a hostile organiser or a hostile team could try against the API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../api/app.js';
import { createMemoryAssets } from '../../api/assets.js';
import { createMemoryStore } from '../../api/store/memory.js';
import { client, createEvent, createWorld, GAME_START, register, seedSiteAdmin } from './helpers.js';

// ---- every route, automatically: a new route that forgets its check fails here
const fillParams = (pattern, id = 'someid') => pattern.replace(/:([a-z]+)/gi, (_, k) => ({ slug: 'beach-hunt', number: '1', zone: 'z1', name: 'ann', id }[k] ?? 'x'));

test('every admin and site route refuses a visitor who is not signed in', async () => {
  const w = createWorld();
  const anon = client(w);
  const routes = w.handle.routes.filter((r) => /^\/api\/(admin|site)\//.test(r.pattern));
  assert.ok(routes.length >= 20, `found ${routes.length} routes`);
  for (const r of routes) {
    const res = await anon.call(r.method, fillParams(r.pattern), r.method === 'GET' ? undefined : {});
    assert.equal(res.status, 401, `${r.method} ${r.pattern}`);
    assert.equal(res.body.error, 'not-authenticated', `${r.method} ${r.pattern}`);
  }
});

test('every route that acts on one hunt treats another organiser exactly like a missing hunt', async () => {
  const w = createWorld();
  const ann = await register(w, 'ann');
  const bob = await register(w, 'bob');
  const ev = await createEvent(ann, { slug: 'anns-hunt' });
  const routes = w.handle.routes.filter((r) => /^\/api\/admin\/events\/:id/.test(r.pattern));
  assert.ok(routes.length >= 12, `found ${routes.length} routes`);
  for (const r of routes) {
    const path = fillParams(r.pattern, ev.id);
    const stranger = await bob.call(r.method, path, r.method === 'GET' ? undefined : {});
    const missing = await bob.call(r.method, fillParams(r.pattern, 'nosuchid'), r.method === 'GET' ? undefined : {});
    assert.equal(stranger.status, 400, `${r.method} ${r.pattern}`);
    assert.equal(stranger.body.error, 'no-event', `${r.method} ${r.pattern}`);
    assert.deepEqual(stranger.body, missing.body, `${r.method} ${r.pattern} reveals that the hunt exists`);
  }
  // and nothing was changed by any of those calls
  assert.equal((await ann.get(`/api/admin/events/${ev.id}`)).body.config.name, 'Beach Hunt');
});

test('organisers cannot use the site admin routes', async () => {
  const w = createWorld();
  const ann = await register(w, 'ann');
  for (const r of w.handle.routes.filter((x) => x.pattern.startsWith('/api/site/'))) {
    const res = await ann.call(r.method, fillParams(r.pattern), r.method === 'GET' ? undefined : {});
    assert.equal(res.status, 401, `${r.method} ${r.pattern}`);
    assert.equal(res.body.error, 'not-allowed', `${r.method} ${r.pattern}`);
  }
});

test('every route that needs a team session refuses a visitor without one', async () => {
  const w = createWorld(GAME_START + 1000);
  const ann = await register(w, 'ann');
  await createEvent(ann);
  const anon = client(w);
  for (const [method, path] of [['GET', '/api/events/beach-hunt/me'], ['GET', '/api/events/beach-hunt/play'], ['POST', '/api/events/beach-hunt/answer'], ['POST', '/api/events/beach-hunt/photo'], ['GET', '/api/events/beach-hunt/results']]) {
    const res = await anon.call(method, path, method === 'GET' ? undefined : { zone: 'z1', question: 'q1', answer: 'x' });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

// ---- the API only answers when the request came through CloudFront
test('with an origin secret configured, a request that did not come through CloudFront gets nothing', async () => {
  const handle = createApp({ store: createMemoryStore(), assets: createMemoryAssets(), originSecret: 'cf-secret-value' });
  const call = (headers) => handle({ method: 'GET', path: '/api/auth/me', query: {}, headers, ip: '1.1.1.1' });
  const direct = await call({});
  assert.equal(direct.status, 400);
  assert.equal(JSON.parse(direct.body).error, 'unknown-route'); // looks like any unknown route: it does not even admit this is the API
  assert.equal((await call({ 'x-origin-verify': 'wrong' })).status, 400);
  assert.equal((await call({ 'x-origin-verify': 'cf-secret-value' })).status, 200);
  assert.equal((await call({ 'x-origin-verify': 'cf-secret-valuX' })).status, 400); // same length, constant time compare
});

// ---- hostile input
test('hostile text is only ever data: it comes back as JSON strings and never as markup', async () => {
  const w = createWorld(GAME_START - 1000);
  const ann = await register(w, 'ann');
  const xss = '"><img src=x onerror=alert(1)>';
  const ev = await createEvent(ann, {
    config: { name: xss },
    content: { instructions: `<script>alert(1)</script> ${xss}`, zones: [{ id: 'z1', name: xss, map: null, questions: [{ id: 'q1', type: 'string', text: xss, answers: [xss], score: 5 }] }] },
  });
  const t = client(w, '5.5.5.5');
  assert.equal((await t.post(`/api/events/${ev.slug}/join`, { name: xss })).status, 200);
  const res = await client(w).get(`/api/events/${ev.slug}/scoreboard`);
  assert.match(res.headers['content-type'], /^application\/json/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.body.teams[0].name, xss.slice(0, 30).length === xss.length ? xss : res.body.teams[0].name);
});

test('JSON that tries to pollute prototypes or set fields it should not is harmless', async () => {
  const w = createWorld();
  const evil = '{"username":"mallory","password":"a-long-password-1","__proto__":{"role":"site-admin","status":"active"},"constructor":{"prototype":{"role":"site-admin"}},"role":"site-admin"}';
  const reg = await w.handle({ method: 'POST', path: '/api/auth/register', query: {}, headers: { 'content-type': 'application/json' }, body: evil, ip: '2.2.2.2' });
  assert.equal(JSON.parse(reg.body).user.role, 'event-admin');
  assert.equal(({}).role, undefined); // Object.prototype untouched
  const mallory = client(w, '2.2.2.2');
  await mallory.post('/api/auth/login', { username: 'mallory', password: 'a-long-password-1' });
  assert.equal((await mallory.get('/api/site/users')).status, 401);
  assert.equal((await mallory.get('/api/auth/me')).body.user.role, 'event-admin');

  const ev = await createEvent(mallory, { slug: 'mallory-hunt' });
  const cfg = await mallory.put(`/api/admin/events/${ev.id}/config`, { name: 'N', timeZone: 'UTC', day: '2026-11-14', start: '09:00', end: '10:00', teamNames: true, owner: 'ann', id: 'other', slug: 'stolen', resultsPublished: true });
  assert.equal(cfg.status, 200);
  const got = (await mallory.get(`/api/admin/events/${ev.id}`)).body;
  assert.equal(got.slug, 'mallory-hunt'); // not settable through the config
  assert.equal(got.owner, 'mallory');
  assert.equal(got.resultsPublished, false);
});

test('malformed and oversized requests are refused cleanly', async () => {
  const w = createWorld();
  const send = (path, body, type = 'application/json') => w.handle({ method: 'POST', path, query: {}, headers: { 'content-type': type }, body, ip: '3.3.3.3' });
  assert.equal((await send('/api/auth/login', '{not json')).status, 400);
  assert.equal((await send('/api/auth/login', 'x'.repeat(3 * 1024 * 1024))).status, 400);
  assert.equal((await send('/api/auth/login', '{}', 'application/x-www-form-urlencoded')).status, 400); // forms cannot be forged cross-site
  assert.equal((await send('/api/auth/login', '[1,2,3]')).status, 400);
  assert.equal((await send('/api/auth/login', 'null')).status, 400);
  for (const path of ['/api/events/%ZZ', '/api/events/%00', '/api/../../etc/passwd', '/api/events/' + 'a'.repeat(5000)]) {
    const res = await w.handle({ method: 'GET', path, query: {}, headers: {}, ip: '3.3.3.3' });
    assert.ok([400].includes(res.status), `${path} -> ${res.status}`);
  }
});

test('no response ever sets a cookie without HttpOnly, Secure and SameSite', async () => {
  const w = createWorld(GAME_START - 1000);
  const ann = await register(w, 'ann');
  await createEvent(ann);
  const team = await client(w, '4.4.4.4').call('POST', '/api/events/beach-hunt/join', { name: 'Gulls' });
  for (const res of [team, await client(w, '4.4.4.5').call('POST', '/api/auth/register', { username: 'zed1', password: 'zed-long-password-2' })]) {
    assert.ok(res.raw.cookies.length > 0);
    for (const c of res.raw.cookies) for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict']) assert.ok(c.includes(attr), `${c} lacks ${attr}`);
  }
});

test('names that could pose as the site, and weak passwords, are refused', async () => {
  const w = createWorld();
  const c = client(w);
  for (const username of ['admin', 'Administrator', 'site-admin', 'siteadmin', 'support', 'root', 'free-scavenger-hunt', 'sup_port']) {
    assert.equal((await c.post('/api/auth/register', { username, password: 'a-long-password-1' })).body.error, 'invalid-username', username);
  }
  for (const password of ['aaaaaaaaaaaa', 'Password1234', 'qwertyuiop12', 'mallory-mallory', '1234567890']) {
    const r = await c.post('/api/auth/register', { username: 'mallory', password });
    assert.ok(['weak-password', 'invalid-password'].includes(r.body.error), `${password} -> ${JSON.stringify(r.body)}`);
  }
  assert.equal((await c.post('/api/auth/register', { username: 'mallory', password: 'purple-giraffe-lunch-42' })).status, 200); // a passphrase is fine
});

test('two simultaneous uses of one recovery code cannot both succeed', async () => {
  const w = createWorld();
  const c = client(w);
  const { codes } = (await c.post('/api/auth/register', { username: 'ann', password: 'first-password-1' })).body.recoveryCodes ? { codes: (await client(w, '1.1.1.9').post('/api/auth/register', { username: 'ann2', password: 'first-password-1' })).body.recoveryCodes } : {};
  // read both copies of the account first (what two racing requests would do), then let both try to save
  const before = await w.store.getUser('ann2');
  const first = { ...before, sessionGen: 1, recovery: before.recovery.slice(1) };
  assert.equal(await w.store.updateUserIf(first, before.sessionGen ?? 0), true);
  assert.equal(await w.store.updateUserIf({ ...before, sessionGen: 1 }, before.sessionGen ?? 0), false);
  assert.equal(codes.length, 8);
});

test('uploads: the file must really be an image, the address cannot be chosen, and uploads are rate limited', async () => {
  const w = createWorld();
  const ann = await register(w, 'ann');
  const ev = await createEvent(ann);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]).toString('base64');
  const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
  assert.equal((await ann.post(`/api/admin/events/${ev.id}/zones/z1/map`, { thumb: html, full: png })).body.error, 'invalid-image');
  assert.equal((await ann.post(`/api/admin/events/${ev.id}/zones/..%2f..%2fx/map`, { thumb: png, full: png })).status, 400);
  assert.equal((await ann.post(`/api/admin/events/${ev.id}/zones/z1/map`, { thumb: png, full: png, key: '../../evil.html' })).status, 200);
  for (const key of w.assets.files.keys()) assert.match(key, new RegExp(`^assets/${ev.id}/z1-[a-z0-9]+-(thumb|full)\\.png$`)); // only server-chosen names
  for (let i = 0; i < 60; i++) await ann.post(`/api/admin/events/${ev.id}/zones/z1/map`, { thumb: png, full: png });
  assert.equal((await ann.post(`/api/admin/events/${ev.id}/zones/z1/map`, { thumb: png, full: png })).status, 429);
});

test('a suspended organiser loses access at once, and a deleted one cannot act', async () => {
  const w = createWorld();
  const { name, password } = await seedSiteAdmin(w);
  const boss = client(w, '6.6.6.6');
  await boss.post('/api/auth/login', { username: name, password });
  const ann = await register(w, 'ann');
  const ev = await createEvent(ann);
  await boss.patch('/api/site/users/ann', { status: 'suspended' });
  assert.equal((await ann.get(`/api/admin/events/${ev.id}`)).status, 401);
  await boss.patch('/api/site/users/ann', { status: 'active' });
  await boss.del('/api/site/users/ann', { confirm: 'ann' });
  assert.equal((await ann.get('/api/admin/events')).status, 401);
});

test('the site admin cannot be locked out by a stranger, and cannot be created through registration', async () => {
  const w = createWorld();
  const { name, password } = await seedSiteAdmin(w);
  const attacker = client(w, '66.66.66.66');
  for (let i = 0; i < 10; i++) await attacker.post('/api/auth/login', { username: name, password: 'wrong-wrong-wrong' });
  assert.equal((await client(w, '77.77.77.77').post('/api/auth/login', { username: name, password })).status, 200);
  assert.equal((await client(w, '88.88.88.88').post('/api/auth/register', { username: name, password: 'a-long-password-1' })).body.error, 'invalid-username');
});

// ---- cost: what an attacker can make the site store or do is bounded
test('signup is capped overall, so a bot cannot mint accounts faster than 30 an hour', async () => {
  const w = createWorld();
  let made = 0;
  for (let i = 0; i < 40; i++) {
    const r = await client(w, `10.${Math.floor(i / 4)}.0.${i}`).post('/api/auth/register', { username: `bot${String(i).padStart(2, '0')}x`, password: 'purple-giraffe-lunch-42' });
    if (r.status === 200) made += 1;
  }
  assert.equal(made, 30);
  w.advance(61 * 60 * 1000);
  assert.equal((await client(w, '10.99.0.1').post('/api/auth/register', { username: 'later1', password: 'purple-giraffe-lunch-42' })).status, 200);
});

test('one hunt can only ever take 60 MB of uploaded pictures, and a copy starts clean', async () => {
  const w = createWorld();
  const ann = await register(w, 'ann');
  const ev = await createEvent(ann);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400 * 1024)]).toString('base64'); // about 400 KB
  const up = () => ann.post(`/api/admin/events/${ev.id}/zones/z1/map`, { thumb: png, full: png }); // about 800 KB per upload
  assert.equal((await up()).status, 200);
  const used = (await w.store.getEvent(ev.id)).uploadBytes;
  assert.ok(used > 800 * 1024 && used < 900 * 1024, `counted ${used}`);
  // close to the limit: the next upload does not fit
  await w.store.putEvent({ ...(await w.store.getEvent(ev.id)), uploadBytes: 60 * 1024 * 1024 - 500 * 1024 });
  const before = w.assets.files.size;
  const refused = await up();
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error, 'upload-limit');
  assert.equal(w.assets.files.size, before); // nothing was stored
  // a copy of the hunt starts with a clean count
  const copy = (await ann.post(`/api/admin/events/${ev.id}/duplicate`, { slug: 'fresh-copy', name: 'Fresh' })).body;
  assert.equal((await w.store.getEvent(copy.id)).uploadBytes, 0);
});
