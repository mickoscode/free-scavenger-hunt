// A team's own results (answers included), or anybody's summary (?team=N), once the results are published.
import { $ } from './dom.js';
import { eventBase, getJson } from './api.js';
import { renderResults } from './results-view.js';
import './top-link.js';

const base = eventBase();
const wanted = new URLSearchParams(location.search).get('team');
const container = $('#results');

async function load() {
  if (wanted !== null) {
    const res = await getJson(`${base}/results/team/${encodeURIComponent(wanted)}`);
    if (res.status === 400 && res.body?.error === 'no-team') { $('[data-testid="not-found"]').hidden = false; return; }
    if (!res.ok || !res.body.published) { $('[data-testid="not-ready"]').hidden = false; return; }
    renderResults(container, res.body, { withAnswers: false, own: false });
    return;
  }
  const res = await getJson(`${base}/results`);
  if (res.status === 401) return; // a viewer: only the link back to the scoreboard
  if (!res.ok || !res.body.published) { $('[data-testid="not-ready"]').hidden = false; return; }
  renderResults(container, res.body, { withAnswers: true, own: true });
}
await load();
