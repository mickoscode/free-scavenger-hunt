// Makes the starter "Demo Hunt" for a new organiser: playable 5 minutes after the account is created and open for 15 minutes,
// so they can see the pre-game screen, play it and watch it finish without a long wait. After that the organiser changes the
// settings on the Settings tab like any other hunt (or uses "override" while the game is running).
import { readFile } from 'node:fs/promises';
import { randomId } from '../lib/passwords.js';
import { addDays, localDateTime, localToUtcMs } from '../lib/time.js';
import { DEFAULT_TIME_ZONE } from '../lib/gamestate.js';
import { DEMO_IMAGE_KEYS, demoContent } from './content.js';

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

const imageDir = new URL('./images/', import.meta.url);
const imageCache = new Map();
async function image(name) {
  if (!imageCache.has(name)) imageCache.set(name, await readFile(new URL(name, imageDir)));
  return imageCache.get(name);
}

export async function createDemoHunt({ store, assets, now }, user, org, timeZone) {
  const tz = timeZone ?? DEFAULT_TIME_ZONE;
  const id = randomId(10);
  const event = {
    id, slug: DEMO_SLUG, org, owner: user.name, createdAt: now(), name: 'Demo Hunt', timeZone: tz,
    ...demoWindow(now(), tz), teamNames: true, joinCode: '', whatsappUrl: null, resultsPublished: false, uploadBytes: 0,
  };
  const maps = {};
  let bytes = 0;
  for (const key of DEMO_IMAGE_KEYS) {
    const tag = randomId(8);
    maps[key] = {};
    for (const kind of ['thumb', 'full']) {
      const data = await image(`${key}-${kind}.jpg`);
      const objectKey = `assets/${id}/${key}-${tag}-${kind}.jpg`;
      await assets.put(objectKey, data, 'image/jpeg');
      maps[key][kind] = `/${objectKey}`;
      bytes += data.length;
    }
  }
  event.uploadBytes = bytes;
  if (!(await store.createEvent(event))) {
    await assets.deletePrefix(`assets/${id}/`);
    return null; // the organiser somehow already has a hunt with this name
  }
  await store.putContent(id, demoContent(maps));
  return event;
}
