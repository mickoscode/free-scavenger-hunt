// Points and totals. The store keeps each team's running total and applies the DELTAS computed here, so
// re-applying a photo decision can never count twice.
const FRACTION = { full: 1, half: 0.5, zero: 0 };

export const roundScore = (n) => Math.round(n * 100) / 100;

// Whole numbers as they are, anything else with 1 decimal place.
export function formatScore(n) {
  const r = roundScore(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// ---- the organiser's adjustment: ONE per team, a positive or negative number of points and the reason for it (a bonus for fair play, a
// penalty for coming back late...). It is kept apart from the running total and only counts once the final results are published.
export const MAX_ADJUSTMENT = 1000;
export const REASON_LENGTH = 80;

// body: { points, reason }. -> { ok: true, adjustment: { points, reason } | null } (null = no adjustment: points empty or 0 removes it)
// or { ok: false, problems: ['points' | 'reason'] }.
export function parseAdjustment(body) {
  const { points, reason } = body ?? {};
  if (points === null || points === undefined || points === '' || points === 0) return { ok: true, adjustment: null };
  const problems = [];
  if (typeof points !== 'number' || !Number.isFinite(points) || Math.abs(points) > MAX_ADJUSTMENT || roundScore(points) !== points) problems.push('points');
  const text = typeof reason === 'string' ? reason.trim().replace(/\s+/g, ' ') : '';
  if (text === '' || text.length > REASON_LENGTH || /[\u0000-\u001f]/.test(text)) problems.push('reason');
  return problems.length ? { ok: false, problems } : { ok: true, adjustment: { points, reason: text } };
}

// A team's total as the public sees it: the adjustment is added only once the final results are published.
export const effectiveScore = (team, published) => roundScore(team.score + (published && team.adjustment ? team.adjustment.points : 0));
// A team's total with its adjustment, whether or not that is published yet (what the final results will say).
export const finalScore = (team) => effectiveScore(team, true);

export const isDecision = (d) => typeof d === 'string' && Object.hasOwn(FRACTION, d);
export const photoPoints = (photoScore, decision) => roundScore(photoScore * FRACTION[decision]);
export const decisionPercent = (decision) => FRACTION[decision] * 100;
