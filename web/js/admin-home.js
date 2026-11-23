// Organiser sign in / registration and the list of hunts.
import { $, el } from './dom.js';
import { getJson, postJson } from './api.js';
import { explain, loadSession, renderNav } from './admin-shell.js';
import { fillTimeZones } from './timezones.js';
import { cloneDefaults, slugify } from './hunt-names.js';
import { enhanceHelp, helpToggle } from './help.js';

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
  const canCreate = res.body?.canCreate !== false;
  const slugs = events.map((e) => e.slug);

  // A quick form on a card: the copy's name and address, already filled in ("v2-..."), and nothing else to decide.
  function cloneForm(e, card) {
    const defaults = cloneDefaults(e.name, e.slug, slugs);
    const name = el('input', { class: 'form-control', maxlength: '80', value: defaults.name, 'data-testid': 'clone-name', 'aria-label': 'Name of the copy' });
    const slug = el('input', { class: 'form-control', maxlength: '40', autocapitalize: 'off', value: defaults.slug, 'data-testid': 'clone-slug', 'aria-label': 'Web address of the copy' });
    const error = el('p', { class: 'text-danger small mt-2 mb-0', role: 'alert', hidden: true, 'data-testid': 'clone-error' });
    const create = el('button', { type: 'submit', class: 'btn btn-primary btn-sm', 'data-testid': 'clone-create' }, 'Create clone');
    const cancel = el('button', { type: 'button', class: 'btn btn-outline-secondary btn-sm', 'data-testid': 'clone-cancel' }, 'Cancel');
    let touched = false; // until the address is edited by hand it follows the name
    slug.addEventListener('input', () => { touched = true; });
    name.addEventListener('input', () => { if (!touched) slug.value = slugify(name.value); });
    const note = el('p', { class: 'small text-muted mb-2' }, 'A copy of this hunt: its settings, questions, instructions and maps (not its teams or scores). Give it a name and an address.');
    const form = el('form', { class: 'event-clone-form mt-3', novalidate: true, hidden: true, 'data-testid': 'clone-form' },
      el('div', { class: 'd-flex align-items-center gap-2 mb-1' }, el('strong', { class: 'small' }, 'Clone this hunt'), helpToggle('cloning', note)),
      note,
      el('label', { class: 'form-label small mb-1' }, 'Name of the copy'), name,
      el('label', { class: 'form-label small mb-1 mt-2' }, 'Web address'),
      el('div', { class: 'input-group' }, el('span', { class: 'input-group-text' }, `/e/${e.org}/`), slug),
      el('div', { class: 'd-flex gap-2 mt-3' }, create, cancel), error);
    cancel.addEventListener('click', () => { form.hidden = true; card.classList.remove('is-cloning'); });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      error.hidden = true;
      create.disabled = true;
      const out = await postJson(`/api/admin/events/${e.id}/duplicate`, { name: name.value, slug: slug.value.trim().toLowerCase() });
      if (out.ok) { location.href = `/admin/event/?id=${out.body.id}`; return; }
      create.disabled = false;
      error.textContent = explain(out);
      error.hidden = false;
    });
    return { form, open() { form.hidden = false; card.classList.add('is-cloning'); name.focus(); name.select(); } };
  }

  // The whole card opens the hunt's manager (the Manage link stretches over it); Play, Clone and Data are separate buttons on top. Play opens the
  // page players see in a new tab so this page stays open.
  list.replaceChildren(...events.map((e) => {
    const card = el('div', { class: 'card card-body mb-2 event-card', 'data-testid': 'event-card', 'data-slug': e.slug });
    const buttons = el('div', { class: 'd-flex flex-wrap gap-2 mt-2' },
      el('a', { class: 'btn btn-sm btn-outline-primary stretched-link', href: `/admin/event/?id=${e.id}`, 'data-testid': 'event-manage' }, 'Manage ›'),
      el('a', { class: 'btn btn-sm btn-outline-success event-action', href: `/e/${e.org}/${e.slug}/`, target: '_blank', rel: 'noopener', title: 'Open the page players see (in a new tab)', 'data-testid': 'event-play' }, 'Play ›'));
    card.append(
      el('div', { class: 'd-flex justify-content-between align-items-center gap-2' }, el('strong', { class: 'team-name' }, e.name), el('span', { class: 'badge text-bg-secondary' }, e.status)),
      el('div', { class: 'small text-muted' }, `/e/${e.org}/${e.slug}/ · ${e.day} · ${e.teamCount} team${e.teamCount === 1 ? '' : 's'}`),
      buttons);
    if (canCreate) {
      const dup = cloneForm(e, card);
      const open = el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary event-action', title: 'Make a copy of this hunt', 'data-testid': 'event-clone' }, 'Clone ›');
      open.addEventListener('click', () => dup.open());
      buttons.append(open);
      card.append(dup.form);
    }
    buttons.append(el('a', { class: 'btn btn-sm btn-outline-secondary event-action', href: `/admin/event/?id=${e.id}#data`, title: 'Export or import this hunt as a file', 'data-testid': 'event-data' }, 'Data ›'));
    return card;
  }));
  const note = $('#limit-note');
  note.hidden = canCreate;
  note.textContent = canCreate ? '' : `You have reached your limit of ${res.body?.maxEvents ?? 'your'} hunts. Delete one to make room, or ask the site admin to raise your limit.`;
  $('#create-form').hidden = !canCreate;
}

enhanceHelp(); // the plain-HTML explanations become "?" toggles
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
