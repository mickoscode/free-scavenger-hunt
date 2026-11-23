// A hunt address that leads nowhere (the hunt was deleted, or the address is mistyped). Nobody is in a game here, so unlike every page of a
// running game this one DOES lead back to the site: the same header and footer as the front page. Built only when needed,
// so a page that belongs to a game never has a link out of it.
import { $, el } from './dom.js';

export function showLostHunt() {
  if ($('[data-testid="lost-header"]')) return; // the page refreshes every few seconds: build this once
  $('[data-testid="load-error"]').hidden = false;
  for (const sel of ['[data-testid="event-name"]', '[data-testid="status"]', '[data-testid="actions"]']) { const n = $(sel); if (n) n.hidden = true; }
  const main = $('main');
  main.append(el('p', { class: 'text-muted', 'data-testid': 'lost-help' }, 'The hunt may have been deleted by its organiser, or the address may have a typing mistake.'));
  document.title = 'Hunt not found - Free Scavenger Hunt';
  document.body.prepend(el('header', { class: 'site-header', 'data-testid': 'lost-header' },
    el('div', { class: 'container site-header-inner' },
      el('a', { class: 'site-brand', href: '/' }, el('span', { 'aria-hidden': 'true' }, '🧭'), ' Free Scavenger Hunt'),
      el('nav', { class: 'site-nav', 'aria-label': 'Site' }, el('a', { href: '/about/' }, 'About'), el('a', { href: '/help/' }, 'Help')))));
  document.body.append(el('footer', { class: 'site-footer', 'data-testid': 'lost-footer' },
    el('div', { class: 'container' },
      el('span', { class: 'footer-made' }, 'Made in Perth, Western Australia'),
      el('nav', { class: 'footer-links', 'aria-label': 'Footer' }, el('a', { href: '/' }, 'Home'), el('a', { href: '/about/' }, 'About'), el('a', { href: '/help/' }, 'Help')))));
}
