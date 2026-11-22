// Organiser sign in / registration and the list of hunts.
import { $, el } from './dom.js';
import { getJson, postJson } from './api.js';
import { explain, loadSession, renderNav } from './admin-shell.js';
import { fillTimeZones } from './timezones.js';

const show = (id, on) => { $(id).hidden = !on; };
const fail = (sel, res) => { const n = $(sel); n.textContent = explain(res); n.hidden = false; };

async function showDashboard(user) {
  renderNav(user);
  show('#auth', false);
  show('#dashboard', true);
  fillTimeZones($('#new-tz'));
  const res = await getJson('/api/admin/events');
  const events = res.body?.events ?? [];
  $('#no-events').hidden = events.length > 0;
  const list = $('#events-list');
  list.replaceChildren(...events.map((e) => el('a', { class: 'card card-body mb-2 text-decoration-none', href: `/admin/event/?id=${e.id}`, 'data-testid': 'event-card', 'data-slug': e.slug },
    el('div', { class: 'd-flex justify-content-between gap-2' }, el('strong', { class: 'team-name' }, e.name), el('span', { class: 'badge text-bg-secondary' }, e.status)),
    el('div', { class: 'small text-muted' }, `/e/${e.slug}/ · ${e.day} · ${e.teamCount} team${e.teamCount === 1 ? '' : 's'}`))));
  $('#create-form').hidden = res.body?.canCreate === false;
}

const { user, registrationOpen } = await loadSession();
if (user) await showDashboard(user);
else {
  show('#auth', true);
  show('#register-col > form', registrationOpen);
  show('#registration-closed', !registrationOpen);
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('[data-testid="login-error"]').hidden = true;
  const res = await postJson('/api/auth/login', { username: $('#login-user').value, password: $('#login-pass').value });
  if (res.ok) location.reload(); else fail('[data-testid="login-error"]', res);
});

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('[data-testid="register-error"]').hidden = true;
  const res = await postJson('/api/auth/register', { username: $('#reg-user').value, password: $('#reg-pass').value });
  if (res.ok) location.reload(); else fail('[data-testid="register-error"]', res);
});

$('#create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('[data-testid="create-error"]').hidden = true;
  const res = await postJson('/api/admin/events', { name: $('#new-name').value, slug: $('#new-slug').value.trim().toLowerCase(), timeZone: $('#new-tz').value });
  if (res.ok) location.href = `/admin/event/?id=${res.body.id}`; else fail('[data-testid="create-error"]', res);
});

$('#new-name').addEventListener('input', () => {
  const slug = $('#new-slug');
  if (slug.dataset.touched) return;
  slug.value = $('#new-name').value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
});
$('#new-slug').addEventListener('input', () => { $('#new-slug').dataset.touched = '1'; });

$('#password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await postJson('/api/auth/password', { current: $('#pw-current').value, next: $('#pw-next').value });
  const msg = $('#pw-message');
  msg.hidden = false;
  msg.className = res.ok ? 'text-success mt-2 mb-0' : 'text-danger mt-2 mb-0';
  msg.textContent = res.ok ? 'Password changed.' : explain(res);
  if (res.ok) { $('#pw-current').value = ''; $('#pw-next').value = ''; }
});

$('#delete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!confirm('Delete your account and ALL of your hunts?')) return;
  const res = await postJson('/api/auth/delete', { password: $('#del-pass').value });
  if (res.ok) location.reload(); else fail('#del-error', res);
});
