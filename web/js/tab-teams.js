// Live view of the teams (refreshes every 5 s): rank, name, done, score; open a team to see its answers right under it; remove a team.
import { el } from './dom.js';
import { deleteJson, getJson } from './api.js';
import { explain } from './admin-shell.js';
import { formatScore, ordinal } from './format.js';
import { renderResults } from './results-view.js';

export async function mountTeams(body, ctx) {
  const table = el('div', { 'data-testid': 'teams-table' });
  // The open team's answers: ONE element that is moved into the row under the open team every time the table is redrawn, so a refresh never
  // closes it, flickers it or scrolls the page.
  const detail = el('div', { class: 'team-detail', 'data-testid': 'team-detail' });
  const heading = el('h2', { class: 'h5', 'data-testid': 'board-heading' });
  const note = el('p', { class: 'text-muted', hidden: true }, 'No teams have joined yet.');
  let openTeam = null;

  async function showTeam(n, { first = false } = {}) {
    const res = await getJson(`${ctx.base}/teams/${n}/results`);
    if (openTeam !== n) return; // closed (or another team opened) while this was loading
    if (!res.ok) { openTeam = null; detail.replaceChildren(); redraw(); return; }
    const { name, results, published } = res.body;
    const holder = el('div');
    renderResults(holder, { name, results }, { withAnswers: true, own: false });
    holder.querySelector('[data-testid="place"]')?.remove();
    const close = el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', 'data-testid': 'team-detail-close' }, 'Close ✕');
    close.addEventListener('click', () => { openTeam = null; detail.replaceChildren(); redraw(); });
    detail.replaceChildren(
      el('div', { class: 'd-flex flex-wrap align-items-center justify-content-between gap-2 mb-2' },
        el('h3', { class: 'h5 team-name mb-0', 'data-testid': 'team-detail-heading' }, `${name}: ${ordinal(results.place)} of ${results.teamCount}${published ? '' : ' (provisional until the results are published)'}`), close),
      holder);
    if (first) detail.closest('tr')?.previousElementSibling?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function toggleTeam(n) {
    if (openTeam === n) { openTeam = null; detail.replaceChildren(); redraw(); return; }
    openTeam = n;
    detail.replaceChildren(el('p', { class: 'text-muted mb-0', role: 'status' }, 'Loading...'));
    redraw();
    showTeam(n, { first: true });
  }

  let teams = [];
  let total = 0;
  function redraw() {
    if (openTeam !== null && !teams.some((t) => t.number === openTeam)) { openTeam = null; detail.replaceChildren(); } // the team was removed
    const rows = teams.flatMap((t) => {
      const open = openTeam === t.number;
      const view = el('button', { type: 'button', class: 'btn btn-link p-0 text-start team-name', title: open ? 'Hide this team\'s answers' : 'Show this team\'s answers', 'aria-expanded': String(open), 'data-testid': 'team-view' }, `${t.name} ${open ? '⌄' : '›'}`);
      view.addEventListener('click', () => toggleTeam(t.number));
      const remove = el('button', { type: 'button', class: 'btn btn-sm btn-outline-danger', 'data-testid': 'team-remove' }, 'Remove');
      remove.addEventListener('click', async () => {
        if (!confirm(`Remove ${t.name} (team ${t.number}) and all of its answers?`)) return;
        const r = await deleteJson(`${ctx.base}/teams/${t.number}`);
        if (!r.ok) alert(explain(r));
        if (openTeam === t.number) { openTeam = null; detail.replaceChildren(); }
        refresh();
      });
      const row = el('tr', { 'data-testid': 'team-row', 'data-team': String(t.number), class: open ? 'team-open' : null },
        el('td', {}, String(t.rank)), el('td', {}, String(t.number)), el('td', {}, view), el('td', {}, `${t.done}/${total}`),
        el('td', { class: 'text-end', 'data-testid': 'team-score' }, formatScore(t.shown)), el('td', { class: 'text-end' }, remove));
      return open ? [row, el('tr', { 'data-testid': 'team-detail-row', class: 'team-detail-row' }, el('td', { colspan: '6' }, detail))] : [row];
    });
    table.replaceChildren(el('div', { class: 'table-responsive' }, el('table', { class: 'table table-sm align-middle' },
      el('thead', {}, el('tr', {}, ...['rank', 'team', 'name', 'done'].map((h) => el('th', {}, h)), el('th', { class: 'text-end' }, 'score'), el('th', {}))),
      el('tbody', {}, ...rows))));
  }

  async function refresh() {
    const [res, board] = await Promise.all([getJson(`${ctx.base}/teams`), getJson(`/api/events/${ctx.data.org}/${ctx.data.slug}/scoreboard`)]);
    if (!res.ok) return;
    teams = res.body.teams;
    heading.textContent = board.body?.resultsPublished ? 'final results:' : 'provisional results:';
    heading.hidden = teams.length === 0;
    note.hidden = teams.length > 0;
    total = board.body?.questionTotal ?? 0;
    redraw();
    if (openTeam !== null) await showTeam(openTeam); // keep the open team's answers live
  }

  body.replaceChildren(heading, note, table);
  await refresh();
  const timer = setInterval(refresh, 5000);
  return () => clearInterval(timer);
}
