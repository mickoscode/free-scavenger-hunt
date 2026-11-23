// Name, time zone, day, start and end, team names, join code and WhatsApp link.
import { el } from './dom.js';
import { helpToggle } from './help.js';
import { keepTimesInOrder } from './time-guard.js';
import { putJson } from './api.js';
import { explain } from './admin-shell.js';
import { fillTimeZones } from './timezones.js';

const FIELD_NAMES = {
  name: 'the name', timeZone: 'the time zone', day: 'the day', start: 'the start time', end: 'the end time', 'end-before-start': 'the end time (it must be after the start)',
  whatsappUrl: 'the WhatsApp link (it must look like https://chat.whatsapp.com/AbCdEf123)', joinCode: 'the join code (5 to 12 letters and digits)',
};

function field(label, input, help) {
  const wrap = el('div', { class: 'mb-3' });
  const row = el('div', { class: 'd-flex align-items-center gap-2 mb-1' }, el('label', { class: 'form-label mb-0', for: input.id }, label));
  if (help) {
    const text = el('p', { class: 'small text-muted mb-1', hidden: true }, help);
    row.append(helpToggle(label, text));
    wrap.append(row, text, input);
  } else wrap.append(row, input);
  return wrap;
}

export async function mountSettings(body, ctx) {
  const c = ctx.data.config;
  const locked = ctx.data.status === 'active';
  const i = (id, attrs = {}) => el('input', { id, class: 'form-control', ...attrs });
  const name = i('s-name', { maxlength: '80', value: c.name, 'data-testid': 'set-name' });
  const tz = el('select', { id: 's-tz', class: 'form-select', 'data-testid': 'set-tz' });
  fillTimeZones(tz, c.timeZone);
  const day = i('s-day', { type: 'date', value: c.day, 'data-testid': 'set-day' });
  const start = i('s-start', { type: 'time', value: c.start, 'data-testid': 'set-start' });
  const end = i('s-end', { type: 'time', value: c.end, 'data-testid': 'set-end' });
  // Start and end stay in order without a word of explanation: changing one moves the other to 10 minutes away if it would be out of order.
  // Done when a field is left, or a moment after its last change (a half-typed "1" on the way to "18" must not drag the other field around),
  // and always just before saving (Enter or Save pressed while still in a time field). Different browsers and phone pickers report a change
  // as "input", as "change" or only when the field is left, so all three are listened to.
  let lastChanged = null;
  function guardTimes(changed = lastChanged) {
    if (!changed) return;
    const fixed = keepTimesInOrder(start.value, end.value, changed);
    start.value = fixed.start;
    end.value = fixed.end;
  }
  // ONE pending check for both fields, so the most recent edit always wins (a check still waiting for the start must not fire after the end
  // was edited and undo it).
  let timer = null;
  for (const [input, which] of [[start, 'start'], [end, 'end']]) {
    const soon = () => { lastChanged = which; clearTimeout(timer); timer = setTimeout(() => guardTimes(which), 600); };
    input.addEventListener('input', soon);
    input.addEventListener('change', soon);
    input.addEventListener('blur', () => { clearTimeout(timer); guardTimes(which); });
  }
  const names = el('input', { id: 's-names', type: 'checkbox', class: 'form-check-input', checked: c.teamNames, 'data-testid': 'set-team-names' });
  const code = i('s-code', { maxlength: '30', value: c.joinCode, autocomplete: 'off', 'data-testid': 'set-join-code' });
  const wa = i('s-wa', { type: 'url', value: c.whatsappUrl, placeholder: 'https://chat.whatsapp.com/...', 'data-testid': 'set-whatsapp' });
  const override = i('s-override', { placeholder: 'type override', autocomplete: 'off', hidden: !locked, 'data-testid': 'set-override' });
  const inputs = [name, tz, day, start, end, names, code, wa];
  for (const x of inputs) x.disabled = locked;

  const save = el('button', { type: 'submit', class: 'btn btn-primary', 'data-testid': 'save-settings' }, 'Save settings');
  const message = el('p', { class: 'mt-2 mb-0', role: 'status', hidden: true });
  const test = el('a', { class: 'btn btn-outline-secondary btn-sm', target: '_blank', rel: 'noopener noreferrer', href: '#', hidden: true }, 'Test link');
  const syncTest = () => { const ok = /^https:\/\/chat\.whatsapp\.com\//.test(wa.value.trim()); test.hidden = !ok; if (ok) test.href = wa.value.trim(); };
  wa.addEventListener('input', syncTest);
  syncTest();
  override.addEventListener('input', () => { for (const x of inputs) x.disabled = locked && override.value !== 'override'; });

  const form = el('form', { class: 'card card-body', novalidate: true, 'data-testid': 'settings-form' },
    locked ? el('p', { class: 'alert alert-warning' }, 'The game is running, so settings are locked. To change them anyway, type "override" in the box.') : null,
    field('Name', name),
    field('Time zone', tz, 'The times below are in this zone. Players anywhere see the right countdown.'),
    el('div', { class: 'row' }, el('div', { class: 'col-12 col-md-4' }, field('Day', day, 'A hunt is played on a single day.')), el('div', { class: 'col-6 col-md-4' }, field('Start', start)), el('div', { class: 'col-6 col-md-4' }, field('End', end, 'Answers are accepted from the start until the end time, exactly. The end must be after the start.'))),
    el('div', { class: 'form-check mb-3' }, names, el('label', { class: 'form-check-label', for: 's-names' }, 'Teams choose a name')),
    field('Join code (optional)', code, 'A short code (5 to 12 letters and digits) you tell players in person, so only people at your event can join. Leave empty to let anyone with the link join. Case, spaces and dashes are ignored.'),
    el('div', { class: 'mb-3' }, field('WhatsApp group link (optional)', wa, 'Players send photo challenges to a WhatsApp group you run. When you add its invite link, the word WhatsApp becomes a link on the play page. Only links of the form https://chat.whatsapp.com/... are accepted.'), test),
    override,
    el('div', {}, save), message);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    message.hidden = true;
    guardTimes(); // the last field changed may still be waiting for its check
    const res = await putJson(`${ctx.base}/config`, {
      name: name.value, timeZone: tz.value, day: day.value, start: start.value, end: end.value, teamNames: names.checked, joinCode: code.value, whatsappUrl: wa.value,
      ...(override.value ? { override: override.value } : {}),
    });
    message.hidden = false;
    if (res.ok) {
      message.className = 'mt-2 mb-0 text-success';
      message.textContent = 'Saved.';
      await ctx.reload();
    } else {
      message.className = 'mt-2 mb-0 text-danger';
      message.textContent = res.body?.problems ? `Please check ${res.body.problems.map((p) => FIELD_NAMES[p] ?? p).join(', ')}.` : explain(res);
    }
  });
  body.replaceChildren(form);
}
