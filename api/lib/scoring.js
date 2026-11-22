// Points and totals. The store keeps each team's running total and applies the DELTAS computed here, so
// re-applying a photo decision can never count twice.
const FRACTION = { full: 1, half: 0.5, zero: 0 };

export const roundScore = (n) => Math.round(n * 100) / 100;

// Whole numbers as they are, anything else with 1 decimal place.
export function formatScore(n) {
  const r = roundScore(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export const isDecision = (d) => typeof d === 'string' && Object.hasOwn(FRACTION, d);
export const photoPoints = (photoScore, decision) => roundScore(photoScore * FRACTION[decision]);
export const decisionPercent = (decision) => FRACTION[decision] * 100;
