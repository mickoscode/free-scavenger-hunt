// Team names and the scoreboard order.
import { normaliseText } from './answers.js';
import { roundScore } from './scoring.js';

export const MAX_NAME_LENGTH = 30;

// A basic filter, not a promise: names are public and children read them; the event admin can remove a team.
const BLOCKED = {
  whole: ['ass', 'arse', 'tit', 'tits', 'cock', 'dick', 'piss', 'fag', 'fags', 'wog', 'coon', 'spic', 'cunt', 'cunts',
    'wank', 'wanker', 'wankers', 'pedo', 'retard', 'retards', 'retarded'],
  contains: ['fuck', 'shit', 'bitch', 'bastard', 'twat', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'paedo', 'rapist'],
};
const LOOK_ALIKES = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

export function isBlocked(text, blocked = BLOCKED) {
  const mapped = text.toLowerCase().replace(/[013457@$]/g, (c) => LOOK_ALIKES[c]);
  if (mapped.split(/[^a-z]+/).filter(Boolean).some((w) => blocked.whole.includes(w))) return true;
  const letters = mapped.replace(/[^a-z]/g, '');
  return blocked.contains.some((w) => letters.includes(w));
}

// -> { ok: true, name, key } or { ok: false, error: 'empty'|'too-long'|'invalid-characters'|'not-allowed' }.
export function validateTeamName(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'empty' };
  const name = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name === '') return { ok: false, error: 'empty' };
  if ([...name].length > MAX_NAME_LENGTH) return { ok: false, error: 'too-long' };
  if (/[\p{Cc}‪-‮⁦-⁩]/u.test(name)) return { ok: false, error: 'invalid-characters' };
  if (isBlocked(name)) return { ok: false, error: 'not-allowed' };
  return { ok: true, name, key: normaliseText(name) };
}

export const teamLabel = (team, event) => (event.teamNames !== false && team.name ? team.name : `Team ${team.number}`);

// Highest score first, then name A-Z (or number when names are off).
export function sortScoreboard(teams, namesOn = true) {
  return [...teams].sort((a, b) =>
    roundScore(b.score) - roundScore(a.score)
    || (namesOn ? a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) : 0)
    || a.number - b.number);
}
