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

// The event slug from /e/<slug>/...
export const eventSlug = () => /^\/e\/([a-z0-9-]+)/.exec(location.pathname)?.[1] ?? null;
export const eventBase = (slug = eventSlug()) => `/api/events/${slug}`;
export const eventUrl = (slug, rest = '') => `/e/${slug}/${rest}`;
