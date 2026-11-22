// The scoreboard table: rank, name, done, score. Shared by the public page and the admin teams page.
import { el } from './dom.js';
import { formatScore } from './format.js';

// teams: [{ rank, name, done, score, number? }]; own: the name to highlight; linkTo(team) -> href or null.
export function renderScoreboard(container, { teams, questionTotal, own = null, linkTo = null }) {
  const body = el('tbody');
  for (const t of teams) {
    const href = linkTo?.(t);
    const name = href ? el('a', { href }, t.name) : t.name;
    const row = el('tr', { 'data-testid': 'score-row', class: own !== null && t.name === own ? 'table-primary fw-semibold' : '' },
      el('td', {}, String(t.rank)), el('td', { class: 'team-name' }, name), el('td', {}, `${t.done}/${questionTotal}`), el('td', { class: 'text-end' }, formatScore(t.score)));
    body.append(row);
  }
  const head = el('thead', {}, el('tr', {}, el('th', {}, 'rank'), el('th', {}, 'name'), el('th', {}, 'done'), el('th', { class: 'text-end' }, 'score')));
  container.replaceChildren(el('table', { class: 'table table-sm align-middle scoreboard', 'data-testid': 'scoreboard' }, head, body));
}
