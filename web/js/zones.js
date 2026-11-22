// The zones on the play page: tiles (map thumbnail, name, progress), a panel per zone with its map, one form per question and
// each photo challenge, and a full-size map view. Everything a player sees is text set with textContent.
//
// Each question and photo can be submitted ONCE. A form is marked done only when the server has confirmed it, and from then on
// it shows "Done" and nothing else: never what was submitted, never whether it was right.
import { el } from './dom.js';
import { postJson } from './api.js';
import { sanitizeAnswer } from './answer-input.js';
import { linkWhatsApp, safeWhatsAppUrl } from './markdown.js';
import './top-link.js';

const MESSAGES = {
  'invalid-answer': 'Please enter an answer in the right format.',
  'not-playing': 'The game has ended, so answers are closed.',
  network: 'Could not send. Check your connection and try again.',
};
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const keyOf = (zone, q) => `${zone.id}#${q.id}`;
const isPhoto = (q) => q.type === 'photo';

export function createZones({ container, base, onSubmitted }) {
  let zones = [];
  let renderedKey = null;
  const tiles = new Map();
  const panels = new Map();
  const done = { answers: new Set(), photos: new Set() };
  let whatsappUrl = null;

  // ---- full-size map
  const overlay = el('div', { class: 'map-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Zone map', 'data-testid': 'map-overlay' });
  const overlayImage = el('img', { alt: 'Zone map, full size', 'data-testid': 'map-full' });
  const closeButton = el('button', { type: 'button', class: 'btn btn-light close', 'data-testid': 'map-close' }, 'Close');
  overlay.append(closeButton, overlayImage);
  overlay.hidden = true;
  let opener = null;
  const closeMap = () => { overlay.hidden = true; overlayImage.removeAttribute('src'); opener?.focus(); };
  closeButton.addEventListener('click', closeMap);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) closeMap(); });

  // ---- progress
  const isDone = (zone, q) => (isPhoto(q) ? done.photos : done.answers).has(keyOf(zone, q));
  function setRemaining(node, left) {
    const bold = el('strong', {}, left > 0 ? String(left) : 'completed');
    node.replaceChildren(...(left > 0 ? [bold, ' to complete'] : [bold]));
  }
  function updateProgress(zone) {
    const total = zone.questions.length;
    const n = zone.questions.filter((q) => isDone(zone, q)).length;
    tiles.get(zone.id).dataset.done = String(n);
    setRemaining(tiles.get(zone.id).querySelector('[data-testid="zone-progress"]'), total - n);
    setRemaining(panels.get(zone.id).querySelector('[data-testid="panel-progress"]'), total - n);
  }
  function markDone(form, zone) {
    form.dataset.state = 'done';
    for (const c of form.querySelectorAll('input, button')) c.disabled = true;
    const input = form.querySelector('input');
    if (input) input.value = '';
    form.querySelector('[data-testid="done-badge"]').hidden = false;
    form.querySelector('[data-testid="form-error"]').hidden = true;
    updateProgress(zone);
  }
  function applyDone(summary) {
    done.answers = new Set(summary.answers);
    done.photos = new Set(summary.photos);
    for (const zone of zones) {
      for (const q of zone.questions) {
        if (isDone(zone, q)) markDone(panels.get(zone.id).querySelector(`[data-question="${q.id}"]`), zone);
      }
      updateProgress(zone);
    }
  }

  // ---- submitting
  async function submit({ form, zone, path, data, kind, key }) {
    const error = form.querySelector('[data-testid="form-error"]');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    error.hidden = true;
    const res = await postJson(path, data);
    if (res.ok || res.body?.error === 'already-submitted') {
      done[kind].add(key);
      markDone(form, zone);
      onSubmitted();
      return;
    }
    if (res.status === 401) return location.replace('../');
    const code = res.status === 0 ? 'network' : (res.body?.error ?? 'unknown');
    error.dataset.error = code;
    error.textContent = MESSAGES[code] ?? GENERIC_ERROR;
    error.hidden = false;
    button.disabled = false;
  }

  const numberLabel = (zone, n) => el('div', { class: 'q-number', 'data-testid': 'q-number' }, `Question ${n} of ${zone.questions.length}`);

  function buildQuestion(zone, q, n) {
    const form = el('form', { class: 'card card-body mb-3', novalidate: true, 'data-testid': 'question', 'data-question': q.id, 'data-state': 'open' });
    const inputId = `a-${zone.id}-${q.id}`;
    const input = el('input', {
      id: inputId, name: 'answer', type: 'text', maxlength: '200', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      class: 'form-control form-control-lg mt-2', 'data-testid': 'answer-input', 'data-type': q.type,
      inputmode: q.type === 'whole-number' ? 'numeric' : q.type === 'decimal' ? 'decimal' : null,
    });
    input.addEventListener('input', () => { const c = sanitizeAnswer(q.type, input.value); if (c !== input.value) input.value = c; });
    const badge = el('span', { class: 'badge text-bg-success fs-6 mt-2', 'data-testid': 'done-badge' }, 'Done');
    badge.hidden = true;
    const error = el('p', { class: 'text-danger mt-2 mb-0', role: 'alert', 'data-testid': 'form-error' });
    error.hidden = true;
    form.append(
      numberLabel(zone, n),
      el('div', { class: 'd-flex justify-content-between gap-2' }, el('label', { for: inputId, class: 'fw-semibold' }, q.text), el('span', { class: 'text-muted small text-nowrap' }, `${q.score} pts`)),
      input,
      el('div', { class: 'd-flex align-items-center gap-2' }, el('button', { type: 'submit', class: 'btn btn-primary mt-2', 'data-testid': 'answer-submit' }, 'Submit'), badge),
      error,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit({ form, zone, path: `${base}/answer`, kind: 'answers', key: keyOf(zone, q), data: { zone: zone.id, question: q.id, answer: input.value } });
    });
    return form;
  }

  function buildPhoto(zone, photo, index, count, n) {
    const form = el('form', { class: 'card card-body mb-3 border-primary', novalidate: true, 'data-testid': 'photo', 'data-question': photo.id, 'data-state': 'open' });
    const badge = el('span', { class: 'badge text-bg-success fs-6', 'data-testid': 'done-badge' }, 'Done');
    badge.hidden = true;
    const error = el('p', { class: 'text-danger mt-2 mb-0', role: 'alert', 'data-testid': 'form-error' });
    error.hidden = true;
    const openGroup = el('a', { class: 'btn btn-outline-success btn-sm mb-2 align-self-start', target: '_blank', rel: 'noopener noreferrer', 'data-testid': 'whatsapp-open' }, 'Open WhatsApp group');
    openGroup.hidden = true;
    form.append(
      numberLabel(zone, n),
      el('div', { class: 'fw-semibold' }, `Photo challenge${count > 1 ? ` ${index + 1}` : ''} (${photo.score} pts)`),
      el('p', { class: 'my-2', 'data-testid': 'photo-challenge' }, photo.text),
      openGroup,
      el('div', { class: 'd-flex align-items-center gap-2' }, el('button', { type: 'submit', class: 'btn btn-primary', 'data-testid': 'photo-submit' }, 'Photo sent to WhatsApp'), badge),
      error,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit({ form, zone, path: `${base}/photo`, kind: 'photos', key: keyOf(zone, photo), data: { zone: zone.id, question: photo.id } });
    });
    return form;
  }

  function buildTile(zone) {
    const tile = el('button', { type: 'button', class: 'card h-100 w-100 text-start p-0 zone-tile', 'data-testid': 'zone-tile', 'data-zone': zone.id });
    if (zone.map) tile.append(el('img', { src: zone.map.thumb, alt: `Map of ${zone.name}`, class: 'card-img-top', loading: 'lazy' }));
    tile.append(el('div', { class: 'card-body p-2 d-flex align-items-center gap-2' },
      el('div', { class: 'flex-grow-1 min-w-0' }, el('div', { class: 'fw-semibold team-name', 'data-testid': 'zone-name' }, zone.name), el('div', { class: 'small text-muted', 'data-testid': 'zone-progress' })),
      el('span', { class: 'tile-chevron', 'aria-hidden': 'true' }, '›')));
    tile.addEventListener('click', () => { location.hash = zone.id; });
    return tile;
  }

  function buildPanel(zone) {
    const panel = el('section', { 'data-testid': 'zone-panel', 'data-zone': zone.id });
    panel.hidden = true;
    const back = el('button', { type: 'button', class: 'btn btn-outline-primary btn-sm', 'data-testid': 'zone-back' }, '‹ All zones');
    back.addEventListener('click', () => { location.hash = ''; });
    const backBottom = el('button', { type: 'button', class: 'btn btn-outline-primary w-100 mt-3', 'data-testid': 'zone-back-bottom' }, '‹ All zones');
    backBottom.addEventListener('click', () => { location.hash = ''; window.scrollTo(0, 0); });
    const photos = zone.questions.filter(isPhoto);
    const parts = [
      el('div', { class: 'd-flex justify-content-between align-items-center mb-2' }, back, el('span', { class: 'text-muted small', 'data-testid': 'panel-progress' })),
      el('h2', { class: 'h4 team-name', 'data-testid': 'panel-name' }, zone.name),
    ];
    if (zone.map) {
      const mapButton = el('button', { type: 'button', class: 'map-button p-0 border-0 bg-transparent w-100', 'data-testid': 'map-open' },
        el('img', { src: zone.map.thumb, alt: `Map of ${zone.name}. Tap to enlarge.`, class: 'rounded border' }));
      mapButton.addEventListener('click', () => { opener = mapButton; overlayImage.src = zone.map.full; overlay.hidden = false; closeButton.focus(); });
      parts.push(mapButton, el('p', { class: 'small text-muted mt-1 mb-3' }, 'Tap the map to enlarge it.'));
    }
    zone.questions.forEach((q, i) => parts.push(isPhoto(q) ? buildPhoto(zone, q, photos.indexOf(q), photos.length, i + 1) : buildQuestion(zone, q, i + 1)));
    parts.push(backBottom, el('a', { href: '#top', class: 'btn btn-link w-100', 'data-testid': 'zone-top' }, '↑ Back to top'));
    panel.append(...parts);
    return panel;
  }

  const tilesView = el('div', { class: 'row row-cols-2 g-3', 'data-testid': 'zone-tiles' });
  function showFromHash() {
    const wanted = zones.find((z) => z.id === location.hash.slice(1));
    for (const [id, panel] of panels) panel.hidden = !(wanted && wanted.id === id);
    tilesView.hidden = Boolean(wanted);
    if (!wanted && !overlay.hidden) closeMap();
    if (wanted) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', showFromHash);

  function setWhatsApp(url) {
    whatsappUrl = safeWhatsAppUrl(url);
    for (const panel of panels.values()) {
      for (const open of panel.querySelectorAll('[data-testid="whatsapp-open"]')) {
        open.hidden = !whatsappUrl;
        if (whatsappUrl) open.href = whatsappUrl; else open.removeAttribute('href');
      }
      for (const c of panel.querySelectorAll('[data-testid="photo-challenge"]')) linkWhatsApp(c, whatsappUrl);
    }
  }

  return {
    setWhatsApp,
    applyDone,
    // Builds the zones when they change (and only then, so typing is never wiped by a refresh).
    render(next) {
      const key = JSON.stringify(next);
      if (key === renderedKey) return;
      renderedKey = key;
      zones = next;
      tiles.clear();
      panels.clear();
      tilesView.replaceChildren();
      const panelNodes = [];
      for (const zone of zones) {
        const tile = buildTile(zone);
        tiles.set(zone.id, tile);
        tilesView.append(el('div', { class: 'col' }, tile));
        const panel = buildPanel(zone);
        panels.set(zone.id, panel);
        panelNodes.push(panel);
      }
      container.replaceChildren(tilesView, ...panelNodes, overlay);
      for (const zone of zones) updateProgress(zone);
      applyDone({ answers: [...done.answers], photos: [...done.photos] });
      setWhatsApp(whatsappUrl);
      showFromHash();
    },
    clear() { renderedKey = null; zones = []; container.replaceChildren(); },
  };
}
