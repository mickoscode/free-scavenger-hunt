// Share the hunt (link and QR code), see where it stands, and the dangerous things.
import { el } from './dom.js';
import { deleteJson, postJson } from './api.js';
import { explain } from './admin-shell.js';
import { countQuestionsOf } from './content-model.js';
import { qrPng } from './qr.js';
import { openShare, shareIcon } from './share-dialog.js';

export async function mountOverview(body, ctx) {
  const d = ctx.data;
  const url = `${location.origin}/e/${d.org}/${d.slug}/`;
  const share = () => openShare({ name: d.config.name, url, fileName: `${d.slug}-qr.png` });
  // The QR code is a button: click it for a big one to download or print. The heading is a link that opens the same dialog.
  const qrButton = el('button', { type: 'button', class: 'qr-button', title: 'Click to download or print the QR code', 'aria-label': 'QR code: click to download, print or share', 'data-testid': 'qr-open' },
    el('img', { src: qrPng(url, 440), alt: 'QR code for the hunt address' }));
  qrButton.addEventListener('click', share);
  const qr = el('div', { class: 'qr border rounded p-1 bg-white', 'data-testid': 'qr' }, qrButton, el('div', { class: 'qr-hint small text-muted text-center' }, 'Click to download or print'));
  const shareLink = el('button', { type: 'button', class: 'btn btn-link share-link p-0', 'data-testid': 'share-open' }, shareIcon(), ' Share this hunt');
  shareLink.addEventListener('click', share);
  const questions = countQuestionsOf(d.content);

  const checklist = el('ul', { class: 'list-unstyled mb-0', 'data-testid': 'checklist' },
    item(questions > 0, `Questions: ${questions} in ${d.content.zones.length} zone${d.content.zones.length === 1 ? '' : 's'}`, '#questions', 'Add questions'),
    item(true, `When: ${d.config.day}, ${d.config.start} to ${d.config.end} (${d.config.timeZone})`, '#settings', 'Change'),
    item(d.teamCount > 0, `${d.teamCount} team${d.teamCount === 1 ? '' : 's'} joined`, '#teams', 'View teams'));

  const shareCard = el('section', { class: 'card card-body mb-3' },
    el('h2', { class: 'h5' }, shareLink),
    el('div', { class: 'd-flex flex-wrap gap-3 align-items-start' }, qr,
      el('div', {}, el('p', { class: 'mb-1' }, 'Players scan the QR code or open:'),
        el('p', { class: 'fw-semibold team-name' }, el('a', { href: url, target: '_blank', rel: 'noopener', 'data-testid': 'event-link' }, url)),
        el('p', { class: 'small text-muted mb-0' }, d.config.joinCode ? 'A join code is set: tell players the code in person.' : 'No join code is set: anyone with the link can join.'))));

  const dangerResult = el('p', { class: 'mt-2 mb-0', role: 'status', hidden: true });
  const say = (text, ok) => { dangerResult.hidden = false; dangerResult.className = `mt-2 mb-0 ${ok ? 'text-success' : 'text-danger'}`; dangerResult.textContent = text; };

  const confirmData = el('input', { class: 'form-control', placeholder: 'type delete', 'data-testid': 'confirm-delete-data', autocomplete: 'off' });
  const override = el('input', { class: 'form-control', placeholder: 'type override (only while the game is running)', 'data-testid': 'override', autocomplete: 'off', hidden: d.status !== 'active' });
  const dataButton = el('button', { type: 'button', class: 'btn btn-outline-danger', 'data-testid': 'delete-data' }, 'Delete all player data');
  dataButton.addEventListener('click', async () => {
    const res = await postJson(`${ctx.base}/player-data/delete`, { confirm: confirmData.value, ...(override.value ? { override: override.value } : {}) });
    if (res.ok) { say('Deleted. The hunt has no teams or scores now.', true); confirmData.value = ''; await ctx.reload(); } else say(explain(res), false);
  });

  const confirmEvent = el('input', { class: 'form-control', placeholder: `type ${d.slug}`, 'data-testid': 'confirm-delete-event', autocomplete: 'off' });
  const eventButton = el('button', { type: 'button', class: 'btn btn-danger', 'data-testid': 'delete-event' }, 'Delete this hunt');
  eventButton.addEventListener('click', async () => {
    const res = await deleteJson(ctx.base, { confirm: confirmEvent.value });
    if (res.ok) location.href = '/admin/'; else say(explain(res), false);
  });

  const danger = el('section', { class: 'card card-body border-danger' },
    el('h2', { class: 'h5 text-danger' }, 'Danger zone'),
    el('p', { class: 'small' }, 'Deleting player data removes every team, answer and score (useful after testing) and starts team numbers again at 1. Deleting the hunt removes everything.'),
    el('div', { class: 'row g-2 mb-3' }, el('div', { class: 'col-12 col-md-5' }, confirmData), el('div', { class: 'col-12 col-md-5' }, override), el('div', { class: 'col-12 col-md-auto' }, dataButton)),
    el('div', { class: 'row g-2' }, el('div', { class: 'col-12 col-md-5' }, confirmEvent), el('div', { class: 'col-12 col-md-auto' }, eventButton)),
    dangerResult);

  body.replaceChildren(shareCard, el('section', { class: 'card card-body mb-3' }, el('h2', { class: 'h5' }, 'Checklist'), checklist), danger);
}

function item(done, text, href, linkText) {
  return el('li', { class: 'mb-1' }, el('span', { 'aria-hidden': 'true', class: done ? 'text-success' : 'text-muted' }, done ? '✓ ' : '○ '), text, ' ', el('a', { href, class: 'small' }, linkText));
}
