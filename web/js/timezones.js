// Time zone choices: every zone the browser knows, the browser's own first.
import { el } from './dom.js';

export function fillTimeZones(select, selected) {
  const own = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const known = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [own];
  const all = known.includes('UTC') ? known : [...known, 'UTC'];
  const first = selected ?? own;
  const ids = [first, ...all.filter((z) => z !== first)];
  select.replaceChildren(...ids.map((z) => el('option', { value: z }, z.replace(/_/g, ' '))));
  select.value = first;
}
