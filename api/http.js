// Tiny HTTP helpers: a router, JSON responses, cookies. Error codes are strings; statuses avoid 403 and 404 because
// CloudFront replaces those with the site's 404 page (wrong state is 409, unknown references 400).
export class HttpError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
export const fail = (status, code, extra) => { throw new HttpError(status, code, extra); };

export function createRouter() {
  const routes = [];
  const add = (method) => (pattern, handler) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:([a-z]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
    routes.push({ method, re, keys, handler, pattern });
  };
  return {
    get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE'),
    match(method, path) {
      for (const r of routes) {
        const m = r.re.exec(path);
        if (!m || r.method !== method) continue;
        try {
          return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
        } catch {
          return null; // a malformed %-escape is just an unknown route
        }
      }
      return null;
    },
    list: () => routes.map((r) => ({ method: r.method, pattern: r.pattern })),
    knows: (path) => routes.some((r) => r.re.test(path)),
  };
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export const cookie = (name, value, { maxAge, path = '/api' } = {}) =>
  `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Strict${maxAge === undefined ? '' : `; Max-Age=${maxAge}`}`;

// cache: seconds a CloudFront edge may reuse a public response (never for anything cookie dependent).
export function json(status, body, { cookies = [], cache = 0 } = {}) {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache > 0 ? `public, s-maxage=${cache}, max-age=0` : 'no-store',
      // On every API response, errors included: CloudFront Functions do not run on error responses, so the CDN cannot be relied on
      // to add these to a 400 or 429. (The strictest policy: an API response is data, never a page.)
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'x-frame-options': 'DENY',
      'referrer-policy': 'same-origin',
      'strict-transport-security': 'max-age=31536000',
    },
    cookies,
    body: JSON.stringify(body),
  };
}
