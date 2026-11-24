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

// A moment as the hunt's own clock shows it: its date (YYYY-MM-DD), the time (HH:MM) and the date in words ("Friday 27 Nov"). An unknown
// time zone falls back to UTC.
function inZone(ms, timeZone) {
  const make = (zone) => ({
    date: new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }),
    time: new Intl.DateTimeFormat('en-AU', { timeZone: zone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }),
    words: new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'short' }),
  });
  let f;
  try { f = make(timeZone ?? 'UTC'); } catch { f = make('UTC'); }
  const part = (type) => f.words.formatToParts(ms).find((p) => p.type === type)?.value ?? '';
  return { date: f.date.format(ms), time: f.time.format(ms), words: `${part('weekday')} ${part('day')} ${part('month')}` };
}

// What the page says before the game starts, in the hunt's own time zone:
//   another day:  "Game starts at 16:50 on Friday 27 Nov"
//   the same day: "Game starts in 5 hours", then in minutes once under an hour, then m:ss for the last 5 minutes.
export function preStartText(startMs, nowMs, timeZone) {
  const start = inZone(startMs, timeZone);
  if (start.date !== inZone(nowMs, timeZone).date) return `Game starts at ${start.time} on ${start.words}`;
  const left = Math.max(0, startMs - nowMs);
  const minutes = Math.ceil(left / 60_000);
  if (minutes >= 60) { const hours = Math.ceil(minutes / 60); return `Game starts in ${hours} hour${hours === 1 ? '' : 's'}`; }
  return `Game starts in ${formatDuration(left)}`;
}

export function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] ?? 'th'}`;
}
export const MEDALS = { 1: ['🥇', 'gold medal'], 2: ['🥈', 'silver medal'], 3: ['🥉', 'bronze medal'] };

export const STATUS_TEXT = { unconfigured: 'Coming soon', pre: 'Game starts in', active: 'Time left', post: 'Game over' };
