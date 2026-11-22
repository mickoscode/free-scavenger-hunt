// Accounts: registration, login, logout, password, recovery codes. Usernames, no email: nothing personal is stored.
//
// Recovery without anybody's help (and without personal data): at registration an organiser gets 8 one-time recovery
// codes, shown once. Only hashes are stored. Forgetting the password, they sign in again with username + a code and
// choose a new password. Using a code ends every session and leaves a notice on the account.
import { ADMIN_COOKIE, clientKey, cookiesOf, currentUser, orgCodeFor, requireUser, startAdminSession } from './context.js';
import { cookie, fail, json } from './http.js';
import { hashPassword, hashRecoveryCode, isReservedUsername, newRecoverySet, passwordProblem, safeEqual, sha256, verifyPassword } from './lib/passwords.js';
import { isBlocked } from './lib/teams.js';
import { isTimeZone } from './lib/time.js';
import { createDemoHunt } from './demo/create.js';

const USERNAME = /^[a-z0-9][a-z0-9_-]{2,29}$/;
export const DEFAULT_MAX_EVENTS = 4; // the starter demo hunt plus three of their own
const MAX_NOTICES = 5;

// What a signed in user may know about their own account. Never the hashes.
const publicUser = (u) => ({
  name: u.name, code: u.code ?? null, role: u.role, maxEvents: u.maxEvents,
  recoveryCodesLeft: (u.recovery ?? []).length, notices: u.notices ?? [],
});
export const addNotice = (user, type, at) => [...(user.notices ?? []), { type, at }].slice(-MAX_NOTICES);

// A fixed hash to compare against when the user does not exist, so the time taken does not reveal which names exist.
const dummyHash = hashPassword('not-a-real-password');

