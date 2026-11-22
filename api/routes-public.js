// What players and spectators call. Everything is scoped to an event by its slug (/api/events/:slug/...).
// Public GETs may be cached by CloudFront for a few seconds; anything that depends on a team session is never cached.
import { checkAnswer } from './lib/answers.js';
import { answerKey, playerZones, countQuestions } from './lib/content.js';
import { can } from './lib/gamestate.js';
import { matchesJoinCode } from './lib/joincode.js';
import { randomToken } from './lib/passwords.js';
import { buildResults, summariseResults } from './lib/results.js';
import { formatScore } from './lib/scoring.js';
import { sortScoreboard, teamLabel, validateTeamName } from './lib/teams.js';
import { clientKey, currentTeam, eventState, loadPublicEvent, requireTeam, teamCookie } from './context.js';
import { fail, json } from './http.js';

export const MAX_TEAMS = 300;
const CACHE_SECONDS = 3;

// Teams with the same score share a place (1, 1, 3).
export function rankTeams(teams, event) {
  const sorted = sortScoreboard(teams, event.teamNames !== false);
  return sorted.map((t) => ({ team: t, rank: 1 + sorted.filter((o) => o.score > t.score).length }));
}

export function publicRoutes(router, ctx) {
  const { store } = ctx;
  const load = async (req) => {
    const event = await loadPublicEvent(ctx, req.params.slug);
    return { event, ...(await eventState(ctx, event)) };
  };

  // The game information. /info is the address the pages use: CloudFront caches exactly that path and /scoreboard (see
  // terraform/site.tf), so it must stay free of anything personal. The bare address is kept for older callers.
  const gameInfo = async (req) => {
    const { event, game } = await load(req);
    return json(200, {
      slug: event.slug, name: event.name, ...game,
      teamNames: event.teamNames !== false, joinCodeRequired: Boolean(event.joinCode), resultsPublished: Boolean(event.resultsPublished),
    }, { cache: CACHE_SECONDS });
  };
  router.get('/api/events/:slug/info', gameInfo);
  router.get('/api/events/:slug', gameInfo);

  router.get('/api/events/:slug/scoreboard', async (req) => {
    const { event, game, content } = await load(req);
    const teams = await store.listTeams(event.id);
    return json(200, {
      ...game, resultsPublished: Boolean(event.resultsPublished), questionTotal: countQuestions(content),
      teams: rankTeams(teams, event).map(({ team, rank }) => ({
        rank, name: teamLabel(team, event), done: team.done, score: Number(formatScore(team.score)),
        ...(event.resultsPublished ? { number: team.number } : {}),
      })),
    }, { cache: CACHE_SECONDS });
  });

  router.post('/api/events/:slug/join', async (req) => {
    const { event, status } = await load(req);
    if (!can(status, 'join')) fail(409, 'not-joinable');
    const body = req.body ?? {};
    if (event.joinCode && !matchesJoinCode(body.code, event.joinCode)) fail(400, 'wrong-code');
    if ((await store.bumpRate(`join#${event.id}#${clientKey(req)}`, 3600)) > 30) fail(429, 'too-many-requests');
    let name = '';
    let key = null;
    if (event.teamNames !== false) {
      const v = validateTeamName(body.name);
      if (!v.ok) fail(400, 'invalid-name', { reason: v.error });
      ({ name, key } = v);
    }
    if ((await store.listTeams(event.id)).length >= MAX_TEAMS) fail(409, 'event-full');
    const created = await store.createTeam(event.id, { name, key, secret: randomToken(24), createdAt: ctx.now() });
    if (created.error) fail(409, 'name-taken');
    return json(200, { number: created.team.number }, { cookies: [teamCookie(event.id, created.team)] });
  });

  // Who am I, what have I done. Never cached.
  router.get('/api/events/:slug/me', async (req) => {
    const { event } = await load(req);
    const team = await requireTeam(ctx, req, event);
    const answers = await store.getAnswers(event.id, team.number);
    const keys = Object.entries(answers);
    return json(200, {
      number: team.number, name: teamLabel(team, event),
      done: { answers: keys.filter(([, r]) => r.kind === 'answer').map(([k]) => k), photos: keys.filter(([, r]) => r.kind === 'photo').map(([k]) => k) },
      whatsappUrl: event.whatsappUrl ?? null,
    });
  });

  // Instructions any time; the zones and questions only while the game is active.
  router.get('/api/events/:slug/play', async (req) => {
    const { event, status, content } = await load(req);
    await requireTeam(ctx, req, event);
    return json(200, {
      status, instructions: content?.instructions ?? '',
      zones: can(status, 'play') ? playerZones(content) : [],
    });
  });

  async function submit(req, kind) {
    const { event, status, content } = await load(req);
    const team = await requireTeam(ctx, req, event);
    if (!can(status, 'play')) fail(409, 'not-playing');
    const { zone: zoneId, question: questionId, answer } = req.body ?? {};
    const question = content.zones.find((z) => z.id === zoneId)?.questions.find((q) => q.id === questionId);
    if (!question || (kind === 'photo') !== (question.type === 'photo')) fail(400, 'no-question');
    let rec;
    if (kind === 'photo') {
      rec = { kind: 'photo', points: 0, decision: null, at: ctx.now() };
    } else {
      const check = checkAnswer(question, answer);
      if (!check.valid) fail(400, 'invalid-answer');
      rec = { kind: 'answer', given: answer.trim(), correct: check.correct, points: check.correct ? question.score : 0, at: ctx.now() };
    }
    if (!(await store.putAnswer(event.id, team.number, answerKey(zoneId, questionId), rec))) fail(409, 'already-submitted');
    return json(200, { ok: true });
  }
  router.post('/api/events/:slug/answer', (req) => submit(req, 'answer'));
  router.post('/api/events/:slug/photo', (req) => submit(req, 'photo'));

  // A team's own results, with the answers: only once the results are published.
  router.get('/api/events/:slug/results', async (req) => {
    const { event, content } = await load(req);
    const team = await requireTeam(ctx, req, event);
    if (!event.resultsPublished) return json(200, { published: false });
    const [teams, answers] = await Promise.all([store.listTeams(event.id), store.getAnswers(event.id, team.number)]);
    return json(200, { published: true, name: teamLabel(team, event), results: buildResults({ team, teams, content, answers }) });
  });

  // Anybody's results, without answers, once published.
  router.get('/api/events/:slug/results/team/:number', async (req) => {
    const { event, content } = await load(req);
    if (!event.resultsPublished) return json(200, { published: false });
    const team = /^\d{1,6}$/.test(req.params.number) ? await store.getTeam(event.id, +req.params.number) : null;
    if (!team) fail(400, 'no-team');
    const [teams, answers] = await Promise.all([store.listTeams(event.id), store.getAnswers(event.id, team.number)]);
    return json(200, { published: true, name: teamLabel(team, event), results: summariseResults(buildResults({ team, teams, content, answers })) });
  });

  // Lets the page know whether a browser has a team in this event (the join/play button).
  router.get('/api/events/:slug/session', async (req) => {
    const { event } = await load(req);
    return json(200, { joined: Boolean(await currentTeam(ctx, req, event)) });
  });
}
