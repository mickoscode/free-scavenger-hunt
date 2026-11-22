// The logic of scripts/reset-organisers.js, separate so it can be tested against the in-memory store.
// Removes every non-site-admin account and every hunt they own (with pictures); never touches a site admin or their hunts.
export async function resetOrganisers({ store, assets, yes = false, log = () => {} }) {
  const all = await store.listUsers();
  const kept = all.filter((u) => u.role === 'site-admin').map((u) => u.name);
  const users = all.filter((u) => u.role !== 'site-admin');
  const events = await store.listEvents();
  const doomed = events.filter((e) => !kept.includes(e.owner));
  const siteAdminEvents = events.filter((e) => kept.includes(e.owner));

  log(`Site admin accounts (kept): ${kept.join(', ') || 'none'}`);
  log(`Organiser accounts to remove (${users.length}): ${users.map((u) => u.name).join(', ') || 'none'}`);
  log(`Hunts to remove (${doomed.length}): ${doomed.map((e) => `${e.owner}/${e.slug}`).join(', ') || 'none'}`);
  if (siteAdminEvents.length) log(`Hunts owned by a site admin (kept): ${siteAdminEvents.map((e) => e.slug).join(', ')}`);
  if (!yes) return { removedUsers: 0, removedEvents: 0, dryRun: true };

  for (const e of doomed) {
    await assets.deletePrefix(`assets/${e.id}/`);
    await store.deleteEvent(e.id);
  }
  for (const u of users) await store.deleteUser(u.name);
  return { removedUsers: users.length, removedEvents: doomed.length, dryRun: false };
}