export function authRoutes(router, ctx) {
  const { store, assets } = ctx;

  router.post('/api/auth/register', async (req) => {
    const settings = await store.getSettings();
    if (!settings.registrationOpen) fail(409, 'registration-closed');
    const { username, password, timeZone } = req.body ?? {};
    const name = typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!USERNAME.test(name) || isBlocked(name) || isReservedUsername(name)) fail(400, 'invalid-username');
    const weak = passwordProblem(password, name);
    if (weak) fail(400, weak);
    if ((await store.bumpRate(`reg-ip#${clientKey(req)}`, 3600)) > 4 || (await store.bumpRate('reg-all', 3600)) > 30) fail(429, 'too-many-requests');
    const recovery = newRecoverySet(name);
    const user = {
      name, role: 'event-admin', status: 'active', maxEvents: DEFAULT_MAX_EVENTS, sessionGen: 0,
      passwordHash: await hashPassword(password), recovery: recovery.hashes, notices: [], createdAt: ctx.now(),
    };
    if (!(await store.createUser(user))) fail(409, 'username-taken');
    const org = await orgCodeFor(ctx, user);
    // A starter hunt, so there is something to play straight away (and to copy as a template). Its time zone is the browser's.
    await createDemoHunt(ctx, user, org, isTimeZone(timeZone) ? timeZone : undefined);
    return json(200, { user: publicUser(user), recoveryCodes: recovery.codes }, { cookies: [await startAdminSession(ctx, user)] });
  });

  router.post('/api/auth/login', async (req) => {
    const { username, password } = req.body ?? {};
    const name = typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!USERNAME.test(name) || typeof password !== 'string' || password.length > 200) fail(400, 'invalid-login');
    // Only FAILURES count. Per account and address (so a stranger cannot lock the real owner out from elsewhere) and, much more
    // loosely, per account overall (so guessing from many addresses is still hopeless).
    const here = `login#${name}#${clientKey(req)}`;
    if ((await store.getRate(here, 900)) >= 8 || (await store.getRate(`login#${name}`, 3600)) >= 60) fail(429, 'too-many-requests');
    const user = await store.getUser(name);
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) {
      await store.bumpRate(here, 900);
      await store.bumpRate(`login#${name}`, 3600);
      fail(400, 'invalid-login');
    }
    if (user.status !== 'active') fail(409, 'account-suspended');
    await orgCodeFor(ctx, user);
    return json(200, { user: publicUser(user) }, { cookies: [await startAdminSession(ctx, user)] });
  });

  // Forgot the password: username + one recovery code + a new password. The code is used up, every session ends, the account
  // gets a notice the owner sees on the next visit. Guessing is hopeless (about 99 bits) and rate limited anyway.
  router.post('/api/auth/recover', async (req) => {
    const { username, code, next } = req.body ?? {};
    const name = typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!USERNAME.test(name) || typeof code !== 'string' || code.length > 60) fail(400, 'invalid-recovery');
    const weak = passwordProblem(next, name);
    if (weak) fail(400, weak);
    // Guessing a 99 bit code is hopeless; these limits only stop noise. Per address tight, per account loose (so a stranger
    // cannot block the real owner from recovering).
    if ((await store.bumpRate(`recover-ip#${clientKey(req)}`, 3600)) > 15 || (await store.bumpRate(`recover#${name}`, 3600)) > 40) fail(429, 'too-many-requests');
    const user = await store.getUser(name);
    // Compare against every stored hash, whatever matches (no early exit), so timing says nothing.
    const given = hashRecoveryCode(name, code);
    let matched = -1;
    (user?.recovery ?? []).forEach((h, i) => { if (safeEqual(h, given)) matched = i; });
    if (!user || matched === -1) fail(400, 'invalid-recovery');
    if (user.status !== 'active') fail(409, 'account-suspended');
    const updated = {
      ...user,
      passwordHash: await hashPassword(next),
      recovery: user.recovery.filter((_, i) => i !== matched),
      sessionGen: (user.sessionGen ?? 0) + 1,
      notices: addNotice(user, 'recovery-used', ctx.now()),
    };
    // Single use even when two requests arrive together: only the first to save wins.
    if (!(await store.updateUserIf(updated, user.sessionGen ?? 0))) fail(400, 'invalid-recovery');
    return json(200, { user: publicUser(updated) }, { cookies: [await startAdminSession(ctx, updated)] });
  });

  // A fresh set of codes (the old ones stop working). Needs the password again. The new codes are shown once.
  router.post('/api/auth/recovery-codes', async (req) => {
    const user = await requireUser(ctx, req);
    if ((await store.bumpRate(`password#${user.name}`, 900)) > 10) fail(429, 'too-many-requests');
    if (typeof req.body?.password !== 'string' || !(await verifyPassword(req.body.password, user.passwordHash))) fail(400, 'invalid-login');
    if ((await store.bumpRate(`recovery-codes#${user.name}`, 3600)) > 5) fail(429, 'too-many-requests');
    const recovery = newRecoverySet(user.name);
    await store.putUser({ ...user, recovery: recovery.hashes });
    return json(200, { recoveryCodes: recovery.codes });
  });

  router.post('/api/auth/notices/dismiss', async (req) => {
    const user = await requireUser(ctx, req);
    await store.putUser({ ...user, notices: [] });
    return json(200, { ok: true });
  });

  router.post('/api/auth/logout', async (req) => {
    const token = cookiesOf(req)[ADMIN_COOKIE];
    if (token) await store.deleteSession(sha256(token));
    return json(200, { ok: true }, { cookies: [cookie(ADMIN_COOKIE, '', { maxAge: 0 })] });
  });

  router.get('/api/auth/me', async (req) => {
    const user = await currentUser(ctx, req);
    if (user) await orgCodeFor(ctx, user);
    const settings = await store.getSettings();
    return json(200, { user: user ? publicUser(user) : null, registrationOpen: settings.registrationOpen });
  });

  // Changing the password ends every other session of the account.
  router.post('/api/auth/password', async (req) => {
    const user = await requireUser(ctx, req);
    const { current, next } = req.body ?? {};
    const weak = passwordProblem(next, user.name);
    if (weak) fail(400, weak);
    if ((await store.bumpRate(`password#${user.name}`, 900)) > 10) fail(429, 'too-many-requests');
    if (typeof current !== 'string' || !(await verifyPassword(current, user.passwordHash))) fail(400, 'invalid-login');
    const updated = { ...user, passwordHash: await hashPassword(next), sessionGen: (user.sessionGen ?? 0) + 1 };
    if (!(await store.updateUserIf(updated, user.sessionGen ?? 0))) fail(409, 'try-again');
    return json(200, { ok: true }, { cookies: [await startAdminSession(ctx, updated)] });
  });

  // Deleting your own account removes your hunts too (maps, teams, scores). The site admin account cannot be deleted this way.
  router.post('/api/auth/delete', async (req) => {
    const user = await requireUser(ctx, req);
    if (user.role === 'site-admin') fail(400, 'invalid-request');
    if ((await store.bumpRate(`password#${user.name}`, 900)) > 10) fail(429, 'too-many-requests');
    if (typeof req.body?.password !== 'string' || !(await verifyPassword(req.body.password, user.passwordHash))) fail(400, 'invalid-login');
    for (const e of await store.listEventsByOwner(user.name)) {
      await assets.deletePrefix(`assets/${e.id}/`);
      await store.deleteEvent(e.id);
    }
    await store.deleteUser(user.name);
    return json(200, { ok: true }, { cookies: [cookie(ADMIN_COOKIE, '', { maxAge: 0 })] });
  });
}
