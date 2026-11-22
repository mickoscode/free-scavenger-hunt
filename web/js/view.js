// The event's front page: status and countdown, join or play/results button, the live scoreboard (refreshes every 5 s).
import { $, el } from './dom.js';
import { eventBase, eventSlug, eventUrl, getJson, postJson } from './api.js';
import { createStatusLine } from './clock.js';
import { renderScoreboard } from './scoreboard-table.js';

const slug = eventSlug();
const base = eventBase(slug);
const status = createStatusLine($('[data-testid="status"]'));
const joinForm = $('#join-form');
const joinError = $('[data-testid="join-error"]');
let info = null;
let me = null;
let board = null;

const JOIN_ERRORS = {
  'wrong-code': 'That code is not right.',
  'name-taken': 'That team name is taken. Please choose another.',
  'invalid-name': 'Please choose a different team name (1 to 30 letters, numbers or spaces, and be kind).',
  'not-joinable': 'Joining is closed.',
  'event-full': 'This hunt is full.',
  'too-many-requests': 'Too many tries. Please wait a little and try again.',
};

function paintActions() {
  const phase = status.phase();
  const joined = Boolean(me);
  joinForm.hidden = joined || !(phase === 'pre' || phase === 'active');
  $('#code-field').hidden = !info?.joinCodeRequired;
  $('#name-field').hidden = info?.teamNames === false;
  $('#play-link').hidden = !(joined && phase !== 'post' && phase !== 'unconfigured');
  $('#results-link').hidden = !(joined && phase === 'post');
  paintBoard();
}

function paintBoard() {
  const heading = $('[data-testid="board-heading"]');
  const teams = board?.teams ?? [];
  heading.hidden = teams.length === 0;
  heading.textContent = board?.resultsPublished ? 'final results:' : 'provisional results:';
  heading.dataset.final = String(Boolean(board?.resultsPublished));
  $('[data-testid="no-teams"]').hidden = teams.length > 0;
  renderScoreboard($('#scoreboard'), {
    teams, questionTotal: board?.questionTotal ?? 0, own: me?.name ?? null,
    linkTo: board?.resultsPublished ? (t) => eventUrl(slug, `results/?team=${t.number}`) : null,
  });
}

async function refresh() {
  const [i, b, m] = await Promise.all([getJson(base), getJson(`${base}/scoreboard`), getJson(`${base}/me`)]);
  if (i.status === 400) { $('[data-testid="load-error"]').hidden = false; return; }
  if (i.ok) { info = i.body; $('[data-testid="event-name"]').textContent = info.name; document.title = info.name; status.update(info); }
  if (b.ok) board = b.body;
  me = m.ok ? m.body : null;
  paintActions();
}

status.onPhaseChange(paintActions);

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  joinError.hidden = true;
  const button = $('[data-testid="join-button"]');
  button.disabled = true;
  const res = await postJson(`${base}/join`, { name: $('#team-name').value, code: $('#join-code').value });
  button.disabled = false;
  if (res.ok) { await refresh(); location.href = eventUrl(slug, 'play/'); return; }
  joinError.textContent = res.status === 0 ? 'Could not send. Check your connection and try again.' : (JOIN_ERRORS[res.body?.error] ?? 'Something went wrong. Please try again.');
  joinError.dataset.error = res.body?.error ?? 'network';
  joinError.hidden = false;
});

await refresh();
setInterval(refresh, 5000);
