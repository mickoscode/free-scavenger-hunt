import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepTimesInOrder as fix } from '../../web/js/time-guard.js';

test('times already in order are left alone', () => {
  assert.deepEqual(fix('09:00', '12:00', 'start'), { start: '09:00', end: '12:00' });
  assert.deepEqual(fix('09:00', '09:01', 'end'), { start: '09:00', end: '09:01' });
});

test('changing the start past the end moves the end to start + 10 minutes', () => {
  assert.deepEqual(fix('13:00', '12:00', 'start'), { start: '13:00', end: '13:10' });
  assert.deepEqual(fix('12:00', '12:00', 'start'), { start: '12:00', end: '12:10' }); // equal is not in order either
  assert.deepEqual(fix('10:55', '09:00', 'start'), { start: '10:55', end: '11:05' }); // crosses the hour
});

test('changing the end before the start moves the start to end - 10 minutes', () => {
  assert.deepEqual(fix('12:00', '11:00', 'end'), { start: '10:50', end: '11:00' });
  assert.deepEqual(fix('12:00', '12:00', 'end'), { start: '11:50', end: '12:00' });
  assert.deepEqual(fix('12:00', '10:05', 'end'), { start: '09:55', end: '10:05' });
});

test('a game never crosses midnight: the gap is squeezed into the day', () => {
  assert.deepEqual(fix('23:55', '09:00', 'start'), { start: '23:55', end: '23:59' }); // +10 would be tomorrow: end at 23:59
  assert.deepEqual(fix('23:59', '09:00', 'start'), { start: '23:49', end: '23:59' }); // nothing after 23:59: the last 10 minutes
  assert.deepEqual(fix('09:00', '00:05', 'end'), { start: '00:00', end: '00:05' }); // -10 would be yesterday: start at 00:00
  assert.deepEqual(fix('09:00', '00:00', 'end'), { start: '00:00', end: '00:10' }); // nothing before 00:00: the first 10 minutes
});

test('empty or half-typed values are never touched', () => {
  assert.deepEqual(fix('', '12:00', 'start'), { start: '', end: '12:00' });
  assert.deepEqual(fix('13:00', '', 'start'), { start: '13:00', end: '' });
});

test('the result is always accepted by the site (end after start, within the day)', () => {
  for (const changed of ['start', 'end']) {
    for (let s = 0; s < 1440; s += 7) for (let e = 0; e < 1440; e += 11) {
      const t = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const r = fix(t(s), t(e), changed);
      assert.ok(r.end > r.start, `${t(s)}-${t(e)} (${changed}) -> ${r.start}-${r.end}`);
    }
  }
});
