// The site admin: organisers, registration, every hunt.
import { $, el } from './dom.js';
import { deleteJson, getJson, patchJson, postJson, putJson } from './api.js';
import { explain, requireSignedIn } from './admin-shell.js';

const user = await requireSignedIn();
if (user && user.role !== 'site-admin') location.replace('/admin/');
else if (user) {
  const notice = $('#temp-password');

  const act = (label, fn, cls = 'btn-outline-secondary') => {
    const b = el('button', { type: 'button', class: `btn btn-sm ${cls} me-1` }, label);
    b.addEventListener('click', fn);
    return b;
  };

  async function load() {
    const [users, events, settings] = await Promise.all([getJson('/api/site/users'), getJson('/api/admin/events?all=1'), getJson('/api/site/settings')]);
    $('#registration-open').checked = Boolean(settings.body?.registrationOpen);
    $('#users').replaceChildren(...(users.body?.users ?? []).map((u) => {
      const limit = el('input', { type: 'number', min: '0', max: '1000', value: String(u.maxEvents), class: 'form-control form-control-sm limit-input', 'aria-label': `Hunt limit for ${u.name}` });
      limit.addEventListener('change', () => patchJson(`/api/site/users/${u.name}`, { maxEvents: Number(limit.value) }));
      const actions = u.role === 'site-admin' ? [] : [
        act(u.status === 'active' ? 'Suspend' : 'Activate', async () => { await patchJson(`/api/site/users/${u.name}`, { status: u.status === 'active' ? 'suspended' : 'active' }); load(); }),
        act('Reset password', async () => {
          const r = await postJson(`/api/site/users/${u.name}/reset-password`);
          notice.hidden = false;
          notice.textContent = r.ok ? `Temporary password for ${u.name}: ${r.body.password} (shown once; give it to them privately).` : explain(r);
        }),
        act('Delete', async () => {
          if (!confirm(`Delete ${u.name} and ALL of their hunts?`)) return;
          const r = await deleteJson(`/api/site/users/${u.name}`, { confirm: u.name });
          if (!r.ok) alert(explain(r));
          load();
        }, 'btn-outline-danger'),
      ];
      return el('tr', { 'data-testid': 'user-row', 'data-user': u.name },
        el('td', {}, `${u.name}${u.role === 'site-admin' ? ' (site admin)' : ''}`), el('td', {}, String(u.eventCount)),
        el('td', {}, u.role === 'site-admin' ? '' : limit), el('td', {}, u.status), el('td', { class: 'text-end text-nowrap' }, ...actions));
    }));
    $('#all-events').replaceChildren(...(events.body?.events ?? []).map((e) => el('tr', {},
      el('td', {}, el('a', { href: `/admin/event/?id=${e.id}` }, e.name), el('div', { class: 'small text-muted' }, `/e/${e.slug}/`)),
      el('td', {}, e.owner), el('td', {}, e.status), el('td', {}, e.day), el('td', {}, String(e.teamCount)))));
  }

  $('#registration-open').addEventListener('change', (e) => putJson('/api/site/settings', { registrationOpen: e.target.checked }));
  await load();
}
