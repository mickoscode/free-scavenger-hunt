// Scoring photo challenges (refreshes every 5 s), and publishing the final results.
import { el } from './dom.js';
import { getJson, postJson } from './api.js';
import { explain } from './admin-shell.js';

export async function mountScoring(body, ctx) {
  const list = el('div', { 'data-testid': 'photo-list' });
  const publishBox = el('section', { class: 'card card-body mb-4', 'data-testid': 'publish-box' });
  const pending = new Map(); // chosen but not yet applied decisions, kept across refreshes
  let lastKey = null;

  const keyOf = (i) => `${i.team}|${i.zone}|${i.question}`;

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

  function paintPublish({ unscored, resultsPublished, status }) {
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
    publishBox.replaceChildren(
      el('h2', { class: 'h5' }, 'Final results'), el('p', { class: 'mb-2' }, summary),
      resultsPublished ? back : el('div', { class: 'd-flex flex-wrap align-items-center gap-3' },
        el('div', { class: 'form-check mb-0' }, confirmBox, el('label', { class: 'form-check-label', for: 'applied-all' }, 'I have applied all scores')), publish),
      out);
  }

  async function refresh(force = false) {
    const res = await getJson(`${ctx.base}/photos`);
    if (!res.ok) return;
    const { items, scoringOpen, resultsPublished, status } = res.body;
    const key = JSON.stringify([items, scoringOpen, resultsPublished, status]);
    if (key === lastKey && !force) return;
    lastKey = key;
    // Unscored first, in the order they were sent; scored ones move to the bottom.
    const ordered = [...items.filter((i) => i.decision === null), ...items.filter((i) => i.decision !== null)];
    list.replaceChildren(...(ordered.length ? ordered.map((i) => row(i, scoringOpen)) : [el('p', { class: 'text-muted' }, 'No photos have been sent yet.')]));
    if (resultsPublished) list.prepend(el('p', { class: 'alert alert-info' }, 'The results are published, so scores are read-only. Return to provisional to correct a score.'));
    else if (!scoringOpen) list.prepend(el('p', { class: 'alert alert-info' }, 'Scoring opens when the game starts.'));
    paintPublish({ unscored: items.filter((i) => i.decision === null).length, resultsPublished, status });
  }

  body.replaceChildren(
    publishBox, el('h2', { class: 'h5' }, 'Photo challenges'),
    el('p', { class: 'small text-muted' }, 'Check each photo in your WhatsApp group (team number, zone and challenge must be clear), choose full, half or zero, then Apply. You can change a decision later.'),
    list);
  await refresh(true);
  const timer = setInterval(refresh, 5000);
  return () => clearInterval(timer);
}
