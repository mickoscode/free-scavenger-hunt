// "Share this hunt": one dialog for everything an organiser does with a hunt's address. The link (copy it, or hand it to the phone's own
// share sheet where there is one), and the QR code (a big one to look at, save as a picture, or print on a sheet with the hunt's name).
import { el } from './dom.js';
import { qrPng } from './qr.js';

const SVG = 'http://www.w3.org/2000/svg';

// The classic share icon: three dots joined by two lines.
export function shareIcon() {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 16 16', width: '1em', height: '1em', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  const add = (tag, attrs) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); svg.append(n); };
  add('path', { d: 'M5.6 7.1 10.4 4.4M5.6 8.9l4.8 2.7' });
  for (const [cx, cy] of [[4, 8], [12, 3.5], [12, 12.5]]) add('circle', { cx, cy, r: '2', fill: 'currentColor' });
  return svg;
}

// The sheet that is printed: the hunt's name, the QR code big, and the address under it. It is only visible when printing (see site.css).
function printSheet({ name, url, qr }) {
  document.getElementById('print-sheet')?.remove();
  const sheet = el('div', { id: 'print-sheet' }, el('h1', {}, name), el('p', { class: 'print-lead' }, 'Scan to join'), el('img', { src: qr, alt: `QR code for ${name}` }), el('p', { class: 'print-url' }, url));
  document.body.append(sheet);
}

async function copyText(text, input) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    input.select(); // an older browser, or no permission: select it so Ctrl+C / Copy works
    try { return document.execCommand('copy'); } catch { return false; }
  }
}

// name: the hunt's name; url: its address; fileName: for the saved picture.
export function openShare({ name, url, fileName }) {
  const qr = qrPng(url, 1024);
  const input = el('input', { class: 'form-control', readonly: true, value: url, 'aria-label': 'Link to the hunt', 'data-testid': 'share-url' });
  input.addEventListener('focus', () => input.select());
  const copy = el('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'share-copy' }, 'Copy link');
  copy.addEventListener('click', async () => {
    const ok = await copyText(url, input);
    copy.textContent = ok ? 'Copied ✓' : 'Press Ctrl+C to copy';
    setTimeout(() => { copy.textContent = 'Copy link'; }, 2200);
  });
  const actions = [copy];
  if (typeof navigator.share === 'function') { // phones, and some computers: the device's own share sheet (messages, WhatsApp, email...)
    const share = el('button', { type: 'button', class: 'btn btn-outline-primary', 'data-testid': 'share-native' }, 'Share…');
    share.addEventListener('click', async () => {
      try { await navigator.share({ title: name, text: `Join "${name}"`, url }); } catch { /* closed without choosing: nothing to do */ }
    });
    actions.push(share);
  }

  const image = el('img', { class: 'share-qr', src: qr, alt: `QR code for ${name}`, 'data-testid': 'share-qr' });
  const download = el('a', { class: 'btn btn-outline-primary', href: qr, download: fileName, 'data-testid': 'share-download' }, 'Download image');
  const print = el('button', { type: 'button', class: 'btn btn-outline-primary', 'data-testid': 'share-print' }, 'Print');
  print.addEventListener('click', () => { printSheet({ name, url, qr }); window.print(); });
  const close = el('button', { type: 'button', class: 'btn btn-outline-secondary', 'data-testid': 'share-close' }, 'Close');

  const dialog = el('dialog', { class: 'share-dialog', 'aria-labelledby': 'share-title', 'data-testid': 'share-dialog' },
    el('h2', { class: 'h5 team-name', id: 'share-title' }, shareIcon(), ' ', `Share ${name}`),
    el('label', { class: 'form-label small mb-1', for: 'share-url' }, 'Link for players'),
    el('div', { class: 'd-flex flex-wrap gap-2' }, el('div', { class: 'flex-grow-1 share-url-box' }, input), ...actions),
    el('hr'),
    el('p', { class: 'small text-muted mb-2' }, 'QR code: players scan it with their phone camera.'),
    image,
    el('div', { class: 'd-flex flex-wrap gap-2 justify-content-center mt-3' }, download, print),
    el('div', { class: 'text-end mt-3' }, close));
  input.id = 'share-url';
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // a click on the dimmed area closes it
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
