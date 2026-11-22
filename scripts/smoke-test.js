// Read-mostly checks of a deployed site: node scripts/smoke-test.js https://xxxx.cloudfront.net
// Pages and headers, the API through CloudFront, then a complete hunt (register, build, join, answer, delete) with a throwaway
// account that deletes itself at the end, so nothing is left behind.
import assert from 'node:assert/strict';

const base = (process.argv[2] ?? process.env.SITE_URL ?? '').replace(/\/+$/, '');
if (!base) { console.error('usage: node scripts/smoke-test.js <site url>'); process.exit(2); }

const jar = new Map();
async function call(method, path, body, who = jar) {
  const res = await fetch(base + path, {
    method, redirect: 'manual',
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(who.size ? { cookie: [...who].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair, ...attrs] = c.split('; ');
    const [k, ...v] = pair.split('=');
    if (attrs.includes('Max-Age=0')) who.delete(k); else who.set(k, v.join('='));
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, headers: res.headers, text, json };
}
const retry = async (fn, tries = 8) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= tries) throw e; await new Promise((r) => setTimeout(r, 4000)); } } };
let step = 0;
const check = async (name, fn) => { step += 1; await fn(); console.log(`ok ${step} - ${name}`); };

// The deploy may still be reaching every edge location: retry the first check.
await check('home page is served with security headers', () => retry(async () => {
  const r = await call('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.text, /Free Scavenger Hunt/);
  assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
}));
await check('hunt and admin addresses are rewritten to their pages', async () => {
  assert.match((await call('GET', '/e/smoke-no-such-hunt/')).text, /data-testid="view-page"/);
  assert.match((await call('GET', '/admin/')).text, /Organiser sign in/);
  assert.equal((await call('GET', '/e/smoke-no-such-hunt')).status, 301);
  assert.equal((await call('GET', '/definitely-not-a-page.html')).status, 404);
});
await check('the API answers through CloudFront (Lambda and DynamoDB are wired up)', () => retry(async () => {
  const r = await call('GET', '/api/events/smoke-no-such-hunt/info');
  assert.equal(r.status, 400, r.text);
  assert.equal(r.json.error, 'no-event');
  assert.equal((await call('GET', '/api/auth/me')).json.user, null);
  assert.equal((await call('GET', '/api/admin/events')).status, 401);
}));

const user = `smoke-${Math.random().toString(36).slice(2, 10)}`;
const password = `smoke-${Math.random().toString(36).slice(2)}-pw`;
const slug = `${user}-hunt`;
let cleaned = false;
let recoveryCodes = [];
// A forgotten password is recovered with a recovery code (once), the old session ends, and the account is then deleted.
async function cleanupOther(other, name) {
  assert.equal(recoveryCodes.length, 8);
  const fresh = new Map();
  const next = `${password}-new`;
  const rec = await call('POST', '/api/auth/recover', { username: name, code: recoveryCodes[0], next }, fresh);
  assert.equal(rec.status, 200, rec.text);
  assert.equal(rec.json.user.recoveryCodesLeft, 7);
  assert.equal((await call('GET', '/api/auth/me', undefined, other)).json.user, null); // the old session ended
  assert.equal((await call('POST', '/api/auth/recover', { username: name, code: recoveryCodes[0], next }, new Map())).json.error, 'invalid-recovery'); // single use
  assert.equal((await call('POST', '/api/auth/delete', { password: next }, fresh)).status, 200);
}
try {
  await check('an organiser can register', async () => {
    const r = await call('POST', '/api/auth/register', { username: user, password });
    assert.equal(r.status, 200, r.text);
    assert.match((await call('GET', '/api/auth/me')).text, new RegExp(user));
  });
  let id;
  await check('an organiser can build a hunt', async () => {
    const created = await call('POST', '/api/admin/events', { slug, name: 'Smoke test hunt', timeZone: 'UTC' });
    assert.equal(created.status, 200, created.text);
    id = created.json.id;
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const hm = (d) => d.toISOString().slice(11, 16);
    // A window that contains now (the day may roll over within it: only the common case is checked).
    const start = hm(new Date(now.getTime() - 5 * 60_000));
    const end = hm(new Date(now.getTime() + 20 * 60_000));
    assert.ok(start < end, 'run the smoke test away from midnight UTC');
    const cfg = await call('PUT', `/api/admin/events/${id}/config`, { name: 'Smoke test hunt', timeZone: 'UTC', day, start, end, teamNames: true, joinCode: '', whatsappUrl: '' });
    assert.equal(cfg.status, 200, cfg.text);
    const content = await call('PUT', `/api/admin/events/${id}/content`, { instructions: '# Hi', zones: [{ id: 'z1', name: 'Zone', map: null, questions: [{ id: 'q1', type: 'whole-number', text: 'Two plus two?', answers: ['4'], score: 5 }] }] });
    assert.equal(content.status, 200, content.text);
  });
  const team = new Map();
  await check('a team can join, play and appear on the scoreboard', async () => {
    const joined = await call('POST', `/api/events/${slug}/join`, { name: 'Smoke Team' }, team);
    assert.equal(joined.status, 200, joined.text);
    const play = await call('GET', `/api/events/${slug}/play`, undefined, team);
    assert.equal(play.json.zones.length, 1);
    assert.ok(!play.text.includes('"answers"'), 'answers must never reach a player');
    assert.equal((await call('POST', `/api/events/${slug}/answer`, { zone: 'z1', question: 'q1', answer: '4' }, team)).status, 200);
    assert.equal((await call('POST', `/api/events/${slug}/answer`, { zone: 'z1', question: 'q1', answer: '4' }, team)).json.error, 'already-submitted');
    const board = await retry(async () => {
      const b = await call('GET', `/api/events/${slug}/scoreboard`);
      assert.equal(b.json.teams[0]?.score, 5);
      return b;
    });
    assert.equal(board.json.teams[0].name, 'Smoke Team');
    assert.equal(board.json.resultsPublished, false);
  });
  await check('another organiser cannot see this hunt, and a forgotten password is recoverable with a code, once', async () => {
    const other = new Map();
    const name = `${user}-b`.slice(0, 30);
    const reg = await call('POST', '/api/auth/register', { username: name, password }, other);
    assert.equal(reg.status, 200, reg.text);
    recoveryCodes = reg.json.recoveryCodes;
    assert.equal((await call('GET', `/api/admin/events/${id}`, undefined, other)).json.error, 'no-event');
    await cleanupOther(other, name);
  });
} finally {
  const r = await call('POST', '/api/auth/delete', { password });
  cleaned = r.status === 200;
}
await check('the throwaway account and its hunt were deleted', async () => {
  assert.ok(cleaned);
  assert.equal((await call('GET', `/api/events/${slug}`)).json.error, 'no-event');
});
console.log('smoke test passed');
