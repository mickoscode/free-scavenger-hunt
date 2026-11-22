import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const csp = readFileSync(new URL('../../terraform/csp.txt', import.meta.url), 'utf8').trim();
const source = readFileSync(new URL('../../terraform/headers.js', import.meta.url), 'utf8');

test('the headers function carries the policy from csp.txt exactly once and nothing else is left unfilled', () => {
  assert.equal(source.split('__CSP__').length - 1, 1);
  const filled = source.replace('__CSP__', csp);
  assert.doesNotMatch(filled, /__[A-Z]+__/);
  const sandbox = {};
  vm.runInNewContext(filled, sandbox); // parses as a CloudFront Function would
  const out = sandbox.handler({ response: { statusCode: 200, headers: { 'content-type': { value: 'text/html' }, 'x-keep': { value: '1' } } } });
  const h = Object.fromEntries(Object.entries(out.headers).map(([k, v]) => [k, v.value]));
  assert.equal(h['content-security-policy'], csp);
  assert.match(h['content-security-policy'], /default-src 'none'.*script-src 'self'.*frame-ancestors 'none'/);
  assert.equal(h['x-frame-options'], 'DENY');
  assert.equal(h['x-content-type-options'], 'nosniff');
  assert.match(h['strict-transport-security'], /max-age=31536000/);
  assert.match(h['permissions-policy'], /camera=\(\)/);
  assert.equal(h['cross-origin-opener-policy'], 'same-origin');
  assert.equal(h['content-type'], 'text/html'); // the response's own headers are kept
  assert.equal(h['x-keep'], '1');
  assert.equal(out.statusCode, 200);
});

test('the policy text contains nothing that would break the function source', () => {
  assert.doesNotMatch(csp, /["\\\n]/);
});
