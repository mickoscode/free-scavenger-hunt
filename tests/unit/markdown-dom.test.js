// The safe markdown renderer, run in a tiny fake DOM so no browser is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class Node_ { constructor(tag) { this.tagName = tag?.toUpperCase(); this.children = []; this.attrs = {}; } append(...c) { this.children.push(...c); } setAttribute(k, v) { this.attrs[k] = v; } }
globalThis.document = { createElement: (t) => new Node_(t) };

const { renderMarkdown } = await import('../../web/js/markdown.js');
const html = (n) => (typeof n === 'string' ? n.replace(/&/g, '&amp;').replace(/</g, '&lt;') : `<${n.tagName.toLowerCase()}>${n.children.map(html).join('')}</${n.tagName.toLowerCase()}>`);

test('headings, lists, bold and italic render; HTML in the text stays text', () => {
  const out = html(renderMarkdown('# Title\n\nSome **bold** and *it* text.\n\n- one\n- two\n\n1. first\n2. second\n\n<script>alert(1)</script> [link](http://evil.example)'));
  assert.match(out, /<h3>Title<\/h3>/);
  assert.match(out, /<strong>bold<\/strong>/);
  assert.match(out, /<em>it<\/em>/);
  assert.match(out, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(out, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(out, /&lt;script>alert\(1\)&lt;\/script>/);
  assert.doesNotMatch(out, /<a>|<script>/);
});
