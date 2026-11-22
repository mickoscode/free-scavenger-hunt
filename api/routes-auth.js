// Accounts: registration, login, logout, password. Usernames, no email: nothing personal is stored.
import { ADMIN_COOKIE, clientIp, cookiesOf, currentUser, requireUser, startAdminSession } from './context.js';
import { cookie, fail, json } from './http.js';
import { hashPassword, sha256, verifyPassword } from './lib/passwords.js';
import { isBlocked } from './lib/teams.js';

const USERNAME = /^[a-z0-9][a-z0-9_-]{2,29}$/;
export const DEFAULT_MAX_EVENTS = 5;
const publicUser = (u) => ({ name: u.name, role: u.role, maxEvents: u.maxEvents });

// A fixed hash to compare against when the user does not exist, so the time taken does not reveal which names exist.
const dummyHash = hashPassword('not-a-real-password');

export function authRoutes(router, ctx) {
  const { store, assets } = ctx;

  router.post('/api/auth/register', async (req) => {
    const settings = await store.getSettings();
    if (!settings.registrationOpen) fail(409, 'registration-closed');
    const { username, password } = req.body ?? {};
    const name = typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!USERNAME.test(name) || isBlocked(name)) fail(400, 'invalid-username');
    if (typeof password !== 'string' || password.length < 10 || password.length > 200) fail(400, 'invalid-password');
    if ((await store.bumpRate(`reg-ip#${clientIp(req)}`, 3600)) > 5 || (await store.bumpRate('reg-all', 3600)) > 60) fail(429, 'too-many-requests');
    const user = {
      name, role: 'event-admin', status: 'active', maxEvents: DEFAULT_MAX_EVENTS, sessionGen: 0,
      passwordHash: await hashPassword(password), createdAt: ctx.now(),
    };
    if (!(await store.createUser(user))) fail(409, 'username-taken');
    return json(200, { user: publicUser(user) }, { cookies: [await startAdminSession(ctx, user)] });
  });

  router.post('/api/auth/login', async (req) => {
    const { username, password } = req.body ?? {};
    const name = typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!USERNAME.test(name) || typeof password !== 'string' || password.length > 200) fail(400, 'invalid-login');
    if ((await store.bumpRate(`login#${name}`, 900)) > 8) fail(429, 'too-many-requests');
    const user = await store.getUser(name);
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) fail(400, 'invalid-login');
    if (user.status !== 'active') fail(409, 'account-suspended');
    return json(200, { user: publicUser(user) }, { cookies: [await startAdminSession(ctx, user)] });
  });

  router.post('/api/auth/logout', async (req) => {
    const token = cookiesOf(req)[ADMIN_COOKIE];
    if (token) await store.deleteSession(sha256(token));
    return json(200, { ok: true }, { cookies: [cookie(ADMIN_COOKIE, '', { maxAge: 0 })] });
  });

  router.get('/api/auth/me', async (req) => {
    const user = await currentUser(ctx, req);
    const settings = await store.getSettings();
    return json(200, { user: user ? publicUser(user) : null, registrationOpen: settings.registrationOpen });
  });

  // Changing the password ends every other session of the account.
  router.post('/api/auth/password', async (req) => {
    const user = await requireUser(ctx, req);
    const { current, next } = req.body ?? {};
    if (typeof next !== 'string' || next.length < 10 || next.length > 200) fail(400, 'invalid-password');
    if (typeof current !== 'string' || !(await verifyPassword(current, user.passwordHash))) fail(400, 'invalid-login');
    const updated = { ...user, passwordHash: await hashPassword(next), sessionGen: (user.sessionGen ?? 0) + 1 };
    await store.putUser(updated);
    return json(200, { ok: true }, { cookies: [await startAdminSession(ctx, updated)] });
  });

  // Deleting your own account removes your hunts too (maps, teams, scores). The site admin account cannot be deleted this way.
  router.post('/api/auth/delete', async (req) => {
    const user = await requireUser(ctx, req);
    if (user.role === 'site-admin') fail(400, 'invalid-request');
    if (typeof req.body?.password !== 'string' || !(await verifyPassword(req.body.password, user.passwordHash))) fail(400, 'invalid-login');
    for (const e of await store.listEventsByOwner(user.name)) {
      await assets.deletePrefix(`assets/${e.id}/`);
      await store.deleteEvent(e.id);
    }
    await store.deleteUser(user.name);
    return json(200, { ok: true }, { cookies: [cookie(ADMIN_COOKIE, '', { maxAge: 0 })] });
  });
}
