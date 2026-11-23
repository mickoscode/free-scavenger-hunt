// The hunt file: one plain-text .json file (plus the zone pictures as ordinary image files next to it) that holds everything about a hunt
// except its teams: settings, instructions, zones, questions, answers. Pure functions, no page code, so they can be unit tested.
//
//   { "format": "free-scavenger-hunt", "version": 1,
//     "settings": { name, timeZone, day, start, end, teamNames },
//     "instructions": "markdown",
//     "zones": [ { "name": "Beach", "map": "./zone1-map.webp" | null,
//                  "questions": [ { "type": "string"|"whole-number"|"decimal"|"photo", "text": "...", "answers": ["..."], "score": 10 } ] } ] }
//
// The join code and the WhatsApp link are deliberately not in the file: they control who can get in, and files get shared.
export const FORMAT = 'free-scavenger-hunt';
export const VERSION = 1;
const TYPES = ['string', 'whole-number', 'decimal', 'photo'];
const SETTINGS = ['name', 'timeZone', 'day', 'start', 'end', 'teamNames'];

const baseName = (p) => String(p).split(/[\\/]/).pop().toLowerCase();
const extOf = (url) => (/\.([a-z0-9]+)$/i.exec(String(url).split('?')[0])?.[1] ?? 'jpg').toLowerCase();

// ctx data -> { json: string, pictures: [{ name, url }] }. Pictures are named by zone position: zone1-map.webp, zone2-map.jpg, ...
export function buildExport(config, content) {
  const pictures = [];
  const zones = content.zones.map((z, i) => {
    let map = null;
    if (z.map?.full) {
      const name = `zone${i + 1}-map.${extOf(z.map.full)}`;
      pictures.push({ name, url: z.map.full });
      map = `./${name}`;
    }
    return {
      name: z.name, map,
      questions: z.questions.map((q) => (q.type === 'photo' ? { type: q.type, text: q.text, score: q.score } : { type: q.type, text: q.text, answers: q.answers, score: q.score })),
    };
  });
  const settings = Object.fromEntries(SETTINGS.map((k) => [k, config[k]]));
  const file = { format: FORMAT, version: VERSION, settings, instructions: content.instructions ?? '', zones };
  return { json: `${JSON.stringify(file, null, 2)}\n`, pictures };
}

// Text -> { ok: true, settings, instructions, zones } or { ok: false, error } (one plain sentence). Only the shape is checked here; the
// site's own rules (lengths, valid numbers, time zones...) are applied by the server when the content is saved.
export function parseHuntFile(text) {
  let file;
  try { file = JSON.parse(text); } catch (e) { return { ok: false, error: `That is not valid JSON (${String(e.message).replace(/^JSON\.parse: /, '').slice(0, 120)}). Check for a missing comma, bracket or quote.` }; }
  if (!file || typeof file !== 'object' || Array.isArray(file)) return { ok: false, error: 'That does not look like a hunt file: it should start with { and end with }.' };
  if (file.format !== FORMAT) return { ok: false, error: `That does not look like a hunt file from this site (it needs "format": "${FORMAT}").` };
  if (file.version !== VERSION) return { ok: false, error: `This file is version ${JSON.stringify(file.version)}; this site reads version ${VERSION}.` };
  if (!Array.isArray(file.zones) || file.zones.length === 0) return { ok: false, error: 'The file needs a "zones" list with at least one zone.' };
  if (file.instructions !== undefined && typeof file.instructions !== 'string') return { ok: false, error: '"instructions" must be text.' };
  if (file.settings !== undefined && (typeof file.settings !== 'object' || file.settings === null || Array.isArray(file.settings))) return { ok: false, error: '"settings" must be an object like { "name": "..." }.' };

  const zones = [];
  for (const [zi, z] of file.zones.entries()) {
    const at = `Zone ${zi + 1}`;
    if (!z || typeof z !== 'object' || typeof z.name !== 'string') return { ok: false, error: `${at} needs a "name".` };
    if (!Array.isArray(z.questions)) return { ok: false, error: `${at} needs a "questions" list.` };
    if (z.map !== undefined && z.map !== null && typeof z.map !== 'string') return { ok: false, error: `${at}: "map" must be a picture name like "./zone${zi + 1}-map.png", or null.` };
    const questions = [];
    for (const [qi, q] of z.questions.entries()) {
      const qat = `${at}, question ${qi + 1}`;
      if (!q || typeof q !== 'object') return { ok: false, error: `${qat} must be an object.` };
      if (!TYPES.includes(q.type)) return { ok: false, error: `${qat}: "type" must be one of ${TYPES.map((t) => `"${t}"`).join(', ')}.` };
      if (typeof q.text !== 'string') return { ok: false, error: `${qat} needs "text".` };
      let answers = [];
      if (q.type !== 'photo') {
        const raw = Array.isArray(q.answers) ? q.answers : q.answer !== undefined ? [q.answer] : null;
        if (!raw || raw.some((a) => !['string', 'number'].includes(typeof a))) return { ok: false, error: `${qat} needs "answers": a list like ["a", "b"].` };
        answers = raw.map(String);
      }
      if (q.score !== undefined && typeof q.score !== 'number') return { ok: false, error: `${qat}: "score" must be a number.` };
      questions.push({ type: q.type, text: q.text, answers, score: q.score ?? (q.type === 'photo' ? 20 : 10) });
    }
    zones.push({ name: z.name, mapRef: z.map ? String(z.map) : null, questions });
  }
  const settings = Object.fromEntries(SETTINGS.filter((k) => file.settings?.[k] !== undefined).map((k) => [k, file.settings[k]]));
  return { ok: true, settings, instructions: file.instructions ?? '', zones };
}

// Which of the chosen picture files each zone's "map" names. -> [{ file | null, wanted | null }] per zone (matched by file name, ignoring
// folders and capital letters, so "./zone1-map.png" finds zone1-map.png wherever it was picked from).
export function matchPictures(zones, files) {
  const byName = new Map(files.map((f) => [baseName(f.name), f]));
  return zones.map((z) => (z.mapRef ? { wanted: baseName(z.mapRef), file: byName.get(baseName(z.mapRef)) ?? null } : { wanted: null, file: null }));
}

// Parsed zones -> the content the site saves (ids are made up: z1, z2... and q1, q2... in each zone). maps: per zone { thumb, full } or null.
export function toContent(parsed, maps = []) {
  return {
    instructions: parsed.instructions,
    zones: parsed.zones.map((z, zi) => ({
      id: `z${zi + 1}`, name: z.name, map: maps[zi] ?? null,
      questions: z.questions.map((q, qi) => ({ id: `q${qi + 1}`, type: q.type, text: q.text, answers: q.answers, score: q.score })),
    })),
  };
}
