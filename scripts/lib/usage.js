// Pure helpers for scripts/usage-report.js: time zones, bucketing CloudWatch datapoints, and the report text. No AWS calls here, so it is tested
// (tests/unit/usage-report.test.js).
//
// The one thing that must be right is TIME ZONES. The AWS CLI prints every Timestamp in the COMPUTER'S local zone with an offset
// ("2026-11-27T16:00:00+08:00"), so a datapoint is read as an instant (Date.parse understands the offset), never by slicing the text.

// ---- time zones
const partsOf = (ms, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
}).formatToParts(ms).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));

// The wall clock in tz at this instant, as if it were UTC: (this minus the instant) is the zone's offset.
const wallAsUtc = (ms, tz) => { const p = partsOf(ms, tz); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second); };
const offsetMs = (ms, tz) => wallAsUtc(ms, tz) - ms;

// An instant -> { date: '2026-11-27', time: '16:45', hour: 16 } as the clock in tz shows it.
export function zoned(ms, tz) {
  const p = partsOf(ms, tz);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, hour: +p.hour };
}

// 'YYYY-MM-DD' (and 'HH:MM') in tz -> the instant. Settled in two passes so a daylight saving change on that day cannot shift it.
export function localToUtcMs(date, tz, time = '00:00') {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetMs(guess, tz);
  return guess - offsetMs(first, tz);
}

export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ---- CloudWatch datapoints
// `aws cloudwatch get-metric-statistics --output json` -> [{ ms, v }] sorted by time (v = the Sum).
export const points = (cli) => (cli?.Datapoints ?? []).map((d) => ({ ms: Date.parse(d.Timestamp), v: d.Sum ?? 0 })).sort((a, b) => a.ms - b.ms);

const sum = (list) => list.reduce((n, x) => n + x.v, 0);

// The month's total as AWS counts it: whole UTC months. month: 'YYYY-MM'.
export function monthRange(month) {
  const start = Date.parse(`${month}-01T00:00:00Z`);
  const [y, m] = month.split('-').map(Number);
  return { start, end: Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) };
}

