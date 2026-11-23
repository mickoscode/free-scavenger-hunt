// A team's final results: place, and every question and photo challenge with the official answers. Pure functions.
// Field names deliberately avoid a plain "answer" key: no public response may contain one before publication.
import { roundScore, decisionPercent, finalScore } from './scoring.js';
import { answerKey } from './content.js';

// Places are by the FINAL total (the organiser's adjustment included): results only exist once the final results are published.
export const placeOf = (team, teams) => 1 + teams.filter((t) => finalScore(t) > finalScore(team)).length;

// answers: the team's stored records by answerKey.
export function buildResults({ team, teams, content, answers }) {
  return {
    place: placeOf(team, teams),
    teamCount: teams.length,
    total: finalScore(team),
    adjustment: team.adjustment ? { points: team.adjustment.points, reason: team.adjustment.reason } : null,
    zones: content.zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      questions: zone.questions.filter((q) => q.type !== 'photo').map((q) => {
        const given = answers[answerKey(zone.id, q.id)];
        return {
          id: q.id, text: q.text, type: q.type, points: q.score,
          answered: Boolean(given), yourAnswer: given ? given.given : null, correct: given ? given.correct : null,
          earned: given ? given.points : 0, officialAnswers: [...q.answers],
        };
      }),
      photos: zone.questions.filter((q) => q.type === 'photo').map((q) => {
        const sent = answers[answerKey(zone.id, q.id)];
        const decision = sent?.decision ?? null;
        return {
          id: q.id, challenge: q.text, points: q.score,
          submitted: Boolean(sent), scored: decision !== null, decision,
          percent: !sent ? null : decision === null ? 0 : decisionPercent(decision),
          earned: sent?.points ?? 0,
        };
      }),
    })),
  };
}

// The same without any answer: what anybody may see of a team once the results are published.
// (The organiser's reason for an adjustment is for the team only: the summary shows the points.)
export const summariseResults = (results) => ({
  ...results,
  adjustment: results.adjustment ? { points: results.adjustment.points } : null,
  zones: results.zones.map((zone) => ({
    ...zone,
    questions: zone.questions.map(({ yourAnswer, officialAnswers, ...rest }) => rest),
  })),
});
