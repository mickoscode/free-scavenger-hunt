// The event manager: one page, tabs for overview, settings, questions, teams, scoring and data.
import { $, el } from './dom.js';
import { getJson } from './api.js';
import { requireSignedIn } from './admin-shell.js';
import { mountOverview } from './tab-overview.js';
import { mountSettings } from './tab-settings.js';
import { mountContent } from './tab-content.js';
import { mountTeams } from './tab-teams.js';
import { mountScoring } from './tab-scoring.js';
import { mountData } from './tab-data.js';

const STATUS_LABEL = { unconfigured: 'Setting up', pre: 'Waiting to start', active: 'In progress', post: 'Finished' };
const TABS = [
  ['overview', 'Overview', mountOverview], ['settings', 'Settings', mountSettings], ['questions', 'Questions', mountContent],
  ['teams', 'Teams', mountTeams], ['scoring', 'Scoring', mountScoring], ['data', 'Data', mountData],
];

const user = await requireSignedIn();
if (user) {
  const id = new URLSearchParams(location.search).get('id');
  const body = $('#tab-body');
  let stop = null; // stops the current tab's refresh timer

  const ctx = {
    id, user, data: null,
    async reload() {
      const res = await getJson(`/api/admin/events/${encodeURIComponent(id)}`);
      if (!res.ok) { $('#load-error').hidden = false; $('#event').hidden = true; return false; }
      ctx.data = res.body;
      $('[data-testid="event-title"]').textContent = res.body.config.name;
      document.title = `${res.body.config.name} - manage`;
      const badge = $('[data-testid="event-status"]');
      badge.textContent = STATUS_LABEL[res.body.status];
      badge.dataset.status = res.body.status;
      return true;
    },
    base: `/api/admin/events/${encodeURIComponent(id)}`,
  };

  async function select(name) {
    stop?.();
    stop = null;
    const tab = TABS.find((t) => t[0] === name) ?? TABS[0];
    for (const a of document.querySelectorAll('#tabs .nav-link')) a.classList.toggle('active', a.dataset.tab === tab[0]);
    await ctx.reload();
    body.replaceChildren();
    stop = (await tab[2](body, ctx)) ?? null;
  }

  if (await ctx.reload()) {
    $('#event').hidden = false;
    $('#tabs').replaceChildren(...TABS.map(([name, label]) => {
      const a = el('a', { class: 'nav-link', href: `#${name}`, 'data-tab': name, 'data-testid': `tab-${name}` }, label);
      return el('li', { class: 'nav-item' }, a);
    }));
    window.addEventListener('hashchange', () => select(location.hash.slice(1)));
    await select(location.hash.slice(1) || (ctx.data.status === 'unconfigured' ? 'questions' : 'overview'));
  }
}
