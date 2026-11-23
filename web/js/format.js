// Text formatting shared by the pages.
export function formatScore(n) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// "N min" until the last 5 minutes, then m:ss; longer spans in hours, and from 2 days up in days, rounded UP like the minutes are: 3 days and
// 19 hours to go is "4 days" (the way people say it: a Monday night to the Friday after is 4 days).
export function formatDuration(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s <= 300) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const min = Math.ceil(s / 60);
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
  return `${Math.ceil(min / 1440)} days`;
}

export function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] ?? 'th'}`;
}
export const MEDALS = { 1: ['🥇', 'gold medal'], 2: ['🥈', 'silver medal'], 3: ['🥉', 'bronze medal'] };

export const STATUS_TEXT = { unconfigured: 'Coming soon', pre: 'Game starts in', active: 'Time left', post: 'Game over' };
