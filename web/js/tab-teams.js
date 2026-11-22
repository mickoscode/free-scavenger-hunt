// Live view of the teams (refreshes every 5 s): rank, name, done, score; look at a team's answers; remove a team.
import { el } from './dom.js';
import { deleteJson, getJson } from './api.js';
import { explain } from './admin-shell.js';
import { formatScore, ordinal } from './format.js';
import { renderResults } from './results-view.js';

export async function mountTeams(body, ctx) {
  const table = el('div', { 'data-testid': 'teams-table' });
  const detail = el('div', { class: 'mt-4', 'data-testid': 'team-detail' });
  const heading = el('h2', { class: 'h5', 'data-testid': 'board-heading' });
  const note = el('p', { class: 'text-muted', hidden: true }, 'No teams have joined yet.');
  let openTeam = null;

  async function showTeam(n) {
    openTeam = n;
    const res = await getJson(`${ctx.base}/teams/${n}/results`);
    if (!res.ok) { openTeam = null; detail.replaceChildren(); return; }
    const { name, results, published } = res.body;
    const holder = el('div');
    renderResults(holder, { name, results }, { withAnswers: true, own: false });
    holder.querySelector('[data-testid="place"]')?.remove();
    detail.replaceChildren(
      el('h3', { class: 'h5 team-name', 'data-testid': 'team-detail-heading' }, `${name}: ${ordinal(results.place)} of ${results.teamCount}${published ? '' : ' (provisional until the results are published)'}`),
      holder);
  }

  async function refresh() {
    const [res, board] = await Promise.all([getJson(`${ctx.base}/teams`), getJson(`/api/events/${ctx.data.slug}/scoreboard`)]);
    if (!res.ok) return;
    const teams = res.body.teams;
    heading.textContent = board.body?.resultsPublished ? 'final results:' : 'provisional results:';
    heading.hidden = teams.length === 0;
    note.hidden = teams.length > 0;
    const total = board.body?.questionTotal ?? 0;
    const rows = teams.map((t) => {
      const view = el('button', { type: 'button', class: 'btn btn-link p-0 text-start team-name', 'data-testid': 'team-view' }, t.name);
      view.addEventListener('click', () => showTeam(t.number));
      const remove = el('button', { type: 'button', class: 'btn btn-sm btn-outline-danger', 'data-testid': 'team-remove' }, 'Remove');
      remove.addEventListener('click', async () => {
        if (!confirm(`Remove ${t.name} (team ${t.number}) and all of its answers?`)) return;
        const r = await deleteJson(`${ctx.base}/teams/${t.number}`);
        if (!r.ok) alert(explain(r));
        if (openTeam === t.number) { openTeam = null; detail.replaceChildren(); }
        refresh();
      });
      return el('tr', { 'data-testid': 'team-row' },
        el('td', {}, String(t.rank)), el('td', {}, String(t.number)), el('td', {}, view), el('td', {}, `${t.done}/${total}`),
        el('td', { class: 'text-end' }, formatScore(t.score)), el('td', { class: 'text-end' }, remove));
    });
    table.replaceChildren(el('div', { class: 'table-responsive' }, el('table', { class: 'table table-sm align-middle' },
      el('thead', {}, el('tr', {}, ...['rank', 'team', 'name', 'done'].map((h) => el('th', {}, h)), el('th', { class: 'text-end' }, 'score'), el('th', {}))),
      el('tbody', {}, ...rows))));
    if (openTeam !== null) await showTeam(openTeam);
  }

  body.replaceChildren(heading, note, table, detail);
  await refresh();
  const timer = setInterval(refresh, 5000);
  return () => clearInterval(timer);
}
