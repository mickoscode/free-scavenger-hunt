// A team's results as cards. Used on the results page and by the admin to check on a team.
import { el } from './dom.js';
import { MEDALS, ordinal } from './format.js';
import { formatScore } from './format.js';

const pts = (earned, of) => `${formatScore(earned)} of ${formatScore(of)} points`;

function closing(icon, label, cls, earned, of) {
  return el('div', { class: 'result-line' }, el('span', { class: `result-status ${cls}` }, `${icon} ${label}`), el('span', { class: 'result-points' }, pts(earned, of)));
}

function questionCard(q, withAnswers) {
  const card = el('div', { class: 'card card-body mb-2 result-card', 'data-testid': 'result-question' });
  card.append(el('div', { class: 'fw-semibold' }, q.text));
  if (withAnswers) {
    card.append(el('div', { class: 'small text-muted mb-1' },
      el('span', { class: 'me-3' }, `Your answer: ${q.answered ? q.yourAnswer : 'Not answered'}`),
      el('span', {}, `Official answer: ${q.officialAnswers.join(' or ')}`)));
  }
  if (!q.answered) card.append(closing('!', 'Not answered', 'status-warn', 0, q.points));
  else if (q.correct) card.append(closing('✓', 'Correct', 'status-good', q.earned, q.points));
  else card.append(closing('✗', 'Wrong', 'status-bad', q.earned, q.points));
  card.dataset.state = !q.answered ? 'unanswered' : q.correct ? 'correct' : 'wrong';
  return card;
}

function photoCard(p) {
  const card = el('div', { class: 'card card-body mb-2 result-card', 'data-testid': 'result-photo' });
  card.append(el('div', { class: 'fw-semibold' }, 'Photo challenge'), el('div', { class: 'mb-1' }, p.challenge));
  if (!p.submitted) card.append(closing('!', 'No photo submitted', 'status-bad', 0, p.points));
  else if (!p.scored) card.append(closing('!', 'Not scored yet', 'status-bad', 0, p.points));
  else if (p.decision === 'full') card.append(closing('✓', 'Full', 'status-good', p.earned, p.points));
  else if (p.decision === 'half') card.append(closing('✓', 'Half', 'status-half', p.earned, p.points));
  else card.append(closing('✗', 'Zero', 'status-bad', p.earned, p.points));
  card.dataset.state = !p.submitted ? 'none' : !p.scored ? 'unscored' : p.decision;
  return card;
}

// data: { name, results }. withAnswers: false for the summary anyone may see.
export function renderResults(container, { name, results }, { withAnswers = true, own = true } = {}) {
  const medal = MEDALS[results.place];
  const heading = el('h1', { class: 'h2 text-center', 'data-testid': 'place' },
    medal ? el('span', { role: 'img', 'aria-label': medal[1], class: 'me-2' }, medal[0]) : null,
    own ? `You finished ${ordinal(results.place)} of ${results.teamCount}` : `${name} finished ${ordinal(results.place)} of ${results.teamCount}`);
  const nodes = [heading, el('p', { class: 'text-center fs-4', 'data-testid': 'total' }, `${formatScore(results.total)} points`)];
  if (!withAnswers) nodes.push(el('p', { class: 'text-center text-muted small' }, 'This is a summary: answers are only shown to the team itself.'));
  for (const zone of results.zones) {
    nodes.push(el('h2', { class: 'h5 mt-4 team-name' }, zone.name));
    for (const q of zone.questions) nodes.push(questionCard(q, withAnswers));
    for (const p of zone.photos) nodes.push(photoCard(p));
  }
  container.replaceChildren(...nodes);
}
