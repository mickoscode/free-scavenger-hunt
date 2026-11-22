// What every organiser page shares: the top bar, and finding out who is signed in.
import { $, el } from './dom.js';
import { getJson, postJson } from './api.js';

export async function loadSession() {
  const res = await getJson('/api/auth/me');
  return { user: res.body?.user ?? null, registrationOpen: res.body?.registrationOpen ?? true };
}

export function renderNav(user) {
  const nav = $('#nav');
  const links = [el('a', { class: 'navbar-brand fw-semibold', href: '/admin/' }, 'Free Scavenger Hunt')];
  const right = el('div', { class: 'd-flex align-items-center gap-3 ms-auto' });
  right.append(el('a', { class: 'btn btn-sm btn-outline-primary', href: '/admin/', 'data-testid': 'nav-events' }, 'My hunts'));
  if (user.role === 'site-admin') right.append(el('a', { class: 'btn btn-sm btn-outline-primary', href: '/admin/site/', 'data-testid': 'nav-site' }, 'Site'));
  right.append(el('span', { class: 'text-muted small', 'data-testid': 'nav-user' }, user.name));
  const out = el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', 'data-testid': 'logout' }, 'Sign out');
  out.addEventListener('click', async () => { await postJson('/api/auth/logout'); location.href = '/admin/'; });
  right.append(out);
  nav.replaceChildren(el('div', { class: 'container py-2 d-flex align-items-center gap-3' }, ...links, right));
  nav.hidden = false;
}

// For pages that need a signed-in organiser: sends everyone else to the sign in page.
export async function requireSignedIn() {
  const { user } = await loadSession();
  if (!user) { location.replace('/admin/'); return null; }
  renderNav(user);
  return user;
}

export const ERRORS = {
  'invalid-login': 'That username and password do not match.',
  'invalid-username': 'Usernames are 3 to 30 letters, numbers, - or _.',
  'invalid-password': 'Passwords need at least 10 characters.',
  'weak-password': 'That password is too easy to guess. Use a longer, less predictable one (not your username or a common word).',
  'try-again': 'Something changed while you were saving. Please try again.',
  'invalid-recovery': 'That username and recovery code do not match, or the code has already been used.',
  'username-taken': 'That username is taken.',
  'registration-closed': 'New accounts are closed at the moment.',
  'too-many-requests': 'Too many tries. Please wait a little and try again.',
  'account-suspended': 'This account has been suspended.',
  'invalid-slug': 'The address needs 3 to 40 lower case letters, numbers or dashes.',
  'invalid-name': 'Please enter a name.',
  'slug-taken': 'That address is already used by another hunt.',
  'event-limit': 'You have reached your limit of hunts. Delete one, or ask the site admin to raise your limit.',
  'invalid-time-zone': 'That time zone is not recognised.',
  'game-active': 'The game is running, so this is locked. (Type "override" to change it anyway.)',
  'upload-limit': 'This hunt has reached its limit for uploaded pictures (60 MB in total). Use Make a copy on the Overview tab to start fresh with only the pictures in use.',
  'players-exist': 'Teams have already joined. Delete the player data first to change the questions.',
  'not-authenticated': 'Your session has ended. Please sign in again.',
  'game-not-over': 'You can publish only after the game has ended.',
};
export const explain = (res) => (res.status === 0 ? 'Could not reach the server. Check your connection.' : (ERRORS[res.body?.error] ?? `Something went wrong (${res.body?.error ?? res.status}).`));
