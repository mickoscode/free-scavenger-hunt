// Is an event before, during or after its window, and what may each role do? Pure functions.
import { isRealDate, isTime, isTimeZone, localToUtcMs } from './time.js';
import { normaliseWhatsappUrl } from './whatsapp.js';
import { normaliseJoinCode } from './joincode.js';

export const DEFAULT_TIME_ZONE = 'Australia/Perth';

// Config: { name, timeZone, day, start, end, teamNames, joinCode, whatsappUrl }. Returns a list of problems (field names).
export function validateConfig(c) {
  if (c === null || typeof c !== 'object' || Array.isArray(c)) return ['config'];
  const problems = [];
  if (typeof c.name !== 'string' || c.name.trim() === '' || c.name.trim().length > 80) problems.push('name');
  if (!isTimeZone(c.timeZone)) problems.push('timeZone');
  if (!isRealDate(c.day)) problems.push('day');
  if (!isTime(c.start)) problems.push('start');
  if (!isTime(c.end)) problems.push('end');
  if (isTime(c.start) && isTime(c.end) && c.end <= c.start) problems.push('end-before-start');
  if (!normaliseWhatsappUrl(c.whatsappUrl).ok) problems.push('whatsappUrl');
  if (!normaliseJoinCode(c.joinCode).ok) problems.push('joinCode');
  if (c.teamNames !== undefined && typeof c.teamNames !== 'boolean') problems.push('teamNames');
  return problems;
}

export const hasQuestions = (content) => Boolean(content?.zones?.some((z) => z.questions?.length > 0));

export function gameWindow(c) {
  return { startMs: localToUtcMs(c.day, c.start, c.timeZone), endMs: localToUtcMs(c.day, c.end, c.timeZone) };
}

// 'unconfigured' (no valid settings or no questions yet), 'pre', 'active' (start and end inclusive) or 'post'.
export function gameStatus(event, content, nowMs) {
  if (!event?.day || validateConfig(event).length > 0 || !hasQuestions(content)) return 'unconfigured';
  const { startMs, endMs } = gameWindow(event);
  if (nowMs < startMs) return 'pre';
  if (nowMs <= endMs) return 'active';
  return 'post';
}

export function describeGame(event, content, nowMs) {
  const status = gameStatus(event, content, nowMs);
  if (status === 'unconfigured') return { status, serverNowMs: nowMs };
  const { startMs, endMs } = gameWindow(event);
  return { status, serverNowMs: nowMs, startMs, endMs };
}

const PERMISSIONS = {
  unconfigured: { join: false, play: false, score: false, configure: true, deleteData: true, publish: false },
  pre: { join: true, play: false, score: false, configure: true, deleteData: true, publish: false },
  active: { join: true, play: true, score: true, configure: false, deleteData: false, publish: false },
  post: { join: false, play: false, score: true, configure: true, deleteData: true, publish: true },
};
export const can = (status, action) => PERMISSIONS[status]?.[action] === true;
