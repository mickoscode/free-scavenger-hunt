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
    // nothing the page LOADS may come from elsewhere (scripts, styles, images, frames); a plain link out must be a safe one
    assert.doesNotMatch(html, /<(script|link|img|iframe|source|embed|object)\b[^>]*\s(src|href)="(https?:)?\/\//i, `${name}: external resource`);
    for (const m of html.matchAll(/<a\b[^>]*\shref="https?:\/\/[^"]*"[^>]*>/gi)) assert.match(m[0], /rel="[^"]*noopener/, `${name}: outbound link without noopener: ${m[0]}`);
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
  assert.equal(formatDuration((3 * 24 + 18) * 3600_000 + 40 * 60_000), '4 days'); // rounded up, like the minutes
  assert.equal(formatDuration(48 * 3600_000 + 60_000), '3 days');
  assert.equal(formatDuration(47 * 3600_000), '47 h 00 min'); // under 2 days it is hours
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

test('the 404 page carries its own content security policy (CloudFront adds headers to successful responses only)', () => {
  const html = readFileSync(path.join(dist, '404.html'), 'utf8');
  const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
  assert.match(policy, /default-src 'none'/);
  assert.doesNotMatch(policy, /script-src|unsafe/); // no scripts at all
  assert.doesNotMatch(html, /<script/i);
});

test('before the start: the time and date when it is another day, a countdown only on the day itself', async () => {
  const { preStartText } = await import('../../web/js/format.js');
  const perth = 'Australia/Perth';
  const at = (iso) => Date.parse(iso);
  const start = at('2026-11-27T08:50:00Z'); // 16:50 on Friday 27 Nov in Perth
  // another day (the hunt's own days): a clear time and date, however near or far
  assert.equal(preStartText(start, at('2026-11-24T00:10:00Z'), perth), 'Game starts at 16:50 on Friday 27 Nov');
  assert.equal(preStartText(start, at('2026-11-26T04:00:00Z'), perth), 'Game starts at 16:50 on Friday 27 Nov'); // the day before
  assert.equal(preStartText(start, at('2026-11-26T15:59:00Z'), perth), 'Game starts at 16:50 on Friday 27 Nov'); // 23:59 Perth, still yesterday
  // the same day (Perth): hours, then minutes, then m:ss
  assert.equal(preStartText(start, at('2026-11-26T16:00:00Z'), perth), 'Game starts in 16 hours'); // 00:00 Friday Perth, 16 h 50 min to go: rounded DOWN
  assert.equal(preStartText(start, at('2026-11-27T02:50:00Z'), perth), 'Game starts in 6 hours'); // exactly 6 h: still whole hours
  assert.equal(preStartText(start, at('2026-11-27T02:51:00Z'), perth), 'Game starts in 5 h 59 min'); // under 6 h: by the minute
  assert.equal(preStartText(start, at('2026-11-27T03:50:00Z'), perth), 'Game starts in 5 h 00 min'); // 11:50 Perth
  assert.equal(preStartText(start, at('2026-11-27T04:50:00Z'), perth), 'Game starts in 4 h 00 min');
  assert.equal(preStartText(start, at('2026-11-27T05:30:00Z'), perth), 'Game starts in 3 h 20 min'); // never rounded up to "4 hours"
  // the real case: 14:19 in Perth with a 16:45 start is 2 h 26 min, not "3 hours"
  assert.equal(preStartText(at('2026-11-27T08:45:00Z'), at('2026-11-27T06:19:00Z'), perth), 'Game starts in 2 h 26 min');
  assert.equal(preStartText(start, at('2026-11-27T07:50:00Z'), perth), 'Game starts in 1 h 00 min');
  assert.equal(preStartText(start, at('2026-11-27T07:51:00Z'), perth), 'Game starts in 59 min');
  assert.equal(preStartText(start, at('2026-11-27T08:44:00Z'), perth), 'Game starts in 6 min');
  assert.equal(preStartText(start, at('2026-11-27T08:45:00Z'), perth), 'Game starts in 5:00');
  assert.equal(preStartText(start, at('2026-11-27T08:49:30Z'), perth), 'Game starts in 0:30');
  // it is the HUNT's time zone that counts, not the viewer's or UTC: the same instants in Sydney (+11) and UTC
  assert.equal(preStartText(start, at('2026-11-27T01:00:00Z'), 'UTC'), 'Game starts in 7 hours'); // same UTC day, 7 h 50 min to go
  assert.equal(preStartText(start, at('2026-11-27T01:00:00Z'), 'Pacific/Auckland'), 'Game starts in 7 hours'); // 14:00 for a 21:50 start, same NZ day
  assert.equal(preStartText(start, at('2026-11-26T09:00:00Z'), 'Pacific/Auckland'), 'Game starts at 21:50 on Friday 27 Nov'); // 22:00 the evening before
  // a time zone the browser does not know falls back to UTC instead of breaking the page
  assert.equal(preStartText(start, at('2026-11-24T00:10:00Z'), 'Nowhere/Land'), 'Game starts at 08:50 on Friday 27 Nov');
});
