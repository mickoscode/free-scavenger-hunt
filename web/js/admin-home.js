// Organiser sign in / registration and the list of hunts.
import { $, el } from './dom.js';
import { getJson, postJson } from './api.js';
import { explain, loadSession, renderNav } from './admin-shell.js';
import { fillTimeZones } from './timezones.js';

const show = (id, on) => { $(id).hidden = !on; };
const fail = (sel, res) => { const n = $(sel); n.textContent = explain(res); n.hidden = false; };

// The recovery codes screen: shown once after registering or making new codes.
function showCodes(codes) {
  show('#auth', false);
  show('#dashboard', false);
  show('#codes', true);
  $('#codes-list').replaceChildren(...codes.map((c) => el('li', { 'data-testid': 'recovery-code' }, c)));
  const text = `Free Scavenger Hunt recovery codes (each works once)\n\n${codes.join('\n')}\n`;
  $('#codes-copy').onclick = async () => { try { await navigator.clipboard.writeText(codes.join('\n')); $('#codes-copy').textContent = 'Copied'; } catch { $('#codes-copy').textContent = 'Copy failed: select the codes by hand'; } };
  $('#codes-download').onclick = () => {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: 'scavenger-hunt-recovery-codes.txt' });
    document.body.append(a);
    a.click();
    a.remove();
  };
  $('#codes-print').onclick = () => window.print();
  $('#codes-saved').checked = false;
  $('#codes-continue').disabled = true;
  $('#codes-saved').onchange = () => { $('#codes-continue').disabled = !$('#codes-saved').checked; };
  $('#codes-continue').onclick = () => location.reload();
}

const NOTICE_TEXT = {
  'recovery-used': 'A recovery code was used to reset your password.',
  'admin-reset': 'The site admin reset your password.',
};

function paintSecurity(user) {
  const left = user.recoveryCodesLeft;
  $('#recovery-status').textContent = left === 0 ? 'You have no recovery codes left. Make new ones now.' : `You have ${left} recovery code${left === 1 ? '' : 's'} left.`;
  $('#recovery-status').className = left <= 2 ? 'mb-2 text-danger fw-semibold' : 'mb-2';
  const notices = $('#notices');
  notices.replaceChildren(...user.notices.map((n) => el('div', { class: 'alert alert-warning', role: 'alert', 'data-testid': 'notice' },
    `${NOTICE_TEXT[n.type] ?? n.type} (${new Date(n.at).toLocaleString()}). If this was not you, change your password now.`)));
  if (user.notices.length) {
    const dismiss = el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary mb-3', 'data-testid': 'notice-dismiss' }, 'Dismiss');
    dismiss.addEventListener('click', async () => { await postJson('/api/auth/notices/dismiss'); notices.replaceChildren(); });
    notices.append(dismiss);
  }
}

async function showDashboard(user) {
  renderNav(user);
  show('#auth', false);
  show('#dashboard', true);
  paintSecurity(user);
  $('#new-prefix').textContent = `/e/${user.code}/`;
  fillTimeZones($('#new-tz'));
  const res = await getJson('/api/admin/events');
  const events = res.body?.events ?? [];
  $('#no-events').hidden = events.length > 0;
  const list = $('#events-list');
  // The whole card opens the hunt's manager (the Manage link stretches over it); Test is a separate link on top, straight to the page players see, in a new tab so this page stays open.
  list.replaceChildren(...events.map((e) => el('div', { class: 'card card-body mb-2 event-card', 'data-testid': 'event-card', 'data-slug': e.slug },
    el('div', { class: 'd-flex justify-content-between align-items-center gap-2' }, el('strong', { class: 'team-name' }, e.name), el('span', { class: 'badge text-bg-secondary' }, e.status)),
    el('div', { class: 'small text-muted' }, `/e/${e.org}/${e.slug}/ · ${e.day} · ${e.teamCount} team${e.teamCount === 1 ? '' : 's'}`),
    el('div', { class: 'd-flex flex-wrap gap-2 mt-2' },
      el('a', { class: 'btn btn-sm btn-outline-primary stretched-link', href: `/admin/event/?id=${e.id}`, 'data-testid': 'event-manage' }, 'Manage ›'),
      el('a', { class: 'btn btn-sm btn-outline-success event-test', href: `/e/${e.org}/${e.slug}/`, target: '_blank', rel: 'noopener', title: 'Open the page players see (in a new tab)', 'data-testid': 'event-test' }, 'Test ›')))));
  $('#create-form').hidden = res.body?.canCreate === false;
}

const { user, registrationOpen } = await loadSession();
$('#public-header').hidden = Boolean(user); // signed-out visitors get the public header (Home, About); organisers get their own bar
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
  const res = await postJson('/api/auth/register', { username: $('#reg-user').value, password: $('#reg-pass').value, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (res.ok) showCodes(res.body.recoveryCodes); else fail('[data-testid="register-error"]', res);
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

$('#forgot').addEventListener('click', () => { $('#recover-form').hidden = false; $('#rec-user').value = $('#login-user').value; $('#rec-code').focus(); });

$('#recover-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('[data-testid="recover-error"]').hidden = true;
  const res = await postJson('/api/auth/recover', { username: $('#rec-user').value, code: $('#rec-code').value, next: $('#rec-pass').value });
  if (res.ok) location.reload(); else fail('[data-testid="recover-error"]', res);
});

$('#rc-make').addEventListener('click', async () => {
  $('#rc-error').hidden = true;
  const res = await postJson('/api/auth/recovery-codes', { password: $('#rc-pass').value });
  if (res.ok) showCodes(res.body.recoveryCodes); else fail('#rc-error', res);
});
