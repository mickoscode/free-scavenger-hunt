// The content of an event: zones, questions, instructions. Validated on every save; the shape is the contract
// between the editor page, the API and the store.
//
//   { instructions: "markdown", zones: [ { id, name, map: { thumb, full } | null,
//       questions: [ { id, type: 'string'|'whole-number'|'decimal'|'photo', text, answers: [..], score } ] } ] }
import { canonicalDecimal, canonicalWhole } from './answers.js';

export const LIMITS = { zones: 20, questionsPerZone: 30, contentBytes: 256 * 1024, instructionsBytes: 20 * 1024 };
export const QUESTION_TYPES = ['string', 'whole-number', 'decimal', 'photo'];
const ID = /^[a-z0-9-]{1,20}$/;
const isScore = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000 && Math.round(n * 100) / 100 === n;

export const answerKey = (zoneId, questionId) => `${zoneId}#${questionId}`;

// -> { ok: true, content } (cleaned copy) or { ok: false, problems: ['zones.1.questions.0.answers', ...] }
export function validateContent(input) {
  const problems = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { ok: false, problems: ['content'] };

  const instructions = input.instructions ?? '';
  if (typeof instructions !== 'string' || Buffer.byteLength(instructions) > LIMITS.instructionsBytes || /\u0000/.test(instructions)) problems.push('instructions');

  const zonesIn = input.zones;
  if (!Array.isArray(zonesIn) || zonesIn.length > LIMITS.zones) return { ok: false, problems: [...problems, 'zones'] };

  const zoneIds = new Set();
  const zones = zonesIn.map((z, zi) => {
    const at = `zones.${zi}`;
    if (!z || typeof z !== 'object') { problems.push(at); return null; }
    if (typeof z.id !== 'string' || !ID.test(z.id) || zoneIds.has(z.id)) problems.push(`${at}.id`);
    zoneIds.add(z.id);
    if (typeof z.name !== 'string' || z.name.trim() === '' || z.name.trim().length > 60) problems.push(`${at}.name`);
    const qs = z.questions;
    if (!Array.isArray(qs) || qs.length > LIMITS.questionsPerZone) { problems.push(`${at}.questions`); return null; }
    const qIds = new Set();
    const questions = qs.map((q, qi) => {
      const qat = `${at}.questions.${qi}`;
      if (!q || typeof q !== 'object') { problems.push(qat); return null; }
      if (typeof q.id !== 'string' || !ID.test(q.id) || qIds.has(q.id)) problems.push(`${qat}.id`);
      qIds.add(q.id);
      if (!QUESTION_TYPES.includes(q.type)) problems.push(`${qat}.type`);
      if (typeof q.text !== 'string' || q.text.trim() === '' || q.text.length > 500) problems.push(`${qat}.text`);
      if (!isScore(q.score)) problems.push(`${qat}.score`);
      let answers = [];
      if (q.type !== 'photo') {
        const raw = Array.isArray(q.answers) ? q.answers : [];
        answers = raw.map((a) => (typeof a === 'string' ? a.trim() : null));
        const bad = answers.length === 0 || answers.length > 10 || answers.some((a) => a === null || a === '' || a.length > 100)
          || (q.type === 'whole-number' && answers.some((a) => canonicalWhole(a) === null))
          || (q.type === 'decimal' && answers.some((a) => canonicalDecimal(a) === null))
          || (q.type !== 'string' && answers.length !== 1);
        if (bad) problems.push(`${qat}.answers`);
      }
      return { id: q.id, type: q.type, text: String(q.text ?? '').trim(), answers, score: q.score };
    });
    return { id: z.id, name: String(z.name ?? '').trim(), map: z.map && typeof z.map === 'object' ? { thumb: z.map.thumb, full: z.map.full } : null, questions };
  });

  const content = { instructions, zones };
  if (Buffer.byteLength(JSON.stringify(content)) > LIMITS.contentBytes) problems.push('content-too-large');
  return problems.length ? { ok: false, problems } : { ok: true, content };
}

export const countQuestions = (content) => (content?.zones ?? []).reduce((n, z) => n + z.questions.length, 0);

// What a player may be sent while the game is active: the questions, never the answers.
export function playerZones(content) {
  return (content?.zones ?? []).map((z) => ({
    id: z.id, name: z.name, map: z.map,
    questions: z.questions.map((q) => ({ id: q.id, type: q.type, text: q.text, score: q.score })),
  }));
}
