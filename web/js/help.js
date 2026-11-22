// The small round "?" that shows or hides an explanation, so forms stay short and the detail is there when wanted.
import { el } from './dom.js';

// Returns the button; the text starts hidden and the button toggles it.
export function helpToggle(label, text) {
  text.hidden = true;
  const button = el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary help-toggle', 'aria-label': `About ${label}`, 'aria-expanded': 'false', 'data-testid': 'help-toggle' }, '?');
  button.addEventListener('click', () => { text.hidden = !text.hidden; button.setAttribute('aria-expanded', String(!text.hidden)); });
  return button;
}

// For pages written as plain HTML: <p data-help-for="some-id">...</p> becomes a "?" beside the element with that id (a label or a heading).
// The text is hidden until the "?" is pressed.
export function enhanceHelp(root = document) {
  for (const text of root.querySelectorAll('[data-help-for]')) {
    const target = root.getElementById ? root.getElementById(text.dataset.helpFor) : root.querySelector(`#${text.dataset.helpFor}`);
    if (!target || target.dataset.helped) continue;
    target.dataset.helped = '1';
    const button = helpToggle((target.textContent || 'this').trim().replace(/\s*\(.*$/, ''), text);
    if (target.tagName === 'LABEL') { // a label stays a label; it and the "?" share a row
      const row = el('div', { class: 'd-flex align-items-center gap-2 mb-1' });
      target.replaceWith(row);
      target.classList.add('mb-0');
      row.append(target, button);
    } else { target.append(' ', button); }
  }
}
