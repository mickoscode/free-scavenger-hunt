// The question editor: zones (name, optional map), questions of four kinds, and the instructions.
import { el } from './dom.js';
import { postJson, putJson } from './api.js';
import { explain } from './admin-shell.js';
import { blankQuestion, blankZone, describeProblem, nextId, TYPE_LABELS } from './content-model.js';
import { shrinkMap } from './image-shrink.js';
import { renderMarkdown } from './markdown.js';

export async function mountContent(body, ctx) {
  const state = structuredClone(ctx.data.content);
  const locked = ctx.data.teamCount > 0;
  let dirty = false;
  const message = el('div', { role: 'status', class: 'mt-2', hidden: true });
  const say = (text, ok, list = []) => {
    message.hidden = false;
    message.className = `mt-2 ${ok ? 'text-success' : 'text-danger'}`;
    message.replaceChildren(text, ...(list.length ? [el('ul', { class: 'mb-0' }, ...list.map((t) => el('li', {}, t)))] : []));
  };
  const touch = () => { dirty = true; };
  window.onbeforeunload = () => (dirty ? 'You have unsaved changes.' : undefined);

  const root = el('div', { 'data-testid': 'editor' });
  const render = () => root.replaceChildren(...state.zones.map(zoneCard), addZoneButton());

  const lockable = (node) => { node.disabled = locked; return node; };
  function textInput(value, onInput, attrs = {}) {
    const input = lockable(el('input', { class: 'form-control', value, ...attrs }));
    input.addEventListener('input', () => { onInput(input.value); touch(); });
    return input;
  }
  function button(label, onClick, cls = 'btn-outline-secondary', extra = {}) {
    const b = lockable(el('button', { type: 'button', class: `btn btn-sm ${cls}`, 'aria-label': label, ...extra }, label));
    b.addEventListener('click', onClick);
    return b;
  }
  function move(list, i, d) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    touch();
    render();
  }

  function answersField(q) {
    const wrap = el('div', { class: 'mb-2' });
    if (q.type === 'string') {
      const ta = lockable(el('textarea', { class: 'form-control', rows: '2', 'data-testid': 'q-answers', 'aria-label': 'Accepted answers, one per line' }, q.answers.join('\n')));
      ta.addEventListener('input', () => { q.answers = ta.value.split('\n'); touch(); });
      wrap.append(el('label', { class: 'form-label small mb-1' }, 'Accepted answers (one per line; small typos are allowed)'), ta);
    } else if (q.type === 'photo') {
      wrap.append(el('p', { class: 'small text-muted mb-0' }, 'Teams send the photo to your WhatsApp group; you score it (full, half or zero) on the Scoring tab.'));
    } else {
      wrap.append(
        el('label', { class: 'form-label small mb-1' }, q.type === 'decimal' ? 'Answer (a number, e.g. 2.5)' : 'Answer (a whole number)'),
        textInput(q.answers[0] ?? '', (v) => { q.answers = [v]; }, { 'data-testid': 'q-answer', inputmode: 'decimal' }),
      );
    }
    return wrap;
  }

  function questionRow(zone, q, qi) {
    const type = lockable(el('select', { class: 'form-select form-select-sm', 'aria-label': 'Question kind', 'data-testid': 'q-type' },
      ...Object.entries(TYPE_LABELS).map(([v, l]) => el('option', { value: v, selected: v === q.type }, l))));
    type.addEventListener('change', () => {
      q.type = type.value;
      q.answers = q.type === 'photo' ? [] : [q.answers[0] ?? ''];
      touch();
      render();
    });
    const text = lockable(el('textarea', { class: 'form-control mb-2', rows: '2', maxlength: '500', 'data-testid': 'q-text', 'aria-label': q.type === 'photo' ? 'What teams must photograph' : 'Question' }, q.text));
    text.addEventListener('input', () => { q.text = text.value; touch(); });
    const score = textInput(String(q.score), (v) => { q.score = v === '' ? NaN : Number(v); }, { type: 'number', min: '0', max: '1000', step: '0.5', 'aria-label': 'Points', 'data-testid': 'q-score' });

    return el('div', { class: 'editor-question card card-body mb-2', 'data-testid': 'editor-question' },
      el('div', { class: 'd-flex flex-wrap gap-2 align-items-center mb-2' },
        el('strong', {}, `${qi + 1}.`), el('div', { class: 'flex-grow-1' }, type),
        el('div', { class: 'd-flex align-items-center gap-1' }, el('span', { class: 'small text-muted' }, 'pts'), el('div', { class: 'score-box' }, score)),
        button('↑', () => move(zone.questions, qi, -1), 'btn-outline-secondary', { 'aria-label': 'Move up' }),
        button('↓', () => move(zone.questions, qi, 1), 'btn-outline-secondary', { 'aria-label': 'Move down' }),
        button('Copy', () => { zone.questions.splice(qi + 1, 0, { ...structuredClone(q), id: nextId('q', zone.questions.map((x) => x.id)) }); touch(); render(); }, 'btn-outline-secondary', { 'aria-label': 'Duplicate question', 'data-testid': 'q-copy' }),
        button('✕', () => { zone.questions.splice(qi, 1); touch(); render(); }, 'btn-outline-danger', { 'aria-label': 'Remove question' })),
      text, answersField(q));
  }

  function mapSection(zone) {
    const wrap = el('div', { class: 'mb-3' });
    const status = el('span', { class: 'small text-muted ms-2' });
    const file = lockable(el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', class: 'form-control form-control-sm', 'aria-label': `Map image for ${zone.name || 'zone'}`, 'data-testid': 'map-file' }));
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      status.textContent = 'Shrinking and uploading...';
      const shrunk = await shrinkMap(file.files[0]);
      if (!shrunk) { status.textContent = 'That file could not be used as an image.'; return; }
      const res = await postJson(`${ctx.base}/zones/${zone.id}/map`, shrunk);
      if (!res.ok) { status.textContent = explain(res); return; }
      zone.map = res.body.map;
      touch();
      render();
    });
    if (zone.map) {
      wrap.append(
        el('img', { src: zone.map.thumb, alt: `Map of ${zone.name}`, class: 'rounded border d-block mb-2', width: '160' }),
        button('Remove map', () => { zone.map = null; touch(); render(); }, 'btn-outline-danger'),
        el('div', { class: 'mt-2' }, file));
    } else {
      wrap.append(el('label', { class: 'form-label small mb-1' }, 'Map image (optional): players can zoom in on it'), file);
    }
    wrap.append(status);
    return wrap;
  }

  function zoneCard(zone, zi) {
    const add = (type) => { zone.questions.push(blankQuestion(zone, type)); touch(); render(); };
    return el('section', { class: 'editor-zone card card-body mb-3', 'data-testid': 'editor-zone' },
      el('div', { class: 'd-flex flex-wrap gap-2 align-items-end mb-3' },
        el('div', { class: 'flex-grow-1' }, el('label', { class: 'form-label small mb-1' }, `Zone ${zi + 1} name`),
          textInput(zone.name, (v) => { zone.name = v; }, { maxlength: '60', 'data-testid': 'zone-name-input', placeholder: 'e.g. Southside' })),
        button('↑', () => move(state.zones, zi, -1), 'btn-outline-secondary', { 'aria-label': 'Move zone up' }),
        button('↓', () => move(state.zones, zi, 1), 'btn-outline-secondary', { 'aria-label': 'Move zone down' }),
        button('Copy zone', () => { state.zones.splice(zi + 1, 0, { ...structuredClone(zone), id: nextId('z', state.zones.map((x) => x.id)), name: `${zone.name} (copy)`.slice(0, 60) }); touch(); render(); }, 'btn-outline-secondary', { 'data-testid': 'zone-copy' }),
        button('Remove zone', () => {
          if (confirm(`Remove ${zone.name || 'this zone'} and its ${zone.questions.length} question(s)?`)) { state.zones.splice(zi, 1); touch(); render(); }
        }, 'btn-outline-danger')),
      mapSection(zone),
      ...zone.questions.map((q, qi) => questionRow(zone, q, qi)),
      el('div', { class: 'd-flex flex-wrap gap-2' },
        button('Add question', () => add('string'), 'btn-outline-primary', { 'data-testid': 'add-question' }),
        button('Add photo challenge', () => add('photo'), 'btn-outline-primary', { 'data-testid': 'add-photo' })),
      el('p', { class: 'small text-muted mt-2 mb-0' }, 'A zone does not need a photo challenge.'));
  }
  const addZoneButton = () => button('Add zone', () => { state.zones.push(blankZone(state)); touch(); render(); }, 'btn-primary', { 'data-testid': 'add-zone' });

  const instructions = lockable(el('textarea', { id: 'instructions', class: 'form-control', rows: '8', maxlength: '20000', 'data-testid': 'instructions-input' }, state.instructions));
  const preview = el('div', { class: 'border rounded p-2 bg-white', 'data-testid': 'instructions-preview' });
  const paintPreview = () => preview.replaceChildren(state.instructions.trim() ? renderMarkdown(state.instructions) : el('span', { class: 'text-muted small' }, 'Nothing to show yet.'));
  instructions.addEventListener('input', () => { state.instructions = instructions.value; touch(); paintPreview(); });
  paintPreview();

  const save = lockable(el('button', { type: 'button', class: 'btn btn-success btn-lg', 'data-testid': 'save-content' }, 'Save questions'));
  save.addEventListener('click', async () => {
    save.disabled = true;
    const res = await putJson(`${ctx.base}/content`, state);
    save.disabled = locked;
    if (res.ok) { dirty = false; say('Saved.', true); await ctx.reload(); return; }
    if (res.body?.error === 'invalid-content') say('Please fix:', false, (res.body.problems ?? []).map((p) => describeProblem(p, state)));
    else say(explain(res), false);
  });

  render();
  body.replaceChildren(...[
    locked ? el('p', { class: 'alert alert-warning' }, 'Teams have already joined, so the questions are locked. Delete the player data on the Overview tab to change them.') : null,
    el('p', { class: 'text-muted small' }, 'A hunt has zones (areas, each with an optional map). Each zone has questions and, if you like, photo challenges. Text answers allow small typos. Players see questions only while the game is running.'),
    root,
    el('section', { class: 'card card-body mb-3' },
      el('label', { class: 'form-label fw-semibold', for: 'instructions' }, 'Instructions for players (optional)'),
      el('p', { class: 'small text-muted mb-1' }, 'Plain text with simple formatting: # headings, - bullet points, **bold**, *italic*. Shown on the play page.'),
      instructions,
      el('div', { class: 'small text-muted mt-2 mb-1' }, 'How players will see it:'), preview),
    save, message].filter(Boolean));
  return () => { window.onbeforeunload = null; };
}
