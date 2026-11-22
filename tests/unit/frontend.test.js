// The built pages against the site's Content-Security-Policy, and the page code that has no browser needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const dist = new URL('../../dist/', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? walk(path.join(dir, f)) : [path.join(dir, f)]));
const files = walk(dist);
const pages = files.filter((f) => f.endsWith('.html'));

test('every page is mobile friendly, titled, and has no inline script, style or event handler (the CSP forbids them)', () => {
  assert.ok(pages.length >= 8, `found ${pages.length} pages`);
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const name = path.relative(dist, page);
    assert.match(html, /<meta name="viewport"/, name);
    assert.match(html, /<title>[^<]+<\/title>/, name);
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, `${name}: inline script`);
    assert.doesNotMatch(html, /<style[\s>]/i, `${name}: inline style`);
    assert.doesNotMatch(html, /\sstyle\s*=/i, `${name}: style attribute`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${name}: event handler attribute`);
    assert.doesNotMatch(html, /(src|href)="https?:\/\//i, `${name}: external resource`);
  }
});

test('scripts reference only files that exist, and nothing builds HTML from text', () => {
  const js = files.filter((f) => f.endsWith('.js') && !f.includes('/vendor/'));
  assert.ok(js.length > 15);
  for (const file of js) {
    const src = readFileSync(file, 'utf8');
    const name = path.relative(dist, file);
    assert.doesNotMatch(src, /\.innerHTML\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/, `${name}: unsafe HTML or code`);
    for (const m of src.matchAll(/from '(\.\/[^']+|\/js\/[^']+)'/g)) {
      const target = m[1].startsWith('/') ? path.join(dist, m[1]) : path.join(path.dirname(file), m[1]);
      assert.ok(files.includes(target), `${name} imports missing ${m[1]}`);
    }
  }
  for (const page of pages) {
    for (const m of readFileSync(page, 'utf8').matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) {
      if (['/', '/admin/'].includes(m[1]) || m[1].endsWith('/')) continue;
      assert.ok(files.includes(path.join(dist, m[1])), `${path.relative(dist, page)} references missing ${m[1]}`);
    }
  }
});

test('formatting: scores, durations, places', async () => {
  const { formatScore, formatDuration, ordinal } = await import('../../web/js/format.js');
  assert.equal(formatScore(12), '12');
  assert.equal(formatScore(12.5), '12.5');
  assert.equal(formatScore(0.1 + 0.2), '0.3');
  assert.equal(formatDuration(45 * 60_000), '45 min');
  assert.equal(formatDuration(4 * 60_000 + 5_000), '4:05');
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(90 * 60_000), '1 h 30 min');
  assert.equal(formatDuration(5 * 24 * 3600_000), '5 days');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '103rd']);
});

test('the countdown formatting agrees with the server rules for scores', async () => {
  const web = await import('../../web/js/format.js');
  const server = await import('../../api/lib/scoring.js');
  for (const n of [0, 1, 12.5, 7.25, 100, 0.1 + 0.2, 99.999]) assert.equal(web.formatScore(n), server.formatScore(n));
});

test('answer input keeps numbers to digits and one decimal point', async () => {
  const { sanitizeAnswer } = await import('../../web/js/answer-input.js');
  assert.equal(sanitizeAnswer('whole-number', '4a2.5'), '425');
  assert.equal(sanitizeAnswer('decimal', '1.2.3x'), '1.23');
  assert.equal(sanitizeAnswer('string', 'a-b 1'), 'a-b 1');
});

test('the editor model: ids, blank items and readable problems', async () => {
  const m = await import('../../web/js/content-model.js');
  assert.equal(m.nextId('z', []), 'z1');
  assert.equal(m.nextId('q', ['q1', 'q3']), 'q4');
  const zone = { questions: [{ id: 'q1' }] };
  assert.deepEqual(m.blankQuestion(zone, 'photo'), { id: 'q2', type: 'photo', text: '', answers: [], score: 20 });
  assert.equal(m.blankQuestion(zone, 'string').answers.length, 1);
  const content = { zones: [{ name: 'Beach', questions: [{}, {}] }] };
  assert.equal(m.describeProblem('zones.0.questions.1.answers', content), 'Zone 1, question 2 needs a valid answer.');
  assert.equal(m.describeProblem('zones.0.name', content), 'Zone 1 (Beach) needs a name.');
});
