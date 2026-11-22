// The optional code a new team must enter to join: 5-12 letters and digits; case, spaces and dashes are ignored.
import crypto from 'node:crypto';

const normalise = (s) => String(s ?? '').toLowerCase().replace(/[\s-]+/g, '');

export function normaliseJoinCode(input) {
  if (input === undefined || input === null || String(input).trim() === '') return { ok: true, code: '' };
  if (typeof input !== 'string' || !/^[A-Za-z0-9\s-]*$/.test(input)) return { ok: false };
  const plain = normalise(input);
  return /^[a-z0-9]{5,12}$/.test(plain) ? { ok: true, code: plain.toUpperCase() } : { ok: false };
}

const digest = (s) => crypto.createHash('sha256').update(normalise(s)).digest();
export const matchesJoinCode = (typed, code) => typeof typed === 'string' && typed.length <= 100 && crypto.timingSafeEqual(digest(typed), digest(code));
