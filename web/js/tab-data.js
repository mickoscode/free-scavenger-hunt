// Data: export a hunt as one text file plus its pictures, or import such a file into this hunt. No teams or scores are ever involved.
import { el } from './dom.js';
import { postJson, putJson } from './api.js';
import { explain } from './admin-shell.js';
import { helpToggle } from './help.js';
import { shrinkMap } from './image-shrink.js';
import { describeProblem, countQuestionsOf } from './content-model.js';
import { buildExport, matchPictures, parseHuntFile, toContent } from './hunt-file.js';

const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'hunt';

function save(name, blob) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// A heading with a "?" and the hidden explanation under it.
function section(title, helpParagraphs, ...content) {
  const help = el('div', { class: 'small text-muted mb-2' }, ...helpParagraphs.map((t) => el('p', { class: 'mb-1' }, t)));
  return el('section', { class: 'card card-body mb-3' },
    el('h2', { class: 'h5 d-flex align-items-center gap-2' }, title, helpToggle(title, help)), help, ...content);
}

export async function mountData(body, ctx) {
  const { config, content } = ctx.data;
  const locked = ctx.data.teamCount > 0 || ctx.data.status === 'active';

  // ---- export
  const exportNote = el('p', { class: 'small mt-2 mb-0', role: 'status', hidden: true, 'data-testid': 'export-note' });
  const download = el('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'export-download' }, 'Download hunt file');
  const copy = el('button', { type: 'button', class: 'btn btn-outline-primary', 'data-testid': 'export-copy' }, 'Copy as text');
  const say = (node, text, ok) => { node.hidden = false; node.className = `small mt-2 mb-0 ${ok ? 'text-success' : 'text-danger'}`; node.textContent = text; };
  download.addEventListener('click', async () => {
    const { json, pictures } = buildExport(config, content);
    const base = slugOf(config.name);
    download.disabled = true;
    try {
      save(`${base}.json`, new Blob([json], { type: 'application/json' }));
      for (const p of pictures) {
        const res = await fetch(p.url);
        if (!res.ok) throw new Error(p.name);
        save(p.name, await res.blob());
      }
      say(exportNote, pictures.length ? `Saved ${base}.json and ${pictures.length} picture${pictures.length === 1 ? '' : 's'}. Keep them together in one folder.` : `Saved ${base}.json.`, true);
    } catch (e) {
      say(exportNote, `Could not save a picture (${e.message}). Try again.`, false);
    }
    download.disabled = false;
  });
  copy.addEventListener('click', async () => {
    const { json, pictures } = buildExport(config, content);
    try { await navigator.clipboard.writeText(json); say(exportNote, `Copied. ${pictures.length ? 'The pictures are not included in copied text: use Download for those.' : ''}`, true); } catch { say(exportNote, 'Your browser would not allow copying. Use Download instead.', false); }
  });

  // ---- import
  const picked = el('input', { type: 'file', multiple: true, accept: '.json,application/json,image/*', class: 'form-control', 'aria-label': 'Hunt file and pictures', 'data-testid': 'import-files', disabled: locked });
  const folder = el('input', { type: 'file', multiple: true, class: 'form-control', 'aria-label': 'A folder with a hunt file and pictures', 'data-testid': 'import-folder', disabled: locked });
  folder.setAttribute('webkitdirectory', '');
  const paste = el('textarea', { class: 'form-control font-monospace', rows: '5', placeholder: '{ "format": "free-scavenger-hunt", ... }', 'aria-label': 'Hunt file text', 'data-testid': 'import-text', disabled: locked });
  const check = el('button', { type: 'button', class: 'btn btn-outline-primary', 'data-testid': 'import-check', disabled: locked }, 'Check the file');
  const result = el('div', { 'data-testid': 'import-result', role: 'status', hidden: true });
  let ready = null; // what has been checked and can be imported: { parsed, matches }

  const fail = (text) => { ready = null; result.hidden = false; result.className = 'alert alert-danger mt-3 mb-0'; result.replaceChildren(text); };
  async function readChoice() {
    const chosen = [...picked.files, ...folder.files];
    const jsons = chosen.filter((f) => /\.json$/i.test(f.name));
    if (jsons.length > 1) return { error: 'More than one .json file was chosen. Choose one hunt file (and its pictures).' };
    const text = jsons.length ? await jsons[0].text() : paste.value.trim();
    if (!text) return { error: 'Choose a hunt file, or paste its text.' };
    return { text, pictures: chosen.filter((f) => !/\.json$/i.test(f.name)) };
  }
  check.addEventListener('click', async () => {
    const choice = await readChoice();
    if (choice.error) return fail(choice.error);
    const parsed = parseHuntFile(choice.text);
    if (!parsed.ok) return fail(parsed.error);
    const matches = matchPictures(parsed.zones, choice.pictures);
    const wanted = matches.filter((m) => m.wanted);
    const missing = matches.map((m, i) => (m.wanted && !m.file ? `Zone ${i + 1}: no picture file named ${m.wanted} was chosen, so it will have no map.` : null)).filter(Boolean);
    ready = { parsed, matches };
    const go = el('button', { type: 'button', class: 'btn btn-danger', 'data-testid': 'import-go' }, 'Replace this hunt with this file');
    go.addEventListener('click', () => runImport(go));
    const questions = parsed.zones.reduce((n, z) => n + z.questions.length, 0);
    result.hidden = false;
    result.className = 'card card-body mt-3 mb-0';
    result.replaceChildren(
      el('p', { class: 'mb-1', 'data-testid': 'import-summary' }, `Found ${parsed.zones.length} zone${parsed.zones.length === 1 ? '' : 's'} and ${questions} question${questions === 1 ? '' : 's'}${wanted.length ? `, and ${wanted.length - missing.length} of ${wanted.length} picture${wanted.length === 1 ? '' : 's'}` : ''}.`),
      ...missing.map((m) => el('p', { class: 'small text-warning-emphasis mb-1', 'data-testid': 'import-missing' }, m)),
      el('p', { class: 'small text-muted' }, `Importing replaces this hunt's ${Object.keys(parsed.settings).length ? 'settings, ' : ''}instructions, zones, questions and maps (currently ${content.zones.length} zone${content.zones.length === 1 ? '' : 's'} and ${countQuestionsOf(content)} question${countQuestionsOf(content) === 1 ? '' : 's'}). Nothing else changes.`),
      go);
  });

  async function runImport(go) {
    if (!ready || !confirm('This replaces everything in this hunt with the contents of the file. Continue?')) return;
    const { parsed, matches } = ready;
    go.disabled = true;
    // 1. the content without pictures (the server checks it; if it is refused nothing has changed)
    let next = toContent(parsed);
    const first = await putJson(`${ctx.base}/content`, next);
    if (!first.ok) {
      go.disabled = false;
      if (first.body?.error === 'invalid-content') return fail(`Please fix the file and try again. ${(first.body.problems ?? []).slice(0, 5).map((p) => describeProblem(p, next)).join(' ')}`);
      return fail(explain(first));
    }
    // 2. the pictures, shrunk like any map uploaded in the editor
    const maps = [];
    const notes = [];
    for (const [i, m] of matches.entries()) {
      if (!m.file) { maps.push(null); continue; }
      const shrunk = await shrinkMap(m.file);
      const up = shrunk ? await postJson(`${ctx.base}/zones/z${i + 1}/map`, shrunk) : null;
      if (up?.ok) maps.push(up.body.map); else { maps.push(null); notes.push(`Zone ${i + 1}: ${m.file.name} could not be used${up ? ` (${explain(up)})` : ' as a picture'}.`); }
    }
    if (maps.some(Boolean)) {
      next = toContent(parsed, maps);
      const second = await putJson(`${ctx.base}/content`, next);
      if (!second.ok) notes.push('The pictures could not be attached. Add them on the Questions tab.');
    }
    // 3. the settings (the join code and WhatsApp link stay as they are)
    if (Object.keys(parsed.settings).length) {
      const res = await putJson(`${ctx.base}/config`, { ...config, ...parsed.settings });
      if (!res.ok) notes.push(`The questions were imported, but the settings were not: ${res.body?.error === 'invalid-config' ? `check ${(res.body.problems ?? []).join(', ')}` : explain(res)}.`);
    }
    await ctx.reload();
    result.hidden = false;
    result.className = `alert ${notes.length ? 'alert-warning' : 'alert-success'} mt-3 mb-0`;
    result.replaceChildren(el('strong', {}, notes.length ? 'Imported, with notes: ' : 'Imported. '), notes.length ? notes.join(' ') : 'Have a look on the Questions tab.', ' ', el('a', { href: '#questions', 'data-testid': 'import-done' }, 'Open the questions'));
    ready = null;
  }

  const lockedNote = locked ? el('p', { class: 'alert alert-warning', 'data-testid': 'import-locked' }, 'Teams have joined or the game is running, so importing is locked (exporting still works). Delete the player data on the Overview tab to import.') : null;
  body.replaceChildren(...[
    section('Export this hunt', [
      'Why: keep a copy, edit it in a text editor, start next year\'s hunt from this one, or paste it into an AI chat and ask for more questions in the same format.',
      'You get one plain-text file (.json) with the settings, instructions, zones, questions and answers, plus one picture file for each zone map. Keep them together in one folder. Your browser may ask permission to download several files.',
      'The file has the answers in it, so keep it private. It does not have teams, scores, the join code or the WhatsApp link.',
    ], el('div', { class: 'd-flex flex-wrap gap-2' }, download, copy), exportNote),
    lockedNote,
    section('Import a hunt file', [
      'When: you have edited an exported file, or you have a ready-made file, and want its questions in this hunt without typing them in.',
      'How: choose the .json file and its pictures together (on a computer, hold Ctrl or Shift to pick several, or choose the whole folder). Pictures are matched by file name: a zone\'s "map": "./zone1-map.png" uses the file zone1-map.png. You can also paste the text instead, but pictures need the files.',
      'Importing replaces this hunt\'s settings, instructions, zones, questions and maps. It is checked first and nothing changes if the file has a problem. If you are comfortable editing text, this is the fastest way to build a hunt.',
    ],
    el('label', { class: 'form-label small mb-1' }, 'Hunt file and pictures'), picked,
    ...(matchMedia('(pointer: coarse)').matches ? [] : [el('label', { class: 'form-label small mb-1 mt-2' }, 'Or a whole folder'), folder]),
    el('label', { class: 'form-label small mb-1 mt-2' }, 'Or paste the text (no pictures)'), paste,
    el('div', { class: 'mt-3' }, check), result),
  ].filter(Boolean));
}
