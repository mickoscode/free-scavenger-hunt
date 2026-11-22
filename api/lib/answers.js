// Checking a submitted answer against the official one(s). Pure functions; the result never contains the official answer.
export const MAX_ANSWER_LENGTH = 200;

export const normaliseText = (s) => String(s).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

// Typos allowed by the length of the official answer: none under 4 characters, 1 for 4-7, 2 for 8 or more.
export function typosAllowed(official) {
  const length = [...official].length;
  if (length < 4) return 0;
  return length < 8 ? 1 : 2;
}

// Edit distance where an added, missing or changed letter, or two neighbouring letters swapped, counts as 1.
export function typoDistance(a, b) {
  const x = [...a];
  const y = [...b];
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 0; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[x.length][y.length];
}

// "042", "42" and "42." are the same value (no floating point involved).
export function canonicalWhole(s) {
  const t = String(s).trim();
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : null;
}
export function canonicalDecimal(s) {
  const t = String(s).trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const [whole, fraction = ''] = t.split('.');
  const w = whole.replace(/^0+(?=\d)/, '') || '0';
  const f = fraction.replace(/0+$/, '');
  return f ? `${w}.${f}` : w;
}

// -> { valid, correct }. valid=false: not an acceptable answer for this type (empty, too long, not a number); the
// caller rejects it without using up the team's one submission.
export function checkAnswer(question, submitted) {
  const invalid = { valid: false, correct: false };
  if (typeof submitted !== 'string' || submitted.length > MAX_ANSWER_LENGTH) return invalid;
  const accepted = question.answers ?? [];
  if (question.type === 'whole-number') {
    const given = canonicalWhole(submitted);
    return given === null ? invalid : { valid: true, correct: accepted.some((a) => canonicalWhole(a) === given) };
  }
  if (question.type === 'decimal') {
    const given = canonicalDecimal(submitted);
    return given === null ? invalid : { valid: true, correct: accepted.some((a) => canonicalDecimal(a) === given) };
  }
  if (question.type === 'string') {
    const given = normaliseText(submitted);
    if (given === '') return invalid;
    const correct = accepted.some((a) => {
      const official = normaliseText(a);
      return typoDistance(given, official) <= typosAllowed(official);
    });
    return { valid: true, correct };
  }
  throw new Error(`unknown question type: ${question.type}`);
}
