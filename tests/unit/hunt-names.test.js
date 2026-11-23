import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneDefaults, slugify } from '../../web/js/hunt-names.js';

test('slugify makes safe addresses', () => {
  assert.equal(slugify('Summer Fun Hunt!'), 'summer-fun-hunt');
  assert.equal(slugify('  --Café & Co. 2027--  '), 'caf-co-2027');
  assert.equal(slugify('v2-Summer Fun Hunt'), 'v2-summer-fun-hunt');
  assert.equal(slugify('a'.repeat(60)).length, 40);
  assert.equal(slugify('x'.repeat(39) + ' yyy'), 'x'.repeat(39)); // never ends with a dash after cutting
  assert.equal(slugify('!!!'), '');
});

test('a copy is called v2-<name> at v2-<address>', () => {
  assert.deepEqual(cloneDefaults('Summer Fun Hunt', 'summer-fun-hunt', ['summer-fun-hunt']), { name: 'v2-Summer Fun Hunt', slug: 'v2-summer-fun-hunt' });
});

test('the next version number that is not already used', () => {
  const have = ['summer-fun-hunt', 'v2-summer-fun-hunt'];
  assert.deepEqual(cloneDefaults('Summer Fun Hunt', 'summer-fun-hunt', have), { name: 'v3-Summer Fun Hunt', slug: 'v3-summer-fun-hunt' });
  assert.equal(cloneDefaults('x', 'abc', ['abc', 'v2-abc', 'v3-abc', 'v4-abc']).slug, 'v5-abc');
  assert.equal(cloneDefaults('x', 'abc', ['abc', 'v3-abc']).slug, 'v2-abc'); // fills the gap
});

test('copying a copy replaces the version instead of stacking it', () => {
  assert.deepEqual(cloneDefaults('v2-Summer Fun Hunt', 'v2-summer-fun-hunt', ['summer-fun-hunt', 'v2-summer-fun-hunt']), { name: 'v3-Summer Fun Hunt', slug: 'v3-summer-fun-hunt' });
  assert.equal(cloneDefaults('V12-Big', 'v12-big', ['v12-big']).slug, 'v2-big');
});

test('long names and addresses stay within their limits (80 and 40)', () => {
  const d = cloneDefaults('N'.repeat(80), 'a'.repeat(40), ['a'.repeat(40)]);
  assert.ok(d.name.length <= 80 && d.slug.length <= 40);
  assert.match(d.slug, /^v2-a+$/);
  assert.match(d.slug, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/); // the shape the server accepts
  // a base ending in a dash after the cut never leaves a dangling dash
  assert.doesNotMatch(cloneDefaults('x', `${'a'.repeat(36)}-bbbb`, []).slug, /-$/);
});
