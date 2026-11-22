// Calls the API. Never throws: a network failure is status 0.
export async function api(method, path, body) {
  try {
    const res = await fetch(path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    return { ok: res.ok, status: res.status, body: data };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}
export const getJson = (p) => api('GET', p);
export const postJson = (p, b = {}) => api('POST', p, b);
export const putJson = (p, b) => api('PUT', p, b);
export const patchJson = (p, b) => api('PATCH', p, b);
export const deleteJson = (p, b = {}) => api('DELETE', p, b);

// The hunt a player page belongs to, from /e/<organiser code>/<hunt>/...
export const eventRef = () => {
  const m = /^\/e\/([a-z2-9]{4})\/([a-z0-9-]+)/.exec(location.pathname);
  return m ? { org: m[1], slug: m[2] } : null;
};
export const eventBase = (ref = eventRef()) => `/api/events/${ref.org}/${ref.slug}`;
export const eventUrl = (ref, rest = '') => `/e/${ref.org}/${ref.slug}/${rest}`;

// The last hunt this browser played (kept on the phone only), so the landing page can offer a way back.
const LAST = 'fsh.lastHunt';
export function rememberHunt(ref, name) {
  try { localStorage.setItem(LAST, JSON.stringify({ ...ref, name, at: Date.now() })); } catch { /* private mode: no shortcut, nothing lost */ }
}
export function recallHunt() {
  try {
    const v = JSON.parse(localStorage.getItem(LAST) ?? 'null');
    return v && /^[a-z2-9]{4}$/.test(v.org) && /^[a-z0-9-]+$/.test(v.slug) && Date.now() - v.at < 3 * 24 * 3600 * 1000 ? v : null;
  } catch { return null; }
}
