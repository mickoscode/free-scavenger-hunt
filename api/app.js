// The API: routing, JSON parsing, error mapping. No AWS here: the store and assets are passed in, so the same code runs in
// Lambda, in the local dev server and in tests (with a clock the test controls).
import { fail, HttpError, createRouter, json } from './http.js';
import { safeEqual } from './lib/passwords.js';
import { adminRoutes } from './routes-admin.js';
import { authRoutes } from './routes-auth.js';
import { publicRoutes } from './routes-public.js';
import { siteRoutes } from './routes-site.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

// req: { method, path, query, headers (lower case), body (string|undefined), ip }.
// originSecret: when set, only requests carrying it in x-origin-verify are served. CloudFront adds it to every request it sends to
// the API, so the API cannot be used directly (which would let a caller forge their address and slip past the rate limits).
export function createApp({ store, assets, now = Date.now, originSecret = '' }) {
  const ctx = { store, assets, now };
  const router = createRouter();
  authRoutes(router, ctx);
  publicRoutes(router, ctx);
  adminRoutes(router, ctx);
  siteRoutes(router, ctx);

  async function handle(req) {
    try {
      if (originSecret && !safeEqual(req.headers['x-origin-verify'] ?? '', originSecret)) return json(400, { error: 'unknown-route' });
      try { decodeURIComponent(req.path); } catch { return json(400, { error: 'unknown-route' }); } // a malformed %-escape
      const found = router.match(req.method, req.path);
      if (!found) return router.knows(req.path) ? json(405, { error: 'method-not-allowed' }) : json(400, { error: 'unknown-route' });
      let body;
      if (req.method !== 'GET' && req.body) {
        if (req.body.length > MAX_BODY_BYTES) fail(400, 'too-large');
        if (!/^application\/json/i.test(req.headers['content-type'] ?? '')) fail(400, 'json-required'); // also a CSRF guard
        try { body = JSON.parse(req.body); } catch { fail(400, 'invalid-json'); }
      }
      return await found.handler({ ...req, params: found.params, body, query: req.query ?? {} });
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.code, ...e.extra });
      console.error('unhandled', e);
      return json(500, { error: 'server-error' });
    }
  }
  handle.routes = router.list();
  return handle;
}
