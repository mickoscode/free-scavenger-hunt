// Event admins (and the site admin) managing events. Everything is scoped to events the caller owns; the site admin
// may manage any event. Rules about what may change when: lib/gamestate.js (can).
import { answerKey, LIMITS, validateContent } from './lib/content.js';
import { can, DEFAULT_TIME_ZONE, validateConfig } from './lib/gamestate.js';
import { normaliseJoinCode } from './lib/joincode.js';
import { randomId } from './lib/passwords.js';
import { buildResults } from './lib/results.js';
import { decisionPercent, isDecision, photoPoints } from './lib/scoring.js';
import { teamLabel } from './lib/teams.js';
import { normaliseWhatsappUrl } from './lib/whatsapp.js';
import { eventState, loadManagedEvent, orgCodeFor, requireUser } from './context.js';
import { copyContent } from './lib/copy.js';
import { fail, json } from './http.js';
import { rankTeams } from './routes-public.js';

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const MAX_IMAGE_BYTES = 500 * 1024;
export const MAX_UPLOAD_BYTES_PER_EVENT = 60 * 1024 * 1024; // everything ever uploaded to one hunt (replaced pictures included)

function imageType(bytes) {
  if (bytes.length > 12 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}
const decodeImage = (b64) => {
  if (typeof b64 !== 'string' || b64.length > MAX_IMAGE_BYTES * 1.4) return null;
  const bytes = Buffer.from(b64, 'base64');
  return bytes.length <= MAX_IMAGE_BYTES && imageType(bytes) ? { bytes, ...imageType(bytes) } : null;
};

const configOf = (e) => ({
  name: e.name, timeZone: e.timeZone, day: e.day, start: e.start, end: e.end,
  teamNames: e.teamNames !== false, joinCode: e.joinCode ?? '', whatsappUrl: e.whatsappUrl ?? '',
});

export function adminRoutes(router, ctx) {
  const { store, assets } = ctx;
  const managed = async (req) => {
    const user = await requireUser(ctx, req);
    const event = await loadManagedEvent(ctx, user, req.params.id);
    return { user, event, ...(await eventState(ctx, event)) };
  };

  async function summary(event) {
    const { status } = await eventState(ctx, event);
    return {
      id: event.id, slug: event.slug, org: event.org, owner: event.owner, name: event.name, status, day: event.day, start: event.start, end: event.end,
      timeZone: event.timeZone, teamCount: (await store.listTeams(event.id)).length, resultsPublished: Boolean(event.resultsPublished),
    };
  }

  router.get('/api/admin/events', async (req) => {
    const user = await requireUser(ctx, req);
    const all = req.query.all === '1' && user.role === 'site-admin';
    const events = all ? await store.listEvents() : await store.listEventsByOwner(user.name);
    return json(200, { events: await Promise.all(events.map(summary)), maxEvents: user.maxEvents, canCreate: user.role === 'site-admin' || (await store.listEventsByOwner(user.name)).length < user.maxEvents });
  });

  router.post('/api/admin/events', async (req) => {
    const user = await requireUser(ctx, req);
    const { slug, name, timeZone } = req.body ?? {};
    if (typeof slug !== 'string' || !SLUG.test(slug)) fail(400, 'invalid-slug');
    if (typeof name !== 'string' || name.trim() === '' || name.trim().length > 80) fail(400, 'invalid-name');
    if (user.role !== 'site-admin' && (await store.listEventsByOwner(user.name)).length >= user.maxEvents) fail(409, 'event-limit');
    const tz = timeZone ?? DEFAULT_TIME_ZONE;
    const today = new Date(ctx.now()).toISOString().slice(0, 10);
    const event = {
      id: randomId(10), slug, org: await orgCodeFor(ctx, user), owner: user.name, createdAt: ctx.now(), name: name.trim(), timeZone: tz, day: today, start: '09:00', end: '12:00',
      teamNames: true, joinCode: '', whatsappUrl: null, resultsPublished: false,
    };
    if (validateConfig(event).length) fail(400, 'invalid-time-zone');
    if (!(await store.createEvent(event))) fail(409, 'slug-taken');
    await store.putContent(event.id, { instructions: '', zones: [] });
    return json(200, { id: event.id, slug: event.slug, org: event.org });
  });

  // A copy of a hunt (settings, zones, questions, instructions and maps) under a new name and address: a starting point
  // for the next event. Teams and scores are not copied.
  router.post('/api/admin/events/:id/duplicate', async (req) => {
    const { user, event, content } = await managed(req);
    const { slug, name } = req.body ?? {};
    if (typeof slug !== 'string' || !SLUG.test(slug)) fail(400, 'invalid-slug');
    if (typeof name !== 'string' || name.trim() === '' || name.trim().length > 80) fail(400, 'invalid-name');
    if (user.role !== 'site-admin' && (await store.listEventsByOwner(user.name)).length >= user.maxEvents) fail(409, 'event-limit');
    const copy = { ...event, id: randomId(10), slug, org: await orgCodeFor(ctx, user), owner: user.name, createdAt: ctx.now(), name: name.trim(), day: new Date(ctx.now()).toISOString().slice(0, 10), resultsPublished: false, uploadBytes: 0 };
    if (!(await store.createEvent(copy))) fail(409, 'slug-taken');
    const copied = await copyContent(ctx, content, event.id, copy.id);
    await store.putContent(copy.id, copied);
    return json(200, { id: copy.id, slug: copy.slug, org: copy.org });
  });

  router.get('/api/admin/events/:id', async (req) => {
    const { event, content, status, game } = await managed(req);
    return json(200, {
      id: event.id, slug: event.slug, org: event.org, owner: event.owner, config: configOf(event), content, status, game,
      resultsPublished: Boolean(event.resultsPublished), teamCount: (await store.listTeams(event.id)).length,
    });
  });

  router.put('/api/admin/events/:id/config', async (req) => {
    const { event, status } = await managed(req);
    const body = req.body ?? {};
    if (!can(status, 'configure') && body.override !== 'override') fail(409, 'game-active');
    const code = normaliseJoinCode(body.joinCode);
    const wa = normaliseWhatsappUrl(body.whatsappUrl);
    const next = {
      ...event, name: body.name, timeZone: body.timeZone, day: body.day, start: body.start, end: body.end,
      teamNames: body.teamNames, joinCode: code.ok ? code.code : body.joinCode, whatsappUrl: wa.ok ? wa.url : body.whatsappUrl,
    };
    const problems = validateConfig(next);
    if (problems.length) fail(400, 'invalid-config', { problems });
    next.name = next.name.trim();
    // Changed settings send the results back to provisional (saving them as they were keeps published results).
    if (JSON.stringify(configOf(next)) !== JSON.stringify(configOf(event))) next.resultsPublished = false;
    await store.putEvent(next);
    return json(200, { config: configOf(next), status: (await eventState(ctx, next)).status });
  });

  router.put('/api/admin/events/:id/content', async (req) => {
    const { event } = await managed(req);
    if ((await store.listTeams(event.id)).length > 0) fail(409, 'players-exist');
    const v = validateContent(req.body);
    if (!v.ok) fail(400, 'invalid-content', { problems: v.problems });
    const prefix = `/assets/${event.id}/`;
    for (const z of v.content.zones) {
      if (z.map && !(typeof z.map.thumb === 'string' && typeof z.map.full === 'string'
        && [z.map.thumb, z.map.full].every((u) => u.startsWith(prefix) && /^[a-z0-9._-]+$/.test(u.slice(prefix.length))))) fail(400, 'invalid-content', { problems: ['map'] });
    }
    const old = await store.getContent(event.id);
    await store.putContent(event.id, v.content);
    // Remove images no zone uses any more.
    const used = new Set(v.content.zones.flatMap((z) => (z.map ? [z.map.thumb, z.map.full] : [])));
    for (const z of old?.zones ?? []) for (const u of z.map ? [z.map.thumb, z.map.full] : []) if (!used.has(u)) await assets.delete(u.slice(1));
    const next = { ...event, resultsPublished: false };
    await store.putEvent(next);
    return json(200, { content: v.content, status: (await eventState(ctx, next)).status });
  });

  // Two images per zone, already shrunk by the browser: a thumbnail and a full size picture. Returns their addresses;
  // the editor includes them in the next content save.
  router.post('/api/admin/events/:id/zones/:zone/map', async (req) => {
    const { event } = await managed(req);
    if (!/^[a-z0-9-]{1,20}$/.test(req.params.zone)) fail(400, 'invalid-content');
    if ((await store.listTeams(event.id)).length > 0) fail(409, 'players-exist');
    if ((await store.bumpRate(`map#${event.id}`, 3600)) > 60) fail(429, 'too-many-requests');
    const thumb = decodeImage(req.body?.thumb);
    const full = decodeImage(req.body?.full);
    if (!thumb || !full) fail(400, 'invalid-image');
    const total = (event.uploadBytes ?? 0) + thumb.bytes.length + full.bytes.length;
    if (total > MAX_UPLOAD_BYTES_PER_EVENT) fail(409, 'upload-limit');
    const tag = randomId(8);
    const base = `assets/${event.id}/${req.params.zone}-${tag}`;
    await assets.put(`${base}-thumb.${thumb.ext}`, thumb.bytes, thumb.type);
    await assets.put(`${base}-full.${full.ext}`, full.bytes, full.type);
    const fresh = await store.getEvent(event.id);
    if (fresh) await store.putEvent({ ...fresh, uploadBytes: (fresh.uploadBytes ?? 0) + thumb.bytes.length + full.bytes.length });
    return json(200, { map: { thumb: `/${base}-thumb.${thumb.ext}`, full: `/${base}-full.${full.ext}` } });
  });

  router.delete('/api/admin/events/:id', async (req) => {
    const { event } = await managed(req);
    if (req.body?.confirm !== event.slug) fail(400, 'confirmation-required');
    await assets.deletePrefix(`assets/${event.id}/`);
    await store.deleteEvent(event.id);
    return json(200, { ok: true });
  });

  // ---- teams, scoring, results
  router.get('/api/admin/events/:id/teams', async (req) => {
    const { event } = await managed(req);
    const teams = await store.listTeams(event.id);
    return json(200, {
      teams: rankTeams(teams, event).map(({ team, rank }) => ({ number: team.number, name: teamLabel(team, event), rank, done: team.done, score: team.score })),
    });
  });

  router.delete('/api/admin/events/:id/teams/:number', async (req) => {
    const { event } = await managed(req);
    if (!(await store.deleteTeam(event.id, +req.params.number))) fail(400, 'no-team');
    return json(200, { ok: true });
  });

  router.get('/api/admin/events/:id/teams/:number/results', async (req) => {
    const { event, content } = await managed(req);
    const team = await store.getTeam(event.id, +req.params.number);
    if (!team) fail(400, 'no-team');
    const [teams, answers] = await Promise.all([store.listTeams(event.id), store.getAnswers(event.id, team.number)]);
    return json(200, { name: teamLabel(team, event), published: Boolean(event.resultsPublished), results: buildResults({ team, teams, content, answers }) });
  });

  // Submitted photos, in the order they were sent. Photos whose challenge no longer exists are left out.
  router.get('/api/admin/events/:id/photos', async (req) => {
    const { event, content, status } = await managed(req);
    const [photos, teams] = await Promise.all([store.listPhotos(event.id), store.listTeams(event.id)]);
    const byNumber = new Map(teams.map((t) => [t.number, t]));
    const items = [];
    for (const p of photos) {
      const [zoneId, questionId] = p.key.split('#');
      const zone = content.zones.find((z) => z.id === zoneId);
      const q = zone?.questions.find((x) => x.id === questionId && x.type === 'photo');
      const team = byNumber.get(p.team);
      if (!q || !team) continue;
      items.push({
        team: p.team, teamName: teamLabel(team, event), zone: zoneId, zoneName: zone.name, question: questionId, challenge: q.text,
        points: q.score, decision: p.rec.decision, earned: p.rec.points, at: p.rec.at,
      });
    }
    return json(200, { items, scoringOpen: can(status, 'score') && !event.resultsPublished, resultsPublished: Boolean(event.resultsPublished), status });
  });

  router.post('/api/admin/events/:id/photos/score', async (req) => {
    const { event, content, status } = await managed(req);
    if (event.resultsPublished) fail(409, 'results-published');
    if (!can(status, 'score')) fail(409, 'scoring-closed');
    const { team, zone, question, decision } = req.body ?? {};
    if (!isDecision(decision)) fail(400, 'invalid-decision');
    const q = content.zones.find((z) => z.id === zone)?.questions.find((x) => x.id === question && x.type === 'photo');
    if (!q || !Number.isInteger(team)) fail(400, 'no-question');
    const previous = await store.setPhotoDecision(event.id, team, answerKey(zone, question), decision, photoPoints(q.score, decision), ctx.now());
    if (!previous) fail(400, 'no-photo');
    return json(200, { ok: true, percent: decisionPercent(decision) });
  });

  router.post('/api/admin/events/:id/publish', async (req) => {
    const { event, status } = await managed(req);
    if (!can(status, 'publish')) fail(409, 'game-not-over');
    if (req.body?.confirm !== true) fail(400, 'confirmation-required');
    await store.putEvent({ ...event, resultsPublished: true });
    return json(200, { resultsPublished: true });
  });

  router.post('/api/admin/events/:id/unpublish', async (req) => {
    const { event } = await managed(req);
    await store.putEvent({ ...event, resultsPublished: false });
    return json(200, { resultsPublished: false });
  });

  router.post('/api/admin/events/:id/player-data/delete', async (req) => {
    const { event, status } = await managed(req);
    if (req.body?.confirm !== 'delete') fail(400, 'confirmation-required');
    if (!can(status, 'deleteData') && req.body?.override !== 'override') fail(409, 'game-active');
    await store.deletePlayerData(event.id);
    await store.putEvent({ ...event, resultsPublished: false });
    return json(200, { ok: true });
  });

  router.get('/api/admin/limits', async (req) => {
    await requireUser(ctx, req);
    return json(200, { limits: LIMITS });
  });
}
