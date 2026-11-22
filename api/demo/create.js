// The Demo Hunt of a new organiser: a copy of the hunt called "master-demo" in a site admin's account, made at signup. The master is an
// ordinary hunt the site admin edits like any other; organisers who sign up afterwards get the latest copy, and demo hunts that were
// already created are never touched (each is an independent copy). With no master-demo, a new organiser simply has no demo hunt.
//
// It is playable 5 minutes after the account is created and open for 15 minutes, so the organiser sees the pre-game screen, plays it
// and watches it finish without a long wait. Afterwards they change its settings like any hunt (or use "override" while it runs).
import { copyContent } from '../lib/copy.js';
import { DEFAULT_TIME_ZONE, hasQuestions } from '../lib/gamestate.js';
import { randomId } from '../lib/passwords.js';
import { addDays, localDateTime, localToUtcMs } from '../lib/time.js';

export const MASTER_SLUG = 'master-demo';
export const DEMO_SLUG = 'demo-hunt';
export const DEMO_START_AFTER_MIN = 5;
export const DEMO_LENGTH_MIN = 15;
const MIN = 60_000;

// -> { day, start, end } in the time zone. Starts on a whole minute at least 5 minutes ahead and lasts 15 minutes; a game never
// crosses midnight, so near midnight it starts at 00:01 the next day instead.
export function demoWindow(nowMs, timeZone) {
  const startMs = Math.ceil((nowMs + DEMO_START_AFTER_MIN * MIN) / MIN) * MIN;
  let start = localDateTime(startMs, timeZone);
  let end = localDateTime(startMs + DEMO_LENGTH_MIN * MIN, timeZone);
  if (start.date !== end.date) {
    const day = addDays(start.date, 1);
    const nextStartMs = localToUtcMs(day, '00:01', timeZone);
    start = localDateTime(nextStartMs, timeZone);
    end = localDateTime(nextStartMs + DEMO_LENGTH_MIN * MIN, timeZone);
  }
  return { day: start.date, start: start.time, end: end.time };
}

// The hunt called master-demo in a site admin's account (found through the site admins: nothing else has to be kept in step).
async function findMaster({ store }) {
  for (const admin of (await store.listUsers()).filter((u) => u.role === 'site-admin' && u.code)) {
    const event = await store.getEventBySlug(admin.code, MASTER_SLUG);
    const content = event && (await store.getContent(event.id));
    if (hasQuestions(content)) return { event, content };
  }
  return null;
}

// Never lets a problem with the master stop someone signing up: anything that goes wrong is logged, cleaned up, and means "no demo".
export async function createDemoHunt({ store, assets, now }, user, org, timeZone) {
  const id = randomId(10);
  try {
    const master = await findMaster({ store });
    if (!master) return null;
    const tz = timeZone ?? DEFAULT_TIME_ZONE;
    // Its zones, questions, instructions, pictures and team-name setting. Not its dates, join code or WhatsApp link (those are the
    // site admin's), and not its teams.
    const event = {
      id, slug: DEMO_SLUG, org, owner: user.name, createdAt: now(), name: master.event.name, timeZone: tz,
      ...demoWindow(now(), tz), teamNames: master.event.teamNames !== false, joinCode: '', whatsappUrl: null, resultsPublished: false, uploadBytes: 0,
    };
    const content = await copyContent({ assets }, master.content, master.event.id, id);
    if (!(await store.createEvent(event))) throw new Error('the organiser already has a demo-hunt');
    await store.putContent(id, content);
    return event;
  } catch (e) {
    console.error('could not copy master-demo:', e.message);
    await assets.deletePrefix(`assets/${id}/`).catch(() => {});
    await store.deleteEvent(id).catch(() => {});
    return null;
  }
}
