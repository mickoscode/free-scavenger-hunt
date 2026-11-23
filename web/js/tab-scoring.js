// Scoring photo challenges (refreshes every 5 s), and publishing the final results.
import { el } from './dom.js';
import { helpToggle } from './help.js';
import { getJson, postJson, putJson } from './api.js';
import { explain } from './admin-shell.js';
import { formatScore } from './format.js';

export async function mountScoring(body, ctx) {
  const list = el('div', { 'data-testid': 'photo-list' });
  const publishBox = el('section', { class: 'card card-body mb-4', 'data-testid': 'publish-box' });
  const pending = new Map(); // chosen but not yet applied decisions, kept across refreshes
  let lastKey = null;

  const keyOf = (i) => `${i.team}|${i.zone}|${i.question}`;

  // ---- score adjustments: one bonus or penalty per team, with a reason. Saved as soon as a row is filled in; counted when results are published.
  const adjustList = el('div', { 'data-testid': 'adjust-list' });
  const adjustNote = el('div', { 'data-testid': 'adjust-note' });
  const filter = el('input', { type: 'search', class: 'form-control form-control-sm mb-2', placeholder: 'Find a team (number or name)', 'aria-label': 'Find a team', 'data-testid': 'adjust-filter', hidden: true });
  const reasons = el('datalist', { id: 'adjust-reasons' });
  let teamsKey = null;
  const sign = (n) => `${n > 0 ? '+' : ''}${formatScore(n)}`;

  function adjustRow(t, open) {
    const label = t.name === `Team ${t.number}` ? t.name : `Team ${t.number} ${t.name}`;
    const points = el('input', { type: 'number', class: 'form-control form-control-sm adj-points', step: '0.5', min: '-1000', max: '1000', inputmode: 'decimal', placeholder: '+/-', 'aria-label': `Points adjustment for ${label}`, 'data-testid': 'adj-points', value: t.adjustment ? String(t.adjustment.points) : '', disabled: !open });
    const reason = el('input', { type: 'text', class: 'form-control form-control-sm adj-reason', maxlength: '80', list: 'adjust-reasons', autocomplete: 'off', placeholder: 'Reason', 'aria-label': `Reason for ${label}`, 'data-testid': 'adj-reason', value: t.adjustment?.reason ?? '', disabled: !open });
    const final = el('span', { class: 'adj-final fw-semibold', 'data-testid': 'adj-final' });
    const state = el('span', { class: 'small adj-state', role: 'status', 'data-testid': 'adj-state' });
    const typed = () => { const raw = points.value.trim(); return raw === '' ? 0 : Number(raw); };
    const paint = () => { const n = typed(); final.textContent = `Final ${formatScore(t.score + (Number.isFinite(n) ? n : 0))}`; };
    paint();
    const say = (text, cls = 'text-muted') => { state.textContent = text; state.className = `small adj-state ${cls}`; };

    async function commit() {
      const n = typed();
      if (!Number.isFinite(n)) return say('Enter a number of points', 'text-danger');
      const reasonText = reason.value.trim().replace(/\s+/g, ' ');
      if (n !== 0 && reasonText === '') return say('Add a reason to save', 'text-warning-emphasis');
      const saved = t.adjustment;
      if (n === 0 && !saved) { say(''); return; }
      if (saved && n === saved.points && reasonText === saved.reason) return;
      say('Saving...');
      const res = await putJson(`${ctx.base}/teams/${t.number}/adjustment`, { points: n, reason: reasonText });
      if (!res.ok) return say(explain(res), 'text-danger');
      t.adjustment = res.body.adjustment;
      if (!t.adjustment) { points.value = ''; reason.value = ''; }
      else { points.value = String(t.adjustment.points); reason.value = t.adjustment.reason; }
      row.dataset.adjusted = String(Boolean(t.adjustment));
      if (t.adjustment && ![...reasons.children].some((o) => o.value === t.adjustment.reason)) reasons.prepend(el('option', { value: t.adjustment.reason })); // suggest it for the next team at once
      paint();
      say(t.adjustment ? 'Saved ✓' : 'Removed ✓', 'text-success');
      teamsKey = null; // the next refresh redraws from the server
    }
    for (const input of [points, reason]) { input.addEventListener('change', commit); input.addEventListener('input', () => { paint(); say(''); }); }
    const row = el('div', { class: 'adjust-row', 'data-testid': 'adjust-row', 'data-team': String(t.number), 'data-adjusted': String(Boolean(t.adjustment)), 'data-search': `${t.number} ${t.name}`.toLowerCase() },
      el('div', { class: 'adj-team team-name' }, el('strong', {}, `Team ${t.number}`), t.name !== `Team ${t.number}` ? ` · ${t.name}` : '', el('span', { class: 'small text-muted ms-2' }, `Score ${formatScore(t.score)}`)),
      el('div', { class: 'adj-fields' }, points, reason),
      el('div', { class: 'adj-result' }, final, state));
    return row;
  }

  function paintAdjustments({ teams, scoringOpen, resultsPublished }) {
    const adjusted = teams.filter((t) => t.adjustment).length;
    adjustNote.replaceChildren(...[
      resultsPublished ? el('p', { class: 'alert alert-info' }, 'The results are published, so adjustments are read-only. Return to provisional to change one.')
        : !scoringOpen ? el('p', { class: 'alert alert-info' }, 'Adjustments open when the game starts.') : null,
      teams.length === 0 ? el('p', { class: 'text-muted' }, 'No teams have joined yet.') : null,
    ].filter(Boolean));
    const used = [...new Set(teams.filter((t) => t.adjustment).map((t) => t.adjustment.reason))];
    reasons.replaceChildren(...[...used, 'Bonus for fair play', 'Penalty for returning late'].filter((r, i, all) => all.indexOf(r) === i).map((r) => el('option', { value: r })));
    filter.hidden = teams.length <= 6;
    adjustList.replaceChildren(...teams.map((t) => adjustRow(t, scoringOpen)));
    applyFilter();
    return adjusted;
  }
  function applyFilter() {
    const q = filter.value.trim().toLowerCase();
    for (const row of adjustList.children) row.hidden = q !== '' && !(row.dataset.search ?? '').includes(q);
  }
  filter.addEventListener('input', applyFilter);

  async function refreshAdjustments(force = false) {
    const res = await getJson(`${ctx.base}/teams`);
    if (!res.ok) return 0;
    const teams = [...res.body.teams].sort((a, b) => a.number - b.number);
    const key = JSON.stringify([teams, res.body.scoringOpen, res.body.resultsPublished]);
    const typing = adjustList.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
    if ((key !== teamsKey || force) && !typing) { teamsKey = key; lastAdjusted = paintAdjustments({ teams, scoringOpen: res.body.scoringOpen, resultsPublished: res.body.resultsPublished }); }
    return lastAdjusted;
  }
  let lastAdjusted = 0;

  function row(item, open) {
    const name = `d-${keyOf(item)}`;
    const selected = pending.get(keyOf(item)) ?? item.decision;
    const inputs = ['full', 'half', 'zero'].map((d) => el('input', { class: 'form-check-input', type: 'radio', name, value: d, id: `${name}-${d}`, disabled: !open, checked: selected === d }));
    const radios = inputs.map((input) => el('div', { class: 'form-check form-check-inline' }, input, el('label', { class: 'form-check-label', for: input.id }, input.value)));
    const apply = el('button', { type: 'button', class: 'btn btn-sm btn-primary', 'data-testid': 'apply', disabled: true }, 'Apply');
    const state = el('span', { class: 'small ms-2' }, item.decision ? `Applied: ${item.decision} (${item.earned} pts)` : '');
    const chosen = () => inputs.find((x) => x.checked)?.value ?? null;
    const sync = () => { apply.disabled = !open || chosen() === null || chosen() === item.decision; };
    for (const input of inputs) input.addEventListener('change', () => { pending.set(keyOf(item), chosen()); sync(); });
    sync();
    apply.addEventListener('click', async () => {
      apply.disabled = true;
      const res = await postJson(`${ctx.base}/photos/score`, { team: item.team, zone: item.zone, question: item.question, decision: chosen() });
      if (!res.ok) { state.textContent = explain(res); state.className = 'small ms-2 text-danger'; return; }
      pending.delete(keyOf(item));
      refresh(true);
    });
    return el('div', { class: 'card card-body mb-2', 'data-testid': 'photo-row', 'data-team': String(item.team), 'data-decision': item.decision ?? '' },
      el('div', { class: 'team-name' }, el('strong', {}, `Team ${item.team}`), item.teamName !== `Team ${item.team}` ? ` · ${item.teamName}` : '', ` · ${item.zoneName}`),
      el('div', { class: 'my-1' }, `${item.challenge} (${item.points} pts)`),
      el('div', { class: 'd-flex flex-wrap align-items-center gap-1' }, ...radios, apply, state));
  }

  function paintPublish({ unscored, resultsPublished, status, adjusted = 0 }) {
    const over = status === 'post';
    const confirmBox = el('input', { class: 'form-check-input', type: 'checkbox', id: 'applied-all', 'data-testid': 'applied-all', disabled: !over || resultsPublished });
    const publish = el('button', { type: 'button', class: 'btn btn-success', 'data-testid': 'publish', disabled: true }, 'Publish final results');
    const back = el('button', { type: 'button', class: 'btn btn-outline-secondary', 'data-testid': 'unpublish' }, 'Return to provisional');
    confirmBox.addEventListener('change', () => { publish.disabled = !confirmBox.checked; });
    const out = el('p', { class: 'mt-2 mb-0', role: 'status', hidden: true });
    publish.addEventListener('click', async () => {
      const res = await postJson(`${ctx.base}/publish`, { confirm: true });
      if (res.ok) refresh(true);
      else { out.hidden = false; out.className = 'mt-2 mb-0 text-danger'; out.textContent = explain(res); }
    });
    back.addEventListener('click', async () => { await postJson(`${ctx.base}/unpublish`); refresh(true); });
    const summary = resultsPublished ? 'The final results are published: teams can see their full results.'
      : over ? `${unscored} photo${unscored === 1 ? '' : 's'} not scored yet (they count as zero if you publish now).`
        : 'You can publish once the game has ended.';
    const adjustedLine = adjusted && !resultsPublished ? `${adjusted} team${adjusted === 1 ? ' has' : 's have'} a score adjustment: it is added when you publish.` : null;
    publishBox.replaceChildren(...[
      el('h2', { class: 'h5' }, 'Final results'), el('p', { class: 'mb-2' }, summary), adjustedLine ? el('p', { class: 'mb-2', 'data-testid': 'adjusted-line' }, adjustedLine) : null,
      resultsPublished ? back : el('div', { class: 'd-flex flex-wrap align-items-center gap-3' },
        el('div', { class: 'form-check mb-0' }, confirmBox, el('label', { class: 'form-check-label', for: 'applied-all' }, 'I have applied all scores')), publish),
      out].filter(Boolean));
  }

  async function refresh(force = false) {
    const res = await getJson(`${ctx.base}/photos`);
    if (!res.ok) return;
    const { items, scoringOpen, resultsPublished, status } = res.body;
    const adjusted = await refreshAdjustments(force); // the teams list refreshes on its own schedule: it can change when the photos do not
    const key = JSON.stringify([items, scoringOpen, resultsPublished, status, adjusted]);
    if (key === lastKey && !force) return;
    lastKey = key;
    // Unscored first, in the order they were sent; scored ones move to the bottom.
    const ordered = [...items.filter((i) => i.decision === null), ...items.filter((i) => i.decision !== null)];
    list.replaceChildren(...(ordered.length ? ordered.map((i) => row(i, scoringOpen)) : [el('p', { class: 'text-muted' }, 'No photos have been sent yet.')]));
    if (resultsPublished) list.prepend(el('p', { class: 'alert alert-info' }, 'The results are published, so scores are read-only. Return to provisional to correct a score.'));
    else if (!scoringOpen) list.prepend(el('p', { class: 'alert alert-info' }, 'Scoring opens when the game starts.'));
    paintPublish({ unscored: items.filter((i) => i.decision === null).length, resultsPublished, status, adjusted });
  }

  const adjustHelp = el('p', { class: 'small text-muted' }, 'Give a team one bonus or penalty, with a reason, for things the questions do not cover (fair play, coming back late...). Type points (a minus for a penalty) and a reason; it saves by itself. Clear the points to remove it. It is only added to the team\'s score when you publish the final results, and the team sees the points and your reason on its results page.');
  const photoHelp = el('p', { class: 'small text-muted' }, 'Check each photo in your WhatsApp group (team number, zone and challenge must be clear), choose full, half or zero, then Apply. You can change a decision later.');
  body.replaceChildren(
    publishBox, el('h2', { class: 'h5 d-flex align-items-center gap-2' }, 'Photo challenges', helpToggle('photo scoring', photoHelp)),
    photoHelp,
    list,
    el('h2', { class: 'h5 d-flex align-items-center gap-2 mt-4' }, 'Score adjustments (optional)', helpToggle('score adjustments', adjustHelp)),
    adjustHelp, adjustNote, filter, adjustList, reasons);
  await refresh(true);
  const timer = setInterval(refresh, 5000);
  return () => clearInterval(timer);
}
