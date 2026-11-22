// Attacks a live deployment (read-only: nothing is created or changed):
//   node scripts/security-probe.js https://xxxx.cloudfront.net [https://<api-id>.execute-api.<region>.amazonaws.com]
// The second address is the raw API Gateway address (see the Terraform output or the build logs): it must refuse everything.
import assert from 'node:assert/strict';
import https from 'node:https';

const site = (process.argv[2] ?? '').replace(/\/+$/, '');
const direct = (process.argv[3] ?? '').replace(/\/+$/, '');
if (!site) { console.error('usage: node scripts/security-probe.js <site url> [raw api url]'); process.exit(2); }

const get = (url, init) => fetch(url, { redirect: 'manual', ...init });
// fetch() rewrites paths like /a/%2e%2e/b before sending; this sends the path exactly as written.
const raw = (path) => new Promise((resolve, reject) => {
  https.get({ host: new URL(site).host, path }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
});
let n = 0;
const check = async (name, fn) => { await fn(); console.log(`ok ${++n} - ${name}`); };

await check('security headers on successful pages and API responses (added by the CloudFront function)', async () => {
  for (const path of ['/', '/admin/', '/e/abcd/some-hunt/', '/api/auth/me']) {
    const r = await get(site + path);
    const h = r.headers;
    assert.match(h.get('content-security-policy') ?? '', /default-src 'none'.*script-src 'self'.*frame-ancestors 'none'/, `${path} CSP`);
    assert.equal(h.get('x-content-type-options'), 'nosniff', `${path} nosniff`);
    assert.equal(h.get('x-frame-options'), 'DENY', `${path} frame`);
    assert.match(h.get('strict-transport-security') ?? '', /max-age=\d{7,}/, `${path} HSTS`);
    assert.match(h.get('permissions-policy') ?? '', /camera=\(\)/, `${path} permissions`);
  }
});
await check('API error responses carry their own security headers (CloudFront adds none to errors)', async () => {
  for (const path of ['/api/events/abcd/none/info', '/api/events/abcd/none', '/api/admin/events', '/api/nope']) {
    const r = await get(site + path);
    assert.ok(r.status >= 400, path);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', `${path} nosniff`);
    assert.equal(r.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'", `${path} CSP`);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', `${path} frame`);
  }
});
await check('the 404 page carries its own content security policy and no script', async () => {
  const r = await get(site + '/definitely-not-a-page.html');
  assert.equal(r.status, 404);
  const html = await r.text();
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.doesNotMatch(html, /<script/i);
});
await check('plain http is redirected to https', async () => {
  const r = await get(site.replace('https://', 'http://') + '/');
  assert.ok([301, 302, 307, 308].includes(r.status) && r.headers.get('location').startsWith('https://'));
});
await check('admin and site APIs refuse anonymous callers', async () => {
  for (const p of ['/api/admin/events', '/api/admin/events/abc', '/api/site/users', '/api/site/settings']) assert.equal((await get(site + p)).status, 401, p);
});
await check('state-changing calls need JSON (no cross-site form posts) and sends no CORS permission', async () => {
  const form = await get(site + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=a&password=b' });
  assert.equal(form.status, 400);
  const pre = await get(site + '/api/auth/login', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
});
await check('traversal and malformed paths are refused', async () => {
  for (const p of ['/assets/%2e%2e/%2e%2e/etc/passwd', '/assets/../../etc/passwd', '/api/events/%ZZ', '/api/%00', '/e/%2e%2e%2fadmin/', '/api/events/..%2f..%2fadmin']) {
    const status = await raw(p);
    assert.ok([400, 404].includes(status), `${p} -> ${status}`);
  }
});
await check('error responses reveal nothing about the stack', async () => {
  const r = await get(site + '/api/nope');
  const text = await r.text();
  assert.doesNotMatch(text, /at .*\.js|node_modules|arn:aws|stack/i);
});
if (direct) {
  await check('the raw API address refuses every call, even with a forged client address', async () => {
    for (const [method, path] of [['GET', '/api/auth/me'], ['GET', '/api/events/abcd/anything/info'], ['POST', '/api/auth/login']]) {
      const r = await get(direct + path, { method, headers: { 'x-forwarded-for': '1.2.3.4', 'content-type': 'application/json', 'x-origin-verify': 'guess' }, body: method === 'POST' ? '{}' : undefined });
      assert.equal(r.status, 400, `${method} ${path}`);
      assert.equal((await r.json()).error, 'unknown-route');
    }
  });
}
console.log('security probe passed');
