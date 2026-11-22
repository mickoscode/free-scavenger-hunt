// The behaviour every store must have. Run against the in-memory store always and DynamoDB Local when available.
import { test } from 'node:test';
import assert from 'node:assert/strict';

export function storeContract(name, makeStore) {
  const t = (title, fn) => test(`${name}: ${title}`, async () => fn(await makeStore()));
  const ev = (id, slug, owner = 'ann') => ({ id, slug, owner, createdAt: 1, name: 'E', timeZone: 'UTC', day: '2026-01-01', start: '09:00', end: '10:00' });

  t('users are unique by name and can be listed, updated, deleted', async (s) => {
    assert.equal(await s.createUser({ name: 'ann', role: 'event-admin' }), true);
    assert.equal(await s.createUser({ name: 'ann', role: 'x' }), false);
    await s.createUser({ name: 'bob', role: 'event-admin' });
    await s.putUser({ name: 'ann', role: 'event-admin', status: 'suspended' });
    assert.equal((await s.getUser('ann')).status, 'suspended');
    assert.deepEqual((await s.listUsers()).map((u) => u.name), ['ann', 'bob']);
    await s.deleteUser('bob');
    assert.equal(await s.getUser('bob'), null);
  });

  t('sessions are stored and removed', async (s) => {
    await s.putSession('h1', { user: 'ann', gen: 0 }, 60);
    assert.equal((await s.getSession('h1')).user, 'ann');
    await s.deleteSession('h1');
    assert.equal(await s.getSession('h1'), null);
  });

  t('rate counters count within a window', async (s) => {
    assert.equal(await s.bumpRate('k', 60), 1);
    assert.equal(await s.bumpRate('k', 60), 2);
    assert.equal(await s.bumpRate('other', 60), 1);
  });

  t('rate counters can be read without counting, and users update only if their session generation is unchanged', async (s) => {
    assert.equal(await s.getRate('r', 60), 0);
    await s.bumpRate('r', 60);
    await s.bumpRate('r', 60);
    assert.equal(await s.getRate('r', 60), 2);
    assert.equal(await s.getRate('r', 60), 2);
    await s.createUser({ name: 'ann', role: 'event-admin', sessionGen: 0 });
    assert.equal(await s.updateUserIf({ name: 'ann', role: 'event-admin', sessionGen: 1, x: 1 }, 0), true);
    assert.equal(await s.updateUserIf({ name: 'ann', role: 'event-admin', sessionGen: 2, x: 2 }, 0), false); // stale
    assert.equal((await s.getUser('ann')).x, 1);
    assert.equal(await s.updateUserIf({ name: 'ann', role: 'event-admin', sessionGen: 2, x: 2 }, 1), true);
    assert.equal(await s.updateUserIf({ name: 'ghost', sessionGen: 1 }, 0), false);
  });

  t('settings default to open registration', async (s) => {
    assert.equal((await s.getSettings()).registrationOpen, true);
    await s.putSettings({ registrationOpen: false });
    assert.equal((await s.getSettings()).registrationOpen, false);
  });

  t('events have unique slugs and are found by id, slug and owner', async (s) => {
    assert.equal(await s.createEvent(ev('e1', 'one')), true);
    assert.equal(await s.createEvent(ev('e2', 'one')), false);
    await s.createEvent(ev('e3', 'three', 'bob'));
    assert.equal((await s.getEventBySlug('one')).id, 'e1');
    assert.equal(await s.getEventBySlug('nope'), null);
    assert.deepEqual((await s.listEventsByOwner('ann')).map((e) => e.id), ['e1']);
    assert.equal((await s.listEvents()).length, 2);
    await s.putEvent({ ...ev('e1', 'one'), name: 'Changed' });
    assert.equal((await s.getEvent('e1')).name, 'Changed');
  });

  t('content is stored per event', async (s) => {
    await s.createEvent(ev('e1', 'one'));
    assert.equal(await s.getContent('e1'), null);
    await s.putContent('e1', { zones: [{ id: 'z1' }] });
    assert.deepEqual(await s.getContent('e1'), { zones: [{ id: 'z1' }] });
  });

  t('teams get numbers from 1 per event, names are unique per event', async (s) => {
    const a = await s.createTeam('e1', { name: 'Sea Dogs', key: 'sea dogs', secret: 's1', createdAt: 1 });
    const b = await s.createTeam('e1', { name: 'Gulls', key: 'gulls', secret: 's2', createdAt: 2 });
    assert.equal(a.team.number, 1);
    assert.equal(b.team.number, 2);
    assert.deepEqual(await s.createTeam('e1', { name: 'SEA DOGS', key: 'sea dogs', secret: 's3', createdAt: 3 }), { error: 'name-taken' });
    assert.equal((await s.createTeam('e2', { name: 'Sea Dogs', key: 'sea dogs', secret: 's4', createdAt: 4 })).team.number, 1);
    assert.deepEqual((await s.listTeams('e1')).map((t2) => t2.number), [1, 2]);
    assert.equal((await s.getTeam('e1', 2)).name, 'Gulls');
    assert.equal(await s.getTeam('e1', 9), null);
  });

  t('the first submission for a key counts and moves the team total', async (s) => {
    await s.createTeam('e1', { name: 'A', key: 'a', secret: 's', createdAt: 1 });
    assert.equal(await s.putAnswer('e1', 1, 'z1#q1', { kind: 'answer', given: 'x', correct: true, points: 10, at: 1 }), true);
    assert.equal(await s.putAnswer('e1', 1, 'z1#q1', { kind: 'answer', given: 'y', correct: false, points: 0, at: 2 }), false);
    const team = await s.getTeam('e1', 1);
    assert.equal(team.score, 10);
    assert.equal(team.done, 1);
    assert.equal((await s.getAnswers('e1', 1))['z1#q1'].given, 'x');
    assert.equal(await s.putAnswer('e1', 7, 'z1#q1', { kind: 'answer', points: 1, at: 1 }), false); // no such team
  });

  t('photo decisions move the total by the difference, never twice', async (s) => {
    await s.createTeam('e1', { name: 'A', key: 'a', secret: 's', createdAt: 1 });
    await s.putAnswer('e1', 1, 'z1#q3', { kind: 'photo', points: 0, decision: null, at: 5 });
    assert.equal((await s.listPhotos('e1')).length, 1);
    assert.equal((await s.setPhotoDecision('e1', 1, 'z1#q3', 'full', 30, 6)).points, 0);
    assert.equal((await s.getTeam('e1', 1)).score, 30);
    await s.setPhotoDecision('e1', 1, 'z1#q3', 'half', 15, 7);
    assert.equal((await s.getTeam('e1', 1)).score, 15);
    await s.setPhotoDecision('e1', 1, 'z1#q3', 'half', 15, 8);
    assert.equal((await s.getTeam('e1', 1)).score, 15);
    assert.equal(await s.setPhotoDecision('e1', 1, 'z1#nope', 'full', 30, 9), null);
    assert.equal((await s.getAnswers('e1', 1))['z1#q3'].decision, 'half');
  });

  t('removing a team frees its name and removes its answers; numbers keep counting', async (s) => {
    await s.createTeam('e1', { name: 'A', key: 'a', secret: 's', createdAt: 1 });
    await s.putAnswer('e1', 1, 'z1#q1', { kind: 'answer', points: 1, at: 1 });
    assert.equal(await s.deleteTeam('e1', 1), true);
    assert.equal(await s.deleteTeam('e1', 1), false);
    assert.deepEqual(await s.getAnswers('e1', 1), {});
    assert.equal((await s.createTeam('e1', { name: 'A', key: 'a', secret: 's', createdAt: 2 })).team.number, 2);
  });

  t('deleting player data keeps the event and restarts numbering', async (s) => {
    await s.createEvent(ev('e1', 'one'));
    await s.putContent('e1', { zones: [] });
    await s.createTeam('e1', { name: 'A', key: 'a', secret: 's', createdAt: 1 });
    await s.deletePlayerData('e1');
    assert.deepEqual(await s.listTeams('e1'), []);
    assert.ok(await s.getEvent('e1'));
    assert.deepEqual(await s.getContent('e1'), { zones: [] });
    assert.equal((await s.createTeam('e1', { name: 'A', key: 'a', secret: 's', createdAt: 2 })).team.number, 1);
  });

  t('deleting an event removes everything of it and frees its slug', async (s) => {
    await s.createEvent(ev('e1', 'one'));
    await s.putContent('e1', { zones: [] });
    await s.createTeam('e1', { name: 'A', key: 'a', secret: 's', createdAt: 1 });
    await s.deleteEvent('e1');
    assert.equal(await s.getEvent('e1'), null);
    assert.equal(await s.getContent('e1'), null);
    assert.deepEqual(await s.listTeams('e1'), []);
    assert.equal(await s.createEvent(ev('e9', 'one')), true);
  });
}
