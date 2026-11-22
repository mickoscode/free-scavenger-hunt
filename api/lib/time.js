// Time zones and the game window. "now" is always passed in: the server clock is the only clock that counts.
const formatters = new Map();
function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    }));
  }
  return formatters.get(timeZone);
}

export function isTimeZone(id) {
  if (typeof id !== 'string' || id.length > 60 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(id)) return false;
  try {
    formatterFor(id);
    return true;
  } catch {
    return false;
  }
}

export const listTimeZones = () => (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []);

function zoneOffsetMs(utcMs, timeZone) {
  const p = Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(utcMs)).map((x) => [x.type, +x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

// The instant (UTC ms) at which the wall clock in timeZone reads dateStr timeStr ("2026-11-14", "09:30").
export function localToUtcMs(dateStr, timeStr, timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, h, mi);
  const guess = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  return wallAsUtc - zoneOffsetMs(guess, timeZone);
}

export const isRealDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
