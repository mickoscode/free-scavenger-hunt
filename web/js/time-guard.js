// Keeps a hunt's start and end times in order, silently: when one is changed so that end is not after start, the OTHER one moves to
// 10 minutes away. A game never crosses midnight, so the result always stays within 00:00 to 23:59. Pure functions (HH:MM text), no page code.
const GAP = 10;
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toText = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const LAST = 23 * 60 + 59;
const isTime = (t) => /^\d{2}:\d{2}$/.test(t ?? '');

// changed: 'start' or 'end', the one the organiser just edited. -> { start, end } (the same two values when they are already in order).
export function keepTimesInOrder(start, end, changed) {
  if (!isTime(start) || !isTime(end)) return { start, end }; // half-typed or empty: leave it alone
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (e > s) return { start, end };
  if (changed === 'start') {
    if (s < LAST) return { start, end: toText(Math.min(s + GAP, LAST)) }; // +10 minutes, but never into tomorrow
    return { start: toText(LAST - GAP), end: toText(LAST) }; // start at 23:59: no room after it, so the last 10 minutes of the day
  }
  if (e > 0) return { start: toText(Math.max(e - GAP, 0)), end }; // -10 minutes, but never into yesterday
  return { start: toText(0), end: toText(GAP) }; // end at 00:00: no room before it, so the first 10 minutes of the day
}
