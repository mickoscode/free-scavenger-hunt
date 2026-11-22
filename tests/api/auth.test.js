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

test('wrong passwords lock only the guessing address, so a stranger cannot lock the owner out', async () => {
  const w = createWorld();
  await register(w, 'ann', 'right-password-1');
  const attacker = client(w, '2.2.2.2');
  for (let i = 0; i < 8; i++) assert.equal((await attacker.post('/api/auth/login', { username: 'ann', password: 'wrong-wrong-wrong' })).body.error, 'invalid-login');
  assert.equal((await attacker.post('/api/auth/login', { username: 'ann', password: 'right-password-1' })).status, 429); // even the right one, from there
  assert.equal((await client(w, '2.2.2.3').post('/api/auth/login', { username: 'ann', password: 'right-password-1' })).status, 200); // the owner is fine
  w.advance(16 * 60 * 1000);
  assert.equal((await attacker.post('/api/auth/login', { username: 'ann', password: 'right-password-1' })).status, 200);
});

test('guessing from many addresses is capped per account; successful logins do not count', async () => {
  const w = createWorld();
  await register(w, 'ann', 'right-password-1');
  for (let i = 0; i < 100; i++) await client(w, `9.9.9.${i}`).post('/api/auth/login', { username: 'ann', password: 'right-password-1' }); // 100 good logins
  for (let i = 0; i < 60; i++) await client(w, `8.8.${Math.floor(i / 5)}.${i}`).post('/api/auth/login', { username: 'ann', password: 'wrong-wrong-wrong' });
  assert.equal((await client(w, '6.6.6.6').post('/api/auth/login', { username: 'ann', password: 'right-password-1' })).status, 429);
});

test('registration is limited per address, and can be closed by the site admin', async () => {
  const w = createWorld();
  for (let i = 0; i < 4; i++) assert.equal((await client(w, '3.3.3.3').post('/api/auth/register', { username: `user${i}x`, password: 'long-enough-pass' })).status, 200);
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
  const made = (await a.post('/api/admin/events', { slug: 'anns-hunt', name: 'x' })).body;
  assert.equal((await a.post('/api/auth/delete', { password: 'wrong-password' })).body.error, 'invalid-login');
  assert.equal((await a.post('/api/auth/delete', { password: 'first-password-1' })).status, 200);
  assert.equal((await a.get('/api/auth/me')).body.user, null);
  assert.equal((await client(w).get(`/api/events/${made.org}/anns-hunt/info`)).body.error, 'no-event');
  assert.equal(await w.store.getUser('ann'), null);
  assert.equal((await client(w, '3.3.3.3').post('/api/auth/register', { username: 'ann', password: 'first-password-1' })).status, 200); // the name is free again

  const { name, password } = await seedSiteAdmin(w);
  const boss = client(w, '4.4.4.4');
  await boss.post('/api/auth/login', { username: name, password });
  assert.equal((await boss.post('/api/auth/delete', { password })).status, 400);
});

// ---- recovery codes
const registerWithCodes = async (w, name = 'ann', password = 'first-password-1') => {
  const c = client(w, `7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.9`);
  const r = await c.post('/api/auth/register', { username: name, password });
  return { c, codes: r.body.recoveryCodes, password };
};
const recover = (w, body, ip = '66.6.6.6') => client(w, ip).post('/api/auth/recover', body);

test('registering gives eight one-time codes, shown once; only hashes are stored', async () => {
  const w = createWorld();
  const { c, codes } = await registerWithCodes(w);
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  for (const code of codes) assert.match(code, /^[A-HJKMNP-Z2-9]{5}(-[A-HJKMNP-Z2-9]{5}){3}$/);
  assert.equal((await c.get('/api/auth/me')).body.user.recoveryCodesLeft, 8);
  assert.equal(JSON.stringify((await c.get('/api/auth/me')).body).includes(codes[0]), false); // never sent again
  const stored = JSON.stringify(await w.store.getUser('ann'));
  for (const code of codes) assert.equal(stored.includes(code.replace(/-/g, '')), false); // nothing usable in the database
  assert.equal(stored.includes('recovery'), true);
});

test('a recovery code sets a new password, signs in, ends every other session, and is used up', async () => {
  const w = createWorld();
  const { c: old, codes } = await registerWithCodes(w, 'ann', 'first-password-1');
  const r = await recover(w, { username: 'ann', code: codes[0].toLowerCase().replace(/-/g, ' '), next: 'brand-new-password' }); // forgiving typing
  assert.equal(r.status, 200);
  assert.equal(r.body.user.recoveryCodesLeft, 7);
  assert.equal((await old.get('/api/auth/me')).body.user, null); // the old session ended
  assert.equal((await client(w, '1.1.1.1').post('/api/auth/login', { username: 'ann', password: 'first-password-1' })).body.error, 'invalid-login');
  assert.equal((await client(w, '1.1.1.2').post('/api/auth/login', { username: 'ann', password: 'brand-new-password' })).status, 200);
  assert.equal((await recover(w, { username: 'ann', code: codes[0], next: 'another-new-password' })).body.error, 'invalid-recovery'); // used up
  assert.equal((await recover(w, { username: 'ann', code: codes[1], next: 'another-new-password' })).status, 200); // the others still work
});