// Per calendar day in tz, plus the month's total. requests/calls/bytes: hourly point lists.
export function monthSummary({ requests, calls, bytes, month, tz, quota }) {
  const { start, end } = monthRange(month);
  const inMonth = (x) => x.ms >= start && x.ms < end;
  const days = new Map();
  const add = (list, key) => { for (const x of list) { const d = zoned(x.ms, tz).date; if (!days.has(d)) days.set(d, { date: d, requests: 0, calls: 0, bytes: 0 }); days.get(d)[key] += x.v; } };
  add(requests, 'requests'); add(calls, 'calls'); add(bytes, 'bytes');
  const used = sum(requests.filter(inMonth));
  return {
    days: [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    used, remaining: quota - used, share: used / quota, bytes: sum(bytes.filter(inMonth)),
  };
}

// One local day, hour by hour (23 or 25 hours on a daylight saving day).
export function dayHours({ requests, calls, bytes, date, tz }) {
  const from = localToUtcMs(date, tz);
  const to = localToUtcMs(addDays(date, 1), tz);
  const at = (list, ms) => list.find((x) => x.ms === ms)?.v ?? 0;
  const rows = [];
  for (let ms = from; ms < to; ms += 3_600_000) rows.push({ label: zoned(ms, tz).time, ms, requests: at(requests, ms), calls: at(calls, ms), mb: at(bytes, ms) / 1e6 });
  return rows;
}

// A time window inside one day (e.g. the game), from 5-minute points.
export function windowStats({ requests, calls, date, from, to, tz }) {
  const start = localToUtcMs(date, tz, from);
  const end = localToUtcMs(date, tz, to);
  const inside = (list) => list.filter((x) => x.ms >= start && x.ms < end);
  const r = inside(requests);
  const seconds = (end - start) / 1000;
  const peak = r.reduce((best, x) => (x.v > (best?.v ?? -1) ? x : best), null);
  return {
    minutes: seconds / 60, requests: sum(r), calls: sum(inside(calls)), averageRps: sum(r) / seconds,
    peak: peak && { from: zoned(peak.ms, tz).time, to: zoned(peak.ms + 300_000, tz).time, requests: peak.v, rps: peak.v / 300 },
  };
}

// ---- the text
const n = (x) => Math.round(x).toLocaleString('en-US');
const bar = (v, max, width = 30) => (max > 0 ? '#'.repeat(Math.round((v / max) * width)) : '');

export function renderMonth({ summary, month, tz, quota, planBytes = 100e9, now }) {
  const lines = [`CloudFront requests, ${month} (days are ${tz} calendar days; the month for the allowance is the UTC month)`, ''];
  lines.push(`${'day'.padEnd(12)}${'requests'.padStart(11)}${'API calls'.padStart(11)}${'MB sent'.padStart(9)}${'cumulative'.padStart(12)}`);
  let cum = 0;
  for (const d of summary.days) { cum += d.requests; lines.push(`${d.date.padEnd(12)}${n(d.requests).padStart(11)}${n(d.calls).padStart(11)}${(d.bytes / 1e6).toFixed(1).padStart(9)}${n(cum).padStart(12)}`); }
  lines.push('', `USED       ${n(summary.used)} of ${n(quota)} requests (${(summary.share * 100).toFixed(1)}%)`);
  lines.push(`REMAINING  ${n(summary.remaining)}`);
  lines.push(`DATA SENT  ${(summary.bytes / 1e9).toFixed(2)} GB of ${n(planBytes / 1e9)} GB`);
  if (now) {
    const { end } = monthRange(month);
    const daysLeft = Math.max(0, (end - now) / 86_400_000);
    const recent = summary.days.slice(-8, -1); // the last full days
    if (daysLeft > 0 && recent.length) {
      const perDay = sum(recent.map((d) => ({ v: d.requests }))) / recent.length;
      lines.push(`PACE       ${n(perDay)} requests a day lately; ${daysLeft.toFixed(1)} days left in the month -> about ${n(summary.used + perDay * daysLeft)} by month end at that pace`);
    }
  }
  if (summary.share >= 0.8) lines.push('', 'WARNING: over 80% of the monthly allowance is used.');
  return lines;
}

export function renderDay({ rows, date, tz, gameFrom, gameTo }) {
  const max = Math.max(...rows.map((r) => r.requests), 1);
  const lines = ['', `${date}, hour by hour (${tz} time)`, `${'hour'.padEnd(8)}${'requests'.padStart(10)}${'API calls'.padStart(11)}${'MB'.padStart(7)}`];
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const inGame = (r) => Boolean(gameFrom) && mins(r.label) < mins(gameTo) && mins(r.label) + 60 > mins(gameFrom); // the hour overlaps the window
  for (const r of rows) lines.push(`${r.label.padEnd(8)}${n(r.requests).padStart(10)}${n(r.calls).padStart(11)}${r.mb.toFixed(1).padStart(7)}  ${bar(r.requests, max)}${inGame(r) ? '   <- game' : ''}`);
  lines.push(`${'total'.padEnd(8)}${n(rows.reduce((t, r) => t + r.requests, 0)).padStart(10)}${n(rows.reduce((t, r) => t + r.calls, 0)).padStart(11)}`);
  return lines;
}

export function renderWindow({ stats, date, from, to, tz }) {
  const lines = ['', `The window ${from}-${to} on ${date} (${tz}, ${Math.round(stats.minutes)} minutes)`];
  lines.push(`  ${n(stats.requests)} CloudFront requests, ${n(stats.calls)} API calls; ${stats.averageRps.toFixed(1)} requests a second on average`);
  if (stats.peak) lines.push(`  busiest 5 minutes: ${stats.peak.from}-${stats.peak.to} with ${n(stats.peak.requests)} requests = ${stats.peak.rps.toFixed(1)} a second (the API refuses above about 25 a second of uncached calls; cached scoreboard reads are not limited)`);
  return lines;
}
