// The site admin: users, site settings. Everything here needs the site-admin role.
import { requireSiteAdmin } from './context.js';
import { fail, json } from './http.js';
import { hashPassword, temporaryPassword } from './lib/passwords.js';
import { addNotice } from './routes-auth.js';

const publicUser = (u, eventCount) => ({ name: u.name, role: u.role, status: u.status, maxEvents: u.maxEvents, createdAt: u.createdAt, eventCount });

export function siteRoutes(router, ctx) {
  const { store, assets } = ctx;
  const loadUser = async (req) => {
    await requireSiteAdmin(ctx, req);
    return (await store.getUser(req.params.name)) ?? fail(400, 'no-user');
  };

  router.get('/api/site/users', async (req) => {
    await requireSiteAdmin(ctx, req);
    const [users, events] = await Promise.all([store.listUsers(), store.listEvents()]);
    return json(200, { users: users.map((u) => publicUser(u, events.filter((e) => e.owner === u.name).length)) });
  });

  router.patch('/api/site/users/:name', async (req) => {
    const user = await loadUser(req);
    const { status, maxEvents } = req.body ?? {};
    const next = { ...user };
    if (status !== undefined) {
      if (!['active', 'suspended'].includes(status) || user.role === 'site-admin') fail(400, 'invalid-request');
      next.status = status;
    }
    if (maxEvents !== undefined) {
      if (!Number.isInteger(maxEvents) || maxEvents < 0 || maxEvents > 1000) fail(400, 'invalid-request');
      next.maxEvents = maxEvents;
    }
    await store.putUser(next);
    return json(200, { user: publicUser(next, 0) });
  });

  // Sets a new temporary password (shown once) and ends the user's sessions.
  router.post('/api/site/users/:name/reset-password', async (req) => {
    const user = await loadUser(req);
    const password = temporaryPassword();
    // The owner is told on their next visit, so a reset can never go unnoticed.
    await store.putUser({ ...user, passwordHash: await hashPassword(password), sessionGen: (user.sessionGen ?? 0) + 1, notices: addNotice(user, 'admin-reset', ctx.now()) });
    return json(200, { password });
  });

  router.delete('/api/site/users/:name', async (req) => {
    const user = await loadUser(req);
    if (user.role === 'site-admin' || req.body?.confirm !== user.name) fail(400, 'invalid-request');
    for (const e of await store.listEventsByOwner(user.name)) {
      await assets.deletePrefix(`assets/${e.id}/`);
      await store.deleteEvent(e.id);
    }
    await store.deleteUser(user.name);
    return json(200, { ok: true });
  });

  router.get('/api/site/settings', async (req) => {
    await requireSiteAdmin(ctx, req);
    return json(200, await store.getSettings());
  });

  router.put('/api/site/settings', async (req) => {
    await requireSiteAdmin(ctx, req);
    if (typeof req.body?.registrationOpen !== 'boolean') fail(400, 'invalid-request');
    const settings = { ...(await store.getSettings()), registrationOpen: req.body.registrationOpen };
    await store.putSettings(settings);
    return json(200, settings);
  });
}
