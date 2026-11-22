// The play page: team number and name, status and countdown, instructions, zone tiles and question forms.
import { $, el } from './dom.js';
import { eventBase, eventSlug, eventUrl, getJson } from './api.js';
import { createStatusLine } from './clock.js';
import { linkWhatsApp, renderMarkdown } from './markdown.js';
import { createZones } from './zones.js';

const slug = eventSlug();
const base = eventBase(slug);
const status = createStatusLine($('[data-testid="status"]'));
const message = $('[data-testid="message"]');
let info = null;
let me = null;
let instructionsKey = null;

const zones = createZones({ container: $('#zones'), base, onSubmitted: () => {} });

function paintTeam() {
  $('[data-testid="team-number"]').textContent = `Team ${me.number}`;
  const label = $('[data-testid="team-label"]');
  label.textContent = info?.teamNames === false ? '' : me.name;
}

async function loadPlay() {
  const play = await getJson(`${base}/play`);
  if (!play.ok) return;
  const text = play.body.instructions;
  const panel = $('[data-testid="instructions"]');
  panel.hidden = text.trim() === '';
  if (text !== instructionsKey) {
    instructionsKey = text;
    $('#instructions-body').replaceChildren(renderMarkdown(text));
    linkWhatsApp($('#instructions-body'), me?.whatsappUrl);
  }
  zones.render(play.body.zones);
  zones.setWhatsApp(me?.whatsappUrl);
  zones.applyDone(me.done);
}

function paintPhase() {
  const phase = status.phase();
  $('[data-testid="results-link"]').hidden = !info?.resultsPublished;
  message.hidden = phase !== 'post';
  message.textContent = info?.resultsPublished ? 'The game is over. The final results are in!' : 'The game is over. Final results will be published soon!';
  if (phase === 'post' || phase === 'pre' || phase === 'unconfigured') zones.clear();
  else loadPlay();
}

async function refresh() {
  const [i, m] = await Promise.all([getJson(base), getJson(`${base}/me`)]);
  if (m.status === 401 || i.status === 400) { location.replace(eventUrl(slug)); return; }
  if (!i.ok || !m.ok) return;
  info = i.body;
  me = m.body;
  document.title = `Team ${me.number} - ${info.name}`;
  paintTeam();
  status.update(info);
  paintPhase();
}

status.onPhaseChange(paintPhase);
await refresh();
await loadPlay();
setInterval(refresh, 15000);
