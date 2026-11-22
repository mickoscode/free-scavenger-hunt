// Things the route modules share: the caller (admin session, team session), the event a request is about.
import { cookie, fail, parseCookies } from './http.js';
import { randomToken, safeEqual, sha256 } from './lib/passwords.js';
import { describeGame, gameStatus } from './lib/gamestate.js';

export const ADMIN_COOKIE = 'fsh_admin';
export const ADMIN_SESSION_SECONDS = 12 * 3600;
const TEAM_SESSION_SECONDS = 30 * 24 * 3600;

export const cookiesOf = (req) => parseCookies(req.headers.cookie);

// The signed-in admin (event admin or site admin) or null. A suspended user, or a session from before a password
// change/reset (sessionGen), is not signed in.
export async function currentUser(ctx, req) {
  const token = cookiesOf(req)[ADMIN_COOKIE];
  if (!token) return null;
  const session = await ctx.store.getSession(sha256(token));
  if (!session) return null;
  const user = await ctx.store.getUser(session.user);
  if (!user || user.status !== 'active' || (user.sessionGen ?? 0) !== session.gen) return null;
  return user;
}

export async function requireUser(ctx, req) {
  return (await currentUser(ctx, req)) ?? fail(401, 'not-authenticated');
}

export async function requireSiteAdmin(ctx, req) {
  const user = await requireUser(ctx, req);
  if (user.role !== 'site-admin') fail(401, 'not-allowed');
  return user;
}

export async function startAdminSession(ctx, user) {
  const token = randomToken();
  await ctx.store.putSession(sha256(token), { user: user.name, gen: user.sessionGen ?? 0 }, ADMIN_SESSION_SECONDS);
  return cookie(ADMIN_COOKIE, token, { maxAge: ADMIN_SESSION_SECONDS });
}

// The event a (signed in) admin may manage: their own, or any for the site admin. Unknown and not-yours look the same.
export async function loadManagedEvent(ctx, user, id) {
  const event = await ctx.store.getEvent(id);
  if (!event || (event.owner !== user.name && user.role !== 'site-admin')) fail(400, 'no-event');
  return event;
}

export async function loadPublicEvent(ctx, slug) {
  return (await ctx.store.getEventBySlug(slug)) ?? fail(400, 'no-event');
}

export async function eventState(ctx, event) {
  const content = await ctx.store.getContent(event.id);
  const nowMs = ctx.now();
  return { content, nowMs, status: gameStatus(event, content, nowMs), game: describeGame(event, content, nowMs) };
}

// ---- team sessions: cookie fsh_p_<eventId> = <teamNumber>.<secret>
const teamCookieName = (eventId) => `fsh_p_${eventId}`;
export const teamCookie = (eventId, team) => cookie(teamCookieName(eventId), `${team.number}.${team.secret}`, { maxAge: TEAM_SESSION_SECONDS });

export async function currentTeam(ctx, req, event) {
  const raw = cookiesOf(req)[teamCookieName(event.id)];
  const m = /^(\d{1,6})\.([A-Za-z0-9_-]{20,64})$/.exec(raw ?? '');
  if (!m) return null;
  const team = await ctx.store.getTeam(event.id, +m[1]);
  return team && safeEqual(team.secret, m[2]) ? team : null;
}
export const requireTeam = async (ctx, req, event) => (await currentTeam(ctx, req, event)) ?? fail(401, 'no-session');

export const clientIp = (req) => req.headers['x-forwarded-for']?.split(',').pop().trim() || req.ip || 'unknown';
