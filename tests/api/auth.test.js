import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client, createWorld, register, seedSiteAdmin } from './helpers.js';

test('registering signs in; logout and login work; wrong password is refused', async () => {
  const w = createWorld();
  const c = client(w);
  const r = await c.post('/api/auth/register', { username: 'Ann', password: 'long-enough-pass' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.name, 'ann');
  assert.equal((await c.get('/api/auth/me')).body.user.name, 'ann');
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/auth/me')).body.user, null);
  assert.equal((await c.post('/api/auth/login', { username: 'ann', password: 'wrong-password!!' })).body.error, 'invalid-login');
  assert.equal((await c.post('/api/auth/login', { username: 'ann', password: 'long-enough-pass' })).status, 200);
  assert.equal((await c.post('/api/auth/login', { username: 'nobody', password: 'long-enough-pass' })).body.error, 'invalid-login');
});

test('the session cookie is HttpOnly, Secure and SameSite=Strict, and the API only accepts JSON bodies', async () => {
  const w = createWorld();
  const c = client(w);
  const r = await c.post('/api/auth/register', { username: 'ann', password: 'long-enough-pass' });
  const cookie = r.raw.cookies[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  const form = await w.handle({ method: 'POST', path: '/api/auth/login', headers: { 'content-type': 'text/plain' }, body: '{"username":"ann"}', ip: '1.1.1.1' });
  assert.equal(form.status, 400);
});

test('usernames and passwords are validated; names are unique', async () => {
  const w = createWorld();
  const c = client(w);
  for (const username of ['ab', 'Has Space', 'x'.repeat(31), '-start', 'sh1t']) {
    assert.equal((await c.post('/api/auth/register', { username, password: 'long-enough-pass' })).body.error, 'invalid-username', username);
  }
  assert.equal((await c.post('/api/auth/register', { username: 'ann', password: 'short' })).body.error, 'invalid-password');
  await register(w, 'ann');
  assert.equal((await client(w, '9.9.9.9').post('/api/auth/register', { username: 'ANN', password: 'long-enough-pass' })).body.error, 'username-taken');
});

test('too many wrong passwords lock the account for the window, then it recovers', async () => {
  const w = createWorld();
  await register(w, 'ann', 'right-password-1');
  const c = client(w, '2.2.2.2');
  for (let i = 0; i < 8; i++) await c.post('/api/auth/login', { username: 'ann', password: 'wrong-wrong-wrong' });
  assert.equal((await c.post('/api/auth/login', { username: 'ann', password: 'right-password-1' })).status, 429);
  w.advance(16 * 60 * 1000);
  assert.equal((await c.post('/api/auth/login', { username: 'ann', password: 'right-password-1' })).status, 200);
});

test('registration is limited per address, and can be closed by the site admin', async () => {
  const w = createWorld();
  for (let i = 0; i < 5; i++) assert.equal((await client(w, '3.3.3.3').post('/api/auth/register', { username: `user${i}x`, password: 'long-enough-pass' })).status, 200);
  assert.equal((await client(w, '3.3.3.3').post('/api/auth/register', { username: 'user9x', password: 'long-enough-pass' })).status, 429);

  const { name, password } = await seedSiteAdmin(w);
  const admin = client(w, '4.4.4.4');
  await admin.post('/api/auth/login', { username: name, password });
  assert.equal((await admin.put('/api/site/settings', { registrationOpen: false })).status, 200);
  assert.equal((await client(w, '5.5.5.5').post('/api/auth/register', { username: 'late', password: 'long-enough-pass' })).body.error, 'registration-closed');
  assert.equal((await client(w).get('/api/auth/me')).body.registrationOpen, false);
});

test('changing the password ends other sessions', async () => {
  const w = createWorld();
  const a = await register(w, 'ann', 'first-password-1');
  const other = client(w, '7.7.7.7');
  await other.post('/api/auth/login', { username: 'ann', password: 'first-password-1' });
  assert.equal((await a.post('/api/auth/password', { current: 'first-password-1', next: 'second-password-2' })).status, 200);
  assert.equal((await other.get('/api/auth/me')).body.user, null);
  assert.equal((await a.get('/api/auth/me')).body.user.name, 'ann');
  assert.equal((await a.post('/api/auth/password', { current: 'bad', next: 'third-password-3' })).body.error, 'invalid-login');
});

test('an admin session expires after 12 hours', async () => {
  const w = createWorld();
  const a = await register(w, 'ann');
  w.advance(11 * 3600 * 1000);
  assert.equal((await a.get('/api/admin/events')).status, 200);
  w.advance(2 * 3600 * 1000);
  assert.equal((await a.get('/api/admin/events')).status, 401);
});

test('admin routes need a session; unknown routes and methods are reported', async () => {
  const w = createWorld();
  const c = client(w);
  assert.equal((await c.get('/api/admin/events')).body.error, 'not-authenticated');
  assert.equal((await c.get('/api/site/users')).body.error, 'not-authenticated');
  assert.equal((await c.get('/api/nope')).body.error, 'unknown-route');
  assert.equal((await c.del('/api/auth/me')).status, 405);
});

test('deleting your own account removes your hunts; the site admin cannot be deleted this way', async () => {
  const w = createWorld();
  const a = await register(w, 'ann', 'first-password-1');
  await a.post('/api/admin/events', { slug: 'anns-hunt', name: 'x' });
  assert.equal((await a.post('/api/auth/delete', { password: 'wrong-password' })).body.error, 'invalid-login');
  assert.equal((await a.post('/api/auth/delete', { password: 'first-password-1' })).status, 200);
  assert.equal((await a.get('/api/auth/me')).body.user, null);
  assert.equal((await client(w).get('/api/events/anns-hunt')).body.error, 'no-event');
  assert.equal(await w.store.getUser('ann'), null);
  assert.equal((await client(w, '3.3.3.3').post('/api/auth/register', { username: 'ann', password: 'first-password-1' })).status, 200); // the name is free again

  const { name, password } = await seedSiteAdmin(w);
  const boss = client(w, '4.4.4.4');
  await boss.post('/api/auth/login', { username: name, password });
  assert.equal((await boss.post('/api/auth/delete', { password })).status, 400);
});