test('a wrong code, an unknown user and a code for another account are all the same refusal', async () => {
  const w = createWorld();
  const a = await registerWithCodes(w, 'ann');
  const b = await registerWithCodes(w, 'bob', 'sunny-day-walking-7');
  for (const body of [
    { username: 'ann', code: 'AAAAA-AAAAA-AAAAA-AAAAA', next: 'brand-new-password' },
    { username: 'nobody', code: a.codes[0], next: 'brand-new-password' },
    { username: 'bob', code: a.codes[0], next: 'brand-new-password' }, // ann's code does not open bob's account
    { username: 'ann', code: '', next: 'brand-new-password' },
  ]) {
    const r = await recover(w, body);
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'invalid-recovery');
  }
  assert.equal((await recover(w, { username: 'ann', code: a.codes[0], next: 'short' })).body.error, 'invalid-password');
  assert.equal((await client(w, '2.2.2.2').post('/api/auth/login', { username: 'bob', password: b.password })).status, 200); // bob unaffected
});

test('guessing is rate limited per address and (loosely) per account, and the owner can still recover afterwards', async () => {
  const w = createWorld();
  const { codes } = await registerWithCodes(w, 'ann');
  // one address: 15 tries an hour
  for (let i = 0; i < 15; i++) await recover(w, { username: 'ann', code: 'BBBBB-BBBBB-BBBBB-BBBBB', next: 'brand-new-password' }, '3.3.3.3');
  assert.equal((await recover(w, { username: 'ann', code: codes[0], next: 'brand-new-password' }, '3.3.3.3')).status, 429);
  // many addresses: 40 tries an hour for the account overall, so even a botnet gets nowhere near a 99 bit code
  for (let i = 0; i < 40; i++) await recover(w, { username: 'ann', code: 'BBBBB-BBBBB-BBBBB-BBBBB', next: 'brand-new-password' }, `7.7.${Math.floor(i / 10)}.${i}`);
  assert.equal((await recover(w, { username: 'ann', code: codes[0], next: 'brand-new-password' }, '4.4.4.4')).status, 429);
  w.advance(61 * 60 * 1000);
  assert.equal((await recover(w, { username: 'ann', code: codes[0], next: 'brand-new-password' }, '4.4.4.4')).status, 200);
  const spray = createWorld();
  for (let i = 0; i < 15; i++) await recover(spray, { username: `user${i}x`, code: 'CCCCC-CCCCC-CCCCC-CCCCC', next: 'brand-new-password' }, '5.5.5.5');
  assert.equal((await recover(spray, { username: 'user99', code: 'CCCCC-CCCCC-CCCCC-CCCCC', next: 'brand-new-password' }, '5.5.5.5')).status, 429);
});

test('a suspended account cannot recover its way in', async () => {
  const w = createWorld();
  const { codes } = await registerWithCodes(w, 'ann');
  await w.store.putUser({ ...(await w.store.getUser('ann')), status: 'suspended' });
  assert.equal((await recover(w, { username: 'ann', code: codes[0], next: 'brand-new-password' })).body.error, 'account-suspended');
});

test('new codes replace the old set and need the password', async () => {
  const w = createWorld();
  const { c, codes, password } = await registerWithCodes(w, 'ann');
  assert.equal((await c.post('/api/auth/recovery-codes', { password: 'wrong' })).body.error, 'invalid-login');
  assert.equal((await client(w).post('/api/auth/recovery-codes', { password })).status, 401);
  const fresh = (await c.post('/api/auth/recovery-codes', { password })).body.recoveryCodes;
  assert.equal(fresh.length, 8);
  assert.equal((await recover(w, { username: 'ann', code: codes[0], next: 'brand-new-password' })).body.error, 'invalid-recovery'); // old set is dead
  assert.equal((await recover(w, { username: 'ann', code: fresh[0], next: 'brand-new-password' })).status, 200);
});

test('the owner is told when a code was used or the site admin reset the password, and can dismiss it', async () => {
  const w = createWorld();
  const { codes } = await registerWithCodes(w, 'ann');
  const back = await recover(w, { username: 'ann', code: codes[0], next: 'brand-new-password' });
  const c = client(w, '9.9.9.9');
  await c.post('/api/auth/login', { username: 'ann', password: 'brand-new-password' });
  assert.deepEqual((await c.get('/api/auth/me')).body.user.notices.map((n) => n.type), ['recovery-used']);
  assert.equal(back.body.user.notices[0].at, w.clock.ms);

  const { name, password } = await seedSiteAdmin(w);
  const boss = client(w, '8.8.8.8');
  await boss.post('/api/auth/login', { username: name, password });
  const reset = (await boss.post('/api/site/users/ann/reset-password')).body.password;
  const again = client(w, '9.9.9.8');
  await again.post('/api/auth/login', { username: 'ann', password: reset });
  assert.deepEqual((await again.get('/api/auth/me')).body.user.notices.map((n) => n.type), ['recovery-used', 'admin-reset']);
  await again.post('/api/auth/notices/dismiss');
  assert.deepEqual((await again.get('/api/auth/me')).body.user.notices, []);
});

test('rate limit counters never contain an address', async () => {
  const w = createWorld();
  const seen = [];
  const original = w.store.bumpRate;
  w.store.bumpRate = (key, window) => { seen.push(key); return original(key, window); };
  await client(w, '203.0.113.77').post('/api/auth/register', { username: 'ann', password: 'first-password-1' });
  assert.ok(seen.length > 0);
  assert.equal(seen.some((k) => k.includes('203.0.113.77')), false);
});
