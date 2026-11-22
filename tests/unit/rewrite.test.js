import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sandbox = {};
vm.runInNewContext(readFileSync(new URL('../../terraform/rewrite.js', import.meta.url), 'utf8'), sandbox);
const run = (uri, querystring = {}) => sandbox.handler({ request: { uri, querystring } });

test('hunt pages are served from the shared event pages', () => {
  assert.equal(run('/e/ab3k/beach-hunt/').uri, '/event/view/index.html');
  assert.equal(run('/e/ab3k/beach-hunt/play/').uri, '/event/play/index.html');
  assert.equal(run('/e/ab3k/beach-hunt/results/').uri, '/event/results/index.html');
});

test('missing trailing slashes redirect, keeping the query', () => {
  assert.equal(run('/e/ab3k/beach-hunt').headers.location.value, '/e/ab3k/beach-hunt/');
  assert.equal(run('/e/ab3k/beach-hunt/play').headers.location.value, '/e/ab3k/beach-hunt/play/');
  assert.equal(run('/admin').headers.location.value, '/admin/');
  assert.equal(run('/e/ab3k/beach-hunt/results/', { team: { value: '3' } }).uri, '/event/results/index.html');
});

test('folders serve index.html and files are left alone', () => {
  assert.equal(run('/').uri, '/index.html');
  assert.equal(run('/admin/event/').uri, '/admin/event/index.html');
  assert.equal(run('/js/view.js').uri, '/js/view.js');
  assert.equal(run('/css/bootstrap.min.css').uri, '/css/bootstrap.min.css');
});

test('addresses that are not valid hunt names are not rewritten to the event pages', () => {
  assert.notEqual(run('/e/UPPR/x-hunt/').uri, '/event/view/index.html');
  assert.notEqual(run('/e/ab3/beach-hunt/').uri, '/event/view/index.html'); // a code is exactly 4 characters
  assert.notEqual(run('/e/ab3k/').uri, '/event/view/index.html'); // a code alone is not a hunt
  assert.notEqual(run('/e/ab0k/beach-hunt/').uri, '/event/view/index.html'); // 0, 1, i, l and o are never in a code
  assert.notEqual(run('/e/ab3k/a/').uri, '/event/view/index.html');
});
