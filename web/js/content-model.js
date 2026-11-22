// Pure helpers for the question editor, kept apart from the DOM so they can be unit tested.
export const countQuestionsOf = (content) => (content?.zones ?? []).reduce((n, z) => n + z.questions.length, 0);

// The next unused id with a prefix: z1, z2, ... or q1, q2, ...
export function nextId(prefix, existing) {
  let n = existing.length + 1;
  const used = new Set(existing);
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export const TYPE_LABELS = { string: 'Text answer', 'whole-number': 'Whole number', decimal: 'Decimal number', photo: 'Photo challenge' };

export const blankQuestion = (zone, type) => ({
  id: nextId('q', zone.questions.map((q) => q.id)), type, text: '', answers: type === 'photo' ? [] : [''], score: type === 'photo' ? 20 : 10,
});
export const blankZone = (content) => ({ id: nextId('z', content.zones.map((z) => z.id)), name: '', map: null, questions: [] });

// 'zones.1.questions.0.answers' -> 'Zone 2, question 1: answers'
export function describeProblem(path, content) {
  const m = /^zones\.(\d+)(?:\.questions\.(\d+))?(?:\.(\w+))?$/.exec(path);
  if (!m) return path === 'instructions' ? 'Instructions are too long (20 KB at most).' : path === 'zones' ? 'Too many zones (20 at most).' : path;
  const zone = content.zones[+m[1]];
  const where = m[2] === undefined ? `Zone ${+m[1] + 1}${zone?.name ? ` (${zone.name})` : ''}` : `Zone ${+m[1] + 1}, question ${+m[2] + 1}`;
  const what = { name: 'needs a name', text: 'needs text', answers: 'needs a valid answer', score: 'needs a score between 0 and 1000', type: 'has an invalid type', id: 'has a duplicate id', questions: 'has too many questions (30 at most)', map: 'has an invalid map' }[m[3]] ?? 'is invalid';
  return `${where} ${what}.`;
}
