// A small, safe Markdown renderer for event instructions: headings, bullet and numbered lists, bold, italic, paragraphs.
// Everything becomes text nodes; HTML, links and images written in the text are shown as plain text.
import { el } from './dom.js';

function inline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const s = m[0];
    out.push(el(s.startsWith('**') || s.startsWith('__') ? 'strong' : 'em', {}, s.replace(/^(\*\*|__|\*|_)|(\*\*|__|\*|_)$/g, '')));
    last = m.index + s.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderMarkdown(source) {
  const root = el('div', { class: 'markdown' });
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) root.append(el('p', {}, ...inline(para.join(' ')))); para = []; };
  const flushList = () => { list = null; };
  for (const line of String(source).split(/\r?\n/)) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*(?:[-*]|\d+[.)])\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushList(); root.append(el(`h${h[1].length + 2}`, {}, ...inline(h[2]))); }
    else if (li) {
      flushPara();
      const ordered = /^\s*\d/.test(line);
      if (!list || list.tagName !== (ordered ? 'OL' : 'UL')) { list = el(ordered ? 'ol' : 'ul'); root.append(list); }
      list.append(el('li', {}, ...inline(li[1])));
    } else if (line.trim() === '') { flushPara(); flushList(); }
    else { flushList(); para.push(line.trim()); }
  }
  flushPara();
  return root;
}

const WHATSAPP = /whatsapp/gi;
export const safeWhatsAppUrl = (u) => (typeof u === 'string' && /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{10,60}$/.test(u) ? u : null);

// Turns every mention of "WhatsApp" in a node's text into a link to the group (when there is a link).
export function linkWhatsApp(root, url) {
  const safe = safeWhatsAppUrl(url);
  if (!safe) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('a, button')) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!WHATSAPP.test(node.data)) continue;
    WHATSAPP.lastIndex = 0;
    const parts = [];
    let last = 0;
    for (const m of node.data.matchAll(WHATSAPP)) {
      parts.push(node.data.slice(last, m.index), el('a', { href: safe, target: '_blank', rel: 'noopener noreferrer' }, m[0]));
      last = m.index + m[0].length;
    }
    parts.push(node.data.slice(last));
    node.replaceWith(...parts);
  }
}
