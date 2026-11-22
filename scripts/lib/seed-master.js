// Creates the hunt called master-demo in the site admin's account from the original Demo Hunt kept in scripts/demo-master/.
// It is how master-demo is first made, and how it is restored if it is ever lost or spoiled (--replace). The site never reads
// scripts/demo-master/ itself: new organisers get a copy of master-demo (api/demo/create.js).
import { readFile } from 'node:fs/promises';
import { DEFAULT_TIME_ZONE } from '../../api/lib/gamestate.js';
import { randomId } from '../../api/lib/passwords.js';
import { orgCodeFor } from '../../api/context.js';
import { demoWindow, MASTER_SLUG } from '../../api/demo/create.js';
import { DEMO_IMAGE_KEYS, demoContent } from '../demo-master/content.js';

const images = new URL('../demo-master/images/', import.meta.url);

export async function seedMaster({ store, assets, now = Date.now, adminName = 'siteadmin', replace = false, yes = false, log = () => {} }) {
  const admin = await store.getUser(adminName);
  if (!admin || admin.role !== 'site-admin') throw new Error(`"${adminName}" is not a site admin account`);
  // A dry run never writes anything, not even an organiser code.
  const org = admin.code ?? (yes ? await orgCodeFor({ store }, admin) : null);
  const existing = org ? await store.getEventBySlug(org, MASTER_SLUG) : null;

  if (existing && !replace) {
    log(`${MASTER_SLUG} already exists in ${adminName}'s account (hunt ${existing.id}). Nothing was changed. Use --replace to throw it away and restore the original.`);
    return { created: false, existed: true };
  }
  log(`${existing ? 'Would replace' : 'Would create'} ${MASTER_SLUG} in ${adminName}'s account from the original Demo Hunt: 6 zones, 53 questions, 12 pictures.`);
  if (existing) log(`  The existing ${MASTER_SLUG} (its questions and pictures) would be deleted first.`);
  if (!yes) return { created: false, dryRun: true };

  if (existing) {
    await assets.deletePrefix(`assets/${existing.id}/`);
    await store.deleteEvent(existing.id);
  }
  const id = randomId(10);
  const tz = DEFAULT_TIME_ZONE;
  const maps = {};
  let bytes = 0;
  for (const key of DEMO_IMAGE_KEYS) {
    const tag = randomId(8);
    maps[key] = {};
    for (const kind of ['thumb', 'full']) {
      const data = await readFile(new URL(`${key}-${kind}.jpg`, images));
      const objectKey = `assets/${id}/${key}-${tag}-${kind}.jpg`;
      await assets.put(objectKey, data, 'image/jpeg');
      maps[key][kind] = `/${objectKey}`;
      bytes += data.length;
    }
  }
  const event = {
    id, slug: MASTER_SLUG, org, owner: adminName, createdAt: now(), name: 'Demo Hunt', timeZone: tz, ...demoWindow(now(), tz),
    teamNames: true, joinCode: '', whatsappUrl: null, resultsPublished: false, uploadBytes: bytes,
  };
  if (!(await store.createEvent(event))) throw new Error(`could not create ${MASTER_SLUG}: the address is taken`);
  await store.putContent(id, demoContent(maps));
  log(`Created ${MASTER_SLUG} (hunt ${id}). New organisers who sign up from now on get a copy of it.`);
  return { created: true, id, org };
}
