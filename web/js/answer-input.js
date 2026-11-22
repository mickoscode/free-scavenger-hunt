// Keeps number answers to digits (and one decimal point), while typing.
export function sanitizeAnswer(type, value) {
  if (type === 'whole-number') return value.replace(/\D/g, '');
  if (type === 'decimal') {
    const cleaned = value.replace(/[^\d.]/g, '');
    const i = cleaned.indexOf('.');
    return i === -1 ? cleaned : cleaned.slice(0, i + 1) + cleaned.slice(i + 1).replace(/\./g, '');
  }
  return value;
}
