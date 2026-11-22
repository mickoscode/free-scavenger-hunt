// The public pages (front page, About) are plain files, so they ask whether this browser is signed in as an organiser and, if so, show
// Sign out in the header and a "Hunt admin page" button instead of "Organiser sign in".
import { $$, el } from './dom.js';
import { getJson, postJson } from './api.js';
import './top-link.js';

const res = await getJson('/api/auth/me');
if (res.body?.user) {
  for (const link of $$('[data-signin="header"]')) {
    const out = el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', 'data-testid': 'header-signout' }, 'Sign out');
    out.addEventListener('click', async () => { await postJson('/api/auth/logout'); location.reload(); });
    link.replaceWith(out);
  }
  for (const link of $$('[data-signin="hero"]')) link.textContent = 'Hunt admin page';
}
