// Test harness: an app on the in-memory store with a clock the test controls, and a client that keeps cookies.
import { createApp } from '../../api/app.js';
import { createMemoryAssets } from '../../api/assets.js';
import { createMemoryStore } from '../../api/store/memory.js';
import { hashPassword } from '../../api/lib/passwords.js';

export const T0 = Date.UTC(2026, 10, 14, 0, 0, 0); // 2026-11-14 00:00 UTC = 08:00 in Perth

export function createWorld(startMs = T0) {
  const clock = { ms: startMs };
  const now = () => clock.ms;
  const store = createMemoryStore(now);
  const assets = createMemoryAssets();
  const handle = createApp({ store, assets, now });
  return { clock, store, assets, handle, advance: (ms) => { clock.ms += ms; }, set: (ms) => { clock.ms = ms; } };
}

export function client(world, ip = '10.0.0.1') {
  const jar = new Map();
  async function call(method, path, body, headers = {}) {
    const url = new URL(path, 'http://x');
    const res = await world.handle({
      method, path: url.pathname, query: Object.fromEntries(url.searchParams),
      headers: { 'content-type': 'application/json', ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), ip,
    });
    for (const c of res.cookies) {
      const [pair, ...attrs] = c.split('; ');
      const [k, ...v] = pair.split('=');
      if (attrs.some((a) => a === 'Max-Age=0')) jar.delete(k); else jar.set(k, v.join('='));
    }
    return { status: res.status, body: JSON.parse(res.body), headers: res.headers, raw: res };
  }
  return {
    jar, call,
    get: (p) => call('GET', p), post: (p, b = {}) => call('POST', p, b), put: (p, b) => call('PUT', p, b),
    patch: (p, b) => call('PATCH', p, b), del: (p, b = {}) => call('DELETE', p, b),
  };
}

export async function seedSiteAdmin(world, name = 'siteadmin', password = 'correct-horse-battery') {
  await world.store.createUser({ name, role: 'site-admin', status: 'active', maxEvents: 1000, sessionGen: 0, passwordHash: await hashPassword(password), createdAt: world.clock.ms });
  return { name, password };
}

export async function register(world, name, password = 'a-long-password-123', ip) {
  const c = client(world, ip ?? `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`);
  const r = await c.post('/api/auth/register', { username: name, password });
  if (r.status !== 200) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
  return c;
}

// A small event: zone "Beach" (a string question, a decimal, a photo) and zone "Park" (a whole number).
export const sampleContent = (maps = {}) => ({
  instructions: '# How to play\n\n- Work in your team\n- Send photos to WhatsApp',
  zones: [
    { id: 'z1', name: 'Beach', map: maps.z1 ?? null, questions: [
      { id: 'q1', type: 'string', text: 'What colour is the lifeguard tower?', answers: ['red', 'crimson'], score: 10 },
      { id: 'q2', type: 'decimal', text: 'How long is the jetty in km?', answers: ['2.5'], score: 20 },
      { id: 'q3', type: 'photo', text: 'Photo of your team with the lifeguard tower', answers: [], score: 30 },
    ] },
    { id: 'z2', name: 'Park', map: null, questions: [
      { id: 'q1', type: 'whole-number', text: 'How many swings?', answers: ['6'], score: 5 },
    ] },
  ],
});

// Creates an event for an admin client: games run 2026-11-14 09:00-12:00 Perth (01:00-04:00 UTC).
export async function createEvent(admin, { slug = 'beach-hunt', content = sampleContent(), config = {} } = {}) {
  const created = await admin.post('/api/admin/events', { slug, name: 'Beach Hunt', timeZone: 'Australia/Perth' });
  if (created.status !== 200) throw new Error(`create failed: ${JSON.stringify(created.body)}`);
  const { id } = created.body;
  const cfg = await admin.put(`/api/admin/events/${id}/config`, {
    name: 'Beach Hunt', timeZone: 'Australia/Perth', day: '2026-11-14', start: '09:00', end: '12:00', teamNames: true, joinCode: '', whatsappUrl: '', ...config,
  });
  if (cfg.status !== 200) throw new Error(`config failed: ${JSON.stringify(cfg.body)}`);
  const saved = await admin.put(`/api/admin/events/${id}/content`, content);
  if (saved.status !== 200) throw new Error(`content failed: ${JSON.stringify(saved.body)}`);
  return { id, slug };
}

export const GAME_START = Date.UTC(2026, 10, 14, 1, 0, 0);
export const GAME_END = Date.UTC(2026, 10, 14, 4, 0, 0);
