import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayHours, localToUtcMs, monthRange, monthSummary, points, renderDay, renderMonth, renderWindow, windowStats, zoned } from '../../scripts/lib/usage.js';

const PERTH = 'Australia/Perth';
const utc = (iso) => Date.parse(iso);

test('time zones: an instant as the Perth clock shows it, and back', () => {
  assert.deepEqual(zoned(utc('2026-11-27T08:45:00Z'), PERTH), { date: '2026-11-27', time: '16:45', hour: 16 });
  assert.deepEqual(zoned(utc('2026-11-27T16:00:00Z'), PERTH), { date: '2026-11-28', time: '00:00', hour: 0 }); // midnight Perth is 16:00 UTC
  assert.equal(localToUtcMs('2026-11-27', PERTH), utc('2026-11-26T16:00:00Z'));
  assert.equal(localToUtcMs('2026-11-27', PERTH, '16:45'), utc('2026-11-27T08:45:00Z'));
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('the AWS CLI prints local time with an offset: datapoints are read as INSTANTS, never by slicing the text', () => {
  // the same instant, written three ways
  const cli = { Datapoints: [
    { Timestamp: '2026-11-27T16:00:00+08:00', Sum: 5 }, // what the CLI prints on a Perth computer
    { Timestamp: '2026-11-27T08:00:00Z', Sum: 7 },
    { Timestamp: '2026-11-27T08:00:00.000+00:00', Sum: 9 },
  ] };
  assert.deepEqual(points(cli).map((p) => p.ms), [utc('2026-11-27T08:00:00Z'), utc('2026-11-27T08:00:00Z'), utc('2026-11-27T08:00:00Z')]);
  // (the mistake this guards against: reading "16:00" as UTC and adding the offset again put the game 8 hours late)
  const [p] = points({ Datapoints: [{ Timestamp: '2026-11-27T16:00:00+08:00', Sum: 3 }] });
  assert.equal(zoned(p.ms, PERTH).time, '16:00');
  assert.equal(zoned(p.ms, 'UTC').time, '08:00');
  assert.deepEqual(points({}), []);
});

test('the month: whole UTC months for the allowance, days in the chosen zone', () => {
  assert.deepEqual(monthRange('2026-11'), { start: utc('2026-11-01T00:00:00Z'), end: utc('2026-12-01T00:00:00Z') });
  assert.equal(monthRange('2026-12').end, utc('2027-01-01T00:00:00Z'));
  const hourly = (iso, v) => ({ ms: utc(iso), v });
  const requests = [hourly('2026-11-26T16:00:00Z', 100), hourly('2026-11-27T08:00:00Z', 1000), hourly('2026-11-30T16:00:00Z', 50), hourly('2026-12-01T00:00:00Z', 999)];
  const s = monthSummary({ requests, calls: [hourly('2026-11-27T08:00:00Z', 40)], bytes: [hourly('2026-11-27T08:00:00Z', 2e6)], month: '2026-11', tz: PERTH, quota: 1_000_000 });
  assert.equal(s.used, 1150); // 100 + 1000 + 50; the 1 Dec 00:00 UTC point belongs to December
  assert.equal(s.remaining, 1_000_000 - 1150);
  assert.equal(s.bytes, 2e6);
  // per Perth day: 26 Nov 16:00 UTC is already 27 Nov 00:00 in Perth
  assert.deepEqual(s.days.map((d) => [d.date, d.requests]), [['2026-11-27', 1100], ['2026-12-01', 1049]]);
  assert.equal(s.days[0].calls, 40);
});

test('one day, hour by hour, in Perth time (and 23 / 25 hours on a daylight saving day)', () => {
  const requests = [{ ms: utc('2026-11-27T08:00:00Z'), v: 1234 }, { ms: utc('2026-11-27T09:00:00Z'), v: 55 }];
  const rows = dayHours({ requests, calls: [], bytes: [{ ms: utc('2026-11-27T08:00:00Z'), v: 3e6 }], date: '2026-11-27', tz: PERTH });
  assert.equal(rows.length, 24);
  assert.deepEqual([rows[0].label, rows[23].label], ['00:00', '23:00']);
  assert.equal(rows[16].requests, 1234); // 16:00 Perth = 08:00 UTC
  assert.equal(rows[17].requests, 55);
  assert.equal(rows[16].mb, 3);
  assert.equal(rows[3].requests, 0);
  // Sydney: daylight saving starts on 4 Oct 2026 (a 23 hour day) and ends on 4 Apr 2027 (25 hours)
  assert.equal(dayHours({ requests: [], calls: [], bytes: [], date: '2026-10-04', tz: 'Australia/Sydney' }).length, 23);
  assert.equal(dayHours({ requests: [], calls: [], bytes: [], date: '2027-04-04', tz: 'Australia/Sydney' }).length, 25);
  assert.equal(localToUtcMs('2026-10-04', 'Australia/Sydney'), utc('2026-10-03T14:00:00Z')); // midnight, still +10
});

test('a window (the game): total, average and the busiest five minutes', () => {
  const five = (hhmm, v) => ({ ms: localToUtcMs('2026-11-27', PERTH, hhmm), v });
  const requests = [five('16:40', 999), five('16:45', 300), five('16:50', 600), five('18:15', 1500), five('18:20', 888)]; // the first and last are outside
  const calls = [five('16:45', 100), five('18:15', 400), five('18:20', 77)];
  const w = windowStats({ requests, calls, date: '2026-11-27', from: '16:45', to: '18:20', tz: PERTH });
  assert.equal(w.minutes, 95);
  assert.equal(w.requests, 2400);
  assert.equal(w.calls, 500);
  assert.ok(Math.abs(w.averageRps - 2400 / (95 * 60)) < 1e-9);
  assert.deepEqual(w.peak, { from: '18:15', to: '18:20', requests: 1500, rps: 5 });
  assert.equal(windowStats({ requests: [], calls: [], date: '2026-11-27', from: '16:45', to: '18:20', tz: PERTH }).peak, null);
});

test('the report text: used, remaining, the warning at 80%, the game hours marked', () => {
  const s = monthSummary({ requests: [{ ms: utc('2026-11-27T08:00:00Z'), v: 850_000 }], calls: [], bytes: [], month: '2026-11', tz: PERTH, quota: 1_000_000 });
  const text = renderMonth({ summary: s, month: '2026-11', tz: PERTH, quota: 1_000_000 }).join('\n');
  assert.match(text, /USED\s+850,000 of 1,000,000 requests \(85\.0%\)/);
  assert.match(text, /REMAINING\s+150,000/);
  assert.match(text, /WARNING: over 80%/);
  const ok = monthSummary({ requests: [{ ms: utc('2026-11-27T08:00:00Z'), v: 1000 }], calls: [], bytes: [], month: '2026-11', tz: PERTH, quota: 1_000_000 });
  assert.doesNotMatch(renderMonth({ summary: ok, month: '2026-11', tz: PERTH, quota: 1_000_000 }).join('\n'), /WARNING/);
  // the pace line looks at the last full days
  const days = Array.from({ length: 10 }, (_, i) => ({ ms: utc(`2026-11-${String(10 + i).padStart(2, '0')}T08:00:00Z`), v: 1000 }));
  const paced = renderMonth({ summary: monthSummary({ requests: days, calls: [], bytes: [], month: '2026-11', tz: PERTH, quota: 1_000_000 }), month: '2026-11', tz: PERTH, quota: 1_000_000, now: utc('2026-11-20T00:00:00Z') }).join('\n');
  assert.match(paced, /PACE\s+1,000 requests a day lately; 11\.0 days left .* about 21,000 by month end/);
  const rows = dayHours({ requests: [{ ms: utc('2026-11-27T08:00:00Z'), v: 10 }], calls: [], bytes: [], date: '2026-11-27', tz: PERTH });
  const day = renderDay({ rows, date: '2026-11-27', tz: PERTH, gameFrom: '16:45', gameTo: '18:20' });
  assert.deepEqual(day.filter((l) => l.includes('<- game')).map((l) => l.slice(0, 5)), ['16:00', '17:00', '18:00']);
  assert.match(renderWindow({ stats: windowStats({ requests: [{ ms: localToUtcMs('2026-11-27', PERTH, '17:00'), v: 600 }], calls: [], date: '2026-11-27', from: '16:45', to: '18:20', tz: PERTH }), date: '2026-11-27', from: '16:45', to: '18:20', tz: PERTH }).join('\n'), /busiest 5 minutes: 17:00-17:05 with 600 requests = 2\.0 a second/);
});
