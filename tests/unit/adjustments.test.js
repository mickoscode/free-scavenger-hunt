import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveScore, finalScore, parseAdjustment } from '../../api/lib/scoring.js';
import { buildResults, placeOf, summariseResults } from '../../api/lib/results.js';

test('an adjustment is a positive or negative number of points with a reason; empty or 0 removes it', () => {
  assert.deepEqual(parseAdjustment({ points: 5, reason: '  Fair   play ' }), { ok: true, adjustment: { points: 5, reason: 'Fair play' } });
  assert.deepEqual(parseAdjustment({ points: -2.5, reason: 'Late back' }), { ok: true, adjustment: { points: -2.5, reason: 'Late back' } });
  for (const none of [{ points: 0 }, { points: null }, { points: '' }, {}, null, { points: 0, reason: 'ignored' }]) assert.deepEqual(parseAdjustment(none), { ok: true, adjustment: null });
});

test('bad adjustments are refused, naming the field', () => {
  assert.deepEqual(parseAdjustment({ points: 5 }), { ok: false, problems: ['reason'] });
  assert.deepEqual(parseAdjustment({ points: 5, reason: '   ' }), { ok: false, problems: ['reason'] });
  assert.deepEqual(parseAdjustment({ points: 5, reason: 'x'.repeat(81) }), { ok: false, problems: ['reason'] });
  assert.deepEqual(parseAdjustment({ points: 5, reason: 'a\u0000b' }), { ok: false, problems: ['reason'] });
  assert.deepEqual(parseAdjustment({ points: '5', reason: 'ok' }), { ok: false, problems: ['points'] }); // numbers only
  assert.deepEqual(parseAdjustment({ points: 1001, reason: 'ok' }), { ok: false, problems: ['points'] });
  assert.deepEqual(parseAdjustment({ points: -1001, reason: 'ok' }), { ok: false, problems: ['points'] });
  assert.deepEqual(parseAdjustment({ points: 1.234, reason: 'ok' }), { ok: false, problems: ['points'] });
  assert.deepEqual(parseAdjustment({ points: Infinity, reason: 'ok' }), { ok: false, problems: ['points'] });
  assert.deepEqual(parseAdjustment({ points: NaN, reason: '' }), { ok: false, problems: ['points', 'reason'] });
});

test('the adjustment counts only once the results are published', () => {
  const team = { score: 40, adjustment: { points: -5, reason: 'Late' } };
  assert.equal(effectiveScore(team, false), 40);
  assert.equal(effectiveScore(team, true), 35);
  assert.equal(finalScore(team), 35);
  assert.equal(effectiveScore({ score: 40 }, true), 40);
  assert.equal(effectiveScore({ score: 10.5, adjustment: { points: 2.25, reason: 'x' } }, true), 12.75);
});

const content = { zones: [{ id: 'z1', name: 'A', questions: [{ id: 'q1', type: 'whole-number', text: 'Q', score: 10, answers: ['1'] }] }] };

test('results: the total and the place include the adjustment, and the team sees the reason', () => {
  const teams = [
    { number: 1, score: 10, adjustment: { points: -4, reason: 'Late back' } },
    { number: 2, score: 8 },
    { number: 3, score: 5, adjustment: { points: 6, reason: 'Fair play' } },
  ];
  assert.equal(placeOf(teams[0], teams), 3); // 6 < 8 < 11
  assert.equal(placeOf(teams[1], teams), 2);
  assert.equal(placeOf(teams[2], teams), 1);
  const r = buildResults({ team: teams[0], teams, content, answers: {} });
  assert.equal(r.total, 6);
  assert.deepEqual(r.adjustment, { points: -4, reason: 'Late back' });
  assert.equal(buildResults({ team: teams[1], teams, content, answers: {} }).adjustment, null);
  // anybody's summary shows the points, not the reason
  assert.deepEqual(summariseResults(r).adjustment, { points: -4 });
  assert.equal(summariseResults(buildResults({ team: teams[1], teams, content, answers: {} })).adjustment, null);
  assert.doesNotMatch(JSON.stringify(summariseResults(r)), /Late back/);
});
