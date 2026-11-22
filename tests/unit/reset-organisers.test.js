import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryAssets } from '../../api/assets.js';
import { createMemoryStore } from '../../api/store/memory.js';
import { resetOrganisers } from '../../scripts/lib/reset.js';

async function seed() {
  const store = createMemoryStore();
  const assets = createMemoryAssets();
  await store.createUser({ name: 'siteadmin', role: 'site-admin', code: 'adm1' });
  await store.claimOrgCode('adm1', 'siteadmin');
  for (const [name, code] of [['ann', 'aaaa'], ['bob', 'bbbb']]) {
    await store.createUser({ name, role: 'event-admin', code });
    await store.claimOrgCode(code, name);
    await store.createEvent({ id: `${name}-ev`, slug: 'demo-hunt', org: code, owner: name, createdAt: 1 });
    await store.putContent(`${name}-ev`, { zones: [] });
    await store.createTeam(`${name}-ev`, { name: 'T', key: 't', secret: 's', createdAt: 1 });
    await assets.put(`assets/${name}-ev/z1-thumb.jpg`, Buffer.from('x'), 'image/jpeg');
  }
  await store.createEvent({ id: 'boss-ev', slug: 'boss-hunt', org: 'adm1', owner: 'siteadmin', createdAt: 1 });
  await assets.put('assets/boss-ev/z1-thumb.jpg', Buffer.from('x'), 'image/jpeg');
  return { store, assets };
}

test('a dry run lists what would go and changes nothing', async () => {
  const { store, assets } = await seed();
  const lines = [];
  const r = await resetOrganisers({ store, assets, log: (l) => lines.push(l) });
  assert.equal(r.dryRun, true);
  assert.match(lines.join('\n'), /Organiser accounts to remove \(2\): ann, bob/);
  assert.equal((await store.listUsers()).length, 3);
  assert.equal((await store.listEvents()).length, 3);
  assert.equal(assets.files.size, 3);
});

test('--yes removes every organiser, their hunts, teams, pictures and codes, and keeps the site admin and their hunts', async () => {
  const { store, assets } = await seed();
  const r = await resetOrganisers({ store, assets, yes: true });
  assert.deepEqual([r.removedUsers, r.removedEvents], [2, 2]);
  assert.deepEqual((await store.listUsers()).map((u) => u.name), ['siteadmin']);
  assert.deepEqual((await store.listEvents()).map((e) => e.id), ['boss-ev']);
  assert.deepEqual([...assets.files.keys()], ['assets/boss-ev/z1-thumb.jpg']);
  assert.equal(await store.getTeam('ann-ev', 1), null);
  assert.equal(await store.getEventBySlug('aaaa', 'demo-hunt'), null);
  assert.equal((await store.getUser('siteadmin')).role, 'site-admin');
  assert.equal(await store.claimOrgCode('aaaa', 'newbie'), true); // the code is free to use again
  assert.equal(await store.claimOrgCode('adm1', 'other'), false); // the site admin still holds theirs
});

test('running it again on a clean site does nothing and does not fail', async () => {
  const { store, assets } = await seed();
  await resetOrganisers({ store, assets, yes: true });
  const again = await resetOrganisers({ store, assets, yes: true });
  assert.deepEqual([again.removedUsers, again.removedEvents], [0, 0]);
});
