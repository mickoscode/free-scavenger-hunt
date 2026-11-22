// The original Demo Hunt kept in scripts/demo-master/, and the tool that puts it into master-demo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../api/app.js';
import { createMemoryAssets } from '../../api/assets.js';
import { checkAnswer } from '../../api/lib/answers.js';
import { countQuestions, validateContent } from '../../api/lib/content.js';
import { hashPassword } from '../../api/lib/passwords.js';
import { createMemoryStore } from '../../api/store/memory.js';
import { CODE_BREAKERS, DEMO_IMAGE_KEYS, ZONES, demoContent } from '../../scripts/demo-master/content.js';
import { seedMaster } from '../../scripts/lib/seed-master.js';

const MAPS = Object.fromEntries(DEMO_IMAGE_KEYS.map((k) => [k, { thumb: `/assets/x/${k}-t.jpg`, full: `/assets/x/${k}-f.jpg` }]));

test('the original demo is valid: 6 zones, 5 x 10 questions plus 3 code-breakers, no photos, all question kinds', () => {
  const content = demoContent(MAPS);
  const v = validateContent(content);
  assert.equal(v.ok, true, JSON.stringify(v.problems));
  assert.deepEqual(content.zones.map((z) => z.name), ['Kings Park', 'Elizabeth Quay', 'Fremantle Prison', 'Cottesloe Beach', 'Optus Stadium', 'Code-breakers']);
  assert.deepEqual(content.zones.map((z) => z.questions.length), [10, 10, 10, 10, 10, 3]);
  assert.equal(countQuestions(content), 53);
  const all = content.zones.flatMap((z) => z.questions);
  assert.equal(all.some((x) => x.type === 'photo'), false);
  for (const type of ['string', 'whole-number', 'decimal']) assert.ok(all.some((x) => x.type === type), type);
  assert.match(content.instructions, /Welcome to the Demo Hunt/);
  assert.match(content.instructions, /Image credits/);
  assert.match(content.instructions, /Dinkum|Calistemon|Gnangarra|Bulach/);
});

test('every answer is accepted by the real answer checker, and a wrong one is not', () => {
  for (const question of demoContent(MAPS).zones.flatMap((z) => z.questions)) {
    for (const answer of question.answers) assert.equal(checkAnswer(question, answer).correct, true, `${question.text} -> ${answer}`);
    assert.equal(checkAnswer(question, question.type === 'string' ? 'zzzz nonsense' : '987654321').correct, false, question.text);
  }
});

test('the code-breakers answers follow from the questions they point at', () => {
  const content = demoContent(MAPS);
  const a = (zone, n) => content.zones.find((z) => z.name === zone).questions[n - 1].answers[0];
  const [sum, product, word] = content.zones[5].questions;
  assert.equal(sum.answers[0], String(Number(a('Kings Park', 2)) + Number(a('Elizabeth Quay', 1))));
  assert.equal(product.answers[0], String(Number(a('Cottesloe Beach', 2)) * Number(a('Fremantle Prison', 4))));
  assert.equal(word.answers[0], a('Kings Park', 9)[0] + a('Fremantle Prison', 10)[0] + a('Cottesloe Beach', 1)[0]);
  assert.equal(CODE_BREAKERS.questions().length, 3);
  assert.ok(ZONES.every((z) => z.questions.length === 10));
  assert.match(sum.text, /Kings Park question 2.*Elizabeth Quay question 1/);
});

async function world() {
  const store = createMemoryStore();
  const assets = createMemoryAssets();
  await store.createUser({ name: 'siteadmin', role: 'site-admin', status: 'active', sessionGen: 0, passwordHash: await hashPassword('correct-horse-battery'), createdAt: 1 });
  return { store, assets };
}

test('seeding makes master-demo in the site admin\'s account; a dry run changes nothing, and a second run does nothing', async () => {
  const { store, assets } = await world();
  const lines = [];
  const dry = await seedMaster({ store, assets, log: (l) => lines.push(l) });
  assert.equal(dry.dryRun, true);
  assert.match(lines.join('\n'), /Would create master-demo/);
  assert.equal((await store.getUser('siteadmin')).code, undefined); // not even an organiser code was written
  assert.equal(assets.files.size, 0);
  assert.equal((await store.listEvents()).length, 0);

  const made = await seedMaster({ store, assets, yes: true });
  assert.equal(made.created, true);
  const master = await store.getEventBySlug(made.org, 'master-demo');
  assert.equal(master.owner, 'siteadmin');
  assert.equal(master.name, 'Demo Hunt');
  assert.equal(countQuestions(await store.getContent(master.id)), 53);
  assert.equal([...assets.files.keys()].filter((k) => k.startsWith(`assets/${master.id}/`)).length, 12);

  const again = await seedMaster({ store, assets, yes: true });
  assert.deepEqual([again.created, again.existed], [false, true]);
  assert.equal((await store.listEvents()).length, 1);
});

test('--replace throws a spoiled master-demo away and restores the original, pictures included', async () => {
  const { store, assets } = await world();
  const first = await seedMaster({ store, assets, yes: true });
  const spoiled = await store.getEventBySlug(first.org, 'master-demo');
  await store.putContent(spoiled.id, { instructions: 'ruined', zones: [] });
  await assets.delete([...assets.files.keys()][0]);

  const restored = await seedMaster({ store, assets, yes: true, replace: true });
  assert.equal(restored.created, true);
  assert.notEqual(restored.id, spoiled.id);
  const master = await store.getEventBySlug(first.org, 'master-demo');
  assert.equal(countQuestions(await store.getContent(master.id)), 53);
  assert.equal([...assets.files.keys()].filter((k) => k.startsWith(`assets/${spoiled.id}/`)).length, 0); // nothing left of the old one
  assert.equal([...assets.files.keys()].filter((k) => k.startsWith(`assets/${master.id}/`)).length, 12);
  assert.equal((await store.listEvents()).length, 1);
});

test('only a site admin account can be seeded', async () => {
  const { store, assets } = await world();
  await store.createUser({ name: 'ann', role: 'event-admin', status: 'active', createdAt: 1 });
  await assert.rejects(() => seedMaster({ store, assets, adminName: 'ann', yes: true }), /not a site admin/);
  await assert.rejects(() => seedMaster({ store, assets, adminName: 'nobody', yes: true }), /not a site admin/);
});

test('the whole chain: a seeded master-demo is what the next organiser who signs up gets', async () => {
  const { store, assets } = await world();
  let clock = Date.UTC(2026, 10, 14, 2, 0, 0);
  const now = () => clock;
  await seedMaster({ store, assets, now, yes: true });
  const handle = createApp({ store, assets, now });
  const call = (method, path, body, cookie) => handle({ method, path, query: {}, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body), ip: '9.9.9.9' });
  const reg = await call('POST', '/api/auth/register', { username: 'ann', password: 'purple-giraffe-lunch-42', timeZone: 'Australia/Perth' });
  assert.equal(reg.status, 200);
  const cookie = reg.cookies[0].split(';')[0];
  const events = JSON.parse((await call('GET', '/api/admin/events', undefined, cookie)).body).events;
  assert.deepEqual(events.map((e) => e.slug), ['demo-hunt']);
  const detail = JSON.parse((await call('GET', `/api/admin/events/${events[0].id}`, undefined, cookie)).body);
  assert.equal(countQuestions(detail.content), 53);
  assert.equal(detail.content.zones.length, 6);
  assert.deepEqual([detail.config.start, detail.config.end], ['10:05', '10:20']);
});
