#!/usr/bin/env node
// A capped load test of a DEPLOYED site, using a throwaway organiser and hunt that are deleted at the end.
//
//   node scripts/load-test.js https://xxxx.cloudfront.net              shows the plan and its request budget; sends nothing
//   node scripts/load-test.js https://xxxx.cloudfront.net --yes        runs it
//
// Options (all numbers):  --max-requests 50000   hard cap on requests sent (the script stops itself before it)
//                         --spectators 100 --spike 300 --teams 25 --steady-seconds 180 --spike-seconds 120 --ceiling-requests 1500
//
// What it simulates (an event's rate, compressed into minutes):
//   rush     everybody opens the page at once (the static files and the first API calls)
//   steady   spectators watching the scoreboard (2 requests every 5 s each), teams playing (3 requests every 30 s, and answering),
//            three organiser tabs on the Teams and Scoring tabs (2 requests every 5 s each)
//   spike    the same with many more spectators
//   ceiling  a burst of uncached API calls, to see the API's request limit (429) work and the site recover
// Then it checks that the scoreboard adds up, deletes the throwaway account (and with it the hunt), and prints a report.
//
// Cost: every request counts toward the CloudFront plan's monthly request allowance (see the dry run's estimate). The test comes from ONE
// address, so it can never join more than ~30 teams (the API allows 30 joins per hour per address per hunt). It never touches an existing hunt.
// Needs nothing but Node 22. The exit code is 1 if any check failed.
import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const site = (args.find((a) => /^https?:\/\//.test(a)) ?? process.env.SITE_URL ?? '').replace(/\/+$/, '');
const num = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : fallback; };
const OPT = {
  maxRequests: num('max-requests', 50_000), spectators: num('spectators', 100), spike: num('spike', 300), teams: num('teams', 25),
  steadySeconds: num('steady-seconds', 180), spikeSeconds: num('spike-seconds', 120), ceilingRequests: num('ceiling-requests', 1500), organiserTabs: 3,
};
if (!site) { console.error('usage: node scripts/load-test.js <site url> [--yes] [options]'); process.exit(2); }
for (const [k, v] of Object.entries(OPT)) if (!Number.isFinite(v) || v < 0) { console.error(`bad value for ${k}`); process.exit(2); }
if (OPT.teams < 1 || OPT.teams > 28) { console.error('--teams must be 1 to 28 (the API allows 30 joins per hour per address per hunt)'); process.exit(2); }

// ---- the plan and its budget (the dry run prints this; the real run refuses to start if it would not fit)
const QUESTIONS = 9; // 8 whole-number questions and 1 photo challenge
const PAGE = { view: 13, play: 17 }; // requests for one cold page load, measured on the real pages (files plus the first API calls)
const plan = () => {
  const poll = (n, s) => n * 2 * Math.ceil(s / 5);
  const teamPoll = (s) => OPT.teams * 3 * Math.ceil(s / 30);
  const organiser = (s) => OPT.organiserTabs * 2 * Math.ceil(s / 5);
  return [
    ['setup (account, hunt, joins, checks)', 10 + OPT.teams],
    ['rush (everybody opens the page)', OPT.spectators * PAGE.view + OPT.teams * PAGE.play],
    [`steady (${OPT.spectators} spectators, ${OPT.teams} teams, ${OPT.steadySeconds} s)`, poll(OPT.spectators, OPT.steadySeconds) + teamPoll(OPT.steadySeconds) + OPT.teams * QUESTIONS + organiser(OPT.steadySeconds)],
    [`spike (${OPT.spike} spectators, ${OPT.spikeSeconds} s)`, poll(OPT.spike, OPT.spikeSeconds) + teamPoll(OPT.spikeSeconds) + organiser(OPT.spikeSeconds)],
    ['ceiling (uncached API burst)', OPT.ceilingRequests + 3],
    ['verify and clean up', 8],
  ];
};
const estimate = plan().reduce((n, [, c]) => n + c, 0);
console.log(`Load test of ${site}`);
for (const [name, count] of plan()) console.log(`  ${name.padEnd(52)} ~${count.toLocaleString().padStart(7)} requests`);
console.log(`  ${'estimated total'.padEnd(52)} ~${estimate.toLocaleString().padStart(7)} requests   (hard cap ${OPT.maxRequests.toLocaleString()})`);
if (estimate > OPT.maxRequests * 0.9) { console.error('The estimate is over 90% of the cap: lower the options or raise --max-requests.'); process.exit(2); }
if (!args.includes('--yes')) { console.log('\nNothing was sent. Add --yes to run it.'); process.exit(0); }
const utc = new Date();
if (utc.getUTCHours() === 23 && utc.getUTCMinutes() >= 30 || utc.getUTCHours() === 0 && utc.getUTCMinutes() < 15) {
  console.error('Too close to midnight UTC: the throwaway hunt is a game "today" in UTC. Run it at another time.'); process.exit(2);
}

// ---- requests, with counting, timing and a hard stop
const HARD_STOP = OPT.maxRequests - 200; // the last 200 are for verifying and cleaning up
let sent = 0;
let phase = 'setup';
let capHit = false;
let wafBlocks = 0;
const stats = new Map(); // "phase|tag" -> { n, status, ms, cacheHit, cacheSeen }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class CapReached extends Error {}

async function call(tag, method, path, { body, jar, force = false } = {}) {
  if (!force && sent >= HARD_STOP) { capHit = true; throw new CapReached('request cap reached'); }
  sent += 1;
  const key = `${phase}|${tag}`;
  if (!stats.has(key)) stats.set(key, { n: 0, status: {}, ms: [], cacheHit: 0, cacheSeen: 0 });
  const s = stats.get(key);
  s.n += 1;
  const t0 = performance.now();
  let status = 0;
  let json = null;
  try {
    const res = await fetch(site + path, {
      method, redirect: 'manual',
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(jar?.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = res.status;
    const text = await res.text();
    if ((res.headers.get('content-type') ?? '').includes('json')) { try { json = JSON.parse(text); } catch { /* not json */ } }
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = c.split('; ');
      const [k, ...v] = pair.split('=');
      if (jar) { if (attrs.includes('Max-Age=0')) jar.delete(k); else jar.set(k, v.join('=')); }
    }
    const x = res.headers.get('x-cache');
    if (x) { s.cacheSeen += 1; if (/hit/i.test(x)) s.cacheHit += 1; }
    wafBlocks = status === 403 ? wafBlocks + 1 : 0;
    return { status, json, text };
  } catch (e) {
    status = 0; // a network error
    return { status, json: null, text: String(e.message) };
  } finally {
    s.ms.push(performance.now() - t0);
    s.status[status] = (s.status[status] ?? 0) + 1;
  }
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

function report() {
  console.log('\nResults by phase and endpoint (ms = response time; hit% = served from the CloudFront cache)');
  console.log(`${'phase'.padEnd(9)}${'endpoint'.padEnd(13)}${'n'.padStart(7)}${'200'.padStart(7)}${'other'.padStart(18)}${'p50'.padStart(7)}${'p95'.padStart(7)}${'p99'.padStart(7)}${'max'.padStart(7)}${'hit%'.padStart(6)}`);
  for (const [key, s] of stats) {
    const [ph, tag] = key.split('|');
    const ms = [...s.ms].sort((a, b) => a - b);
    const other = Object.entries(s.status).filter(([c]) => c !== '200').map(([c, n]) => `${c}:${n}`).join(' ') || '-';
    const hit = s.cacheSeen ? `${Math.round((100 * s.cacheHit) / s.cacheSeen)}` : '';
    console.log(`${ph.padEnd(9)}${tag.padEnd(13)}${String(s.n).padStart(7)}${String(s.status[200] ?? 0).padStart(7)}${other.padStart(18)}${Math.round(pct(ms, 50)).toString().padStart(7)}${Math.round(pct(ms, 95)).toString().padStart(7)}${Math.round(pct(ms, 99)).toString().padStart(7)}${Math.round(ms.at(-1) ?? 0).toString().padStart(7)}${hit.padStart(6)}`);
  }
}

// ---- the page files a visitor's browser fetches (discovered once from the real HTML and the modules it imports, then replayed per visitor)
const assetLists = new Map();
async function discover(path) {
  const found = new Set();
  const html = await call('page-html', 'GET', path);
  const queue = [];
  for (const m of html.text.matchAll(/(?:src|href)="(\/[^"#?]+\.(?:js|css|svg|png|ico|json))"/g)) queue.push(m[1]);
  while (queue.length) {
    const url = queue.shift();
    if (found.has(url)) continue;
    found.add(url);
    const res = await call('page-file', 'GET', url);
    if (url.endsWith('.js')) for (const m of res.text.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) { try { queue.push(new URL(m[1], site + url).pathname); } catch { /* not a path */ } }
  }
  assetLists.set(path, [...found]);
}
async function loadPage(path) {
  if (!assetLists.has(path)) { await discover(path); return; }
  await call('page-html', 'GET', path);
  await Promise.all(assetLists.get(path).map((url) => call('page-file', 'GET', url)));
}

// ---- the throwaway hunt
const rand = crypto.randomBytes(5).toString('hex');
// Consonants only: the site's name filter reads digits as look-alike letters, so a random hex name can spell a blocked word by chance.
const user = `lt-${Array.from({ length: 10 }, () => 'bcdfghjklmnpqrstvwxz'[crypto.randomInt(20)]).join('')}`;
const password = crypto.randomBytes(16).toString('hex');
const slug = `loadtest-${rand}`;
const organiser = new Map();
let hunt = null;
const teams = []; // { name, jar, expected }
const questionList = [];
const answerFor = (q) => String(q.index + 1);
const wrongFor = () => '999999';
const wrong = (teamIndex, qIndex) => (teamIndex + qIndex) % 7 === 0; // some wrong answers, so the scores differ and can be checked

async function setup() {
  const day = new Date().toISOString().slice(0, 10);
  const reg = await call('register', 'POST', '/api/auth/register', { body: { username: user, password }, jar: organiser });
  if (reg.status !== 200) throw new Error(`could not register the throwaway organiser: ${reg.status} ${reg.text.slice(0, 120)}`);
  const made = await call('create-hunt', 'POST', '/api/admin/events', { body: { slug, name: 'Load test (temporary)', timeZone: 'UTC' }, jar: organiser });
  if (made.status !== 200) throw new Error(`could not create the hunt: ${made.status}`);
  hunt = { id: made.json.id, org: made.json.org };
  let index = 0;
  const zone = (id, name, n, photo) => ({
    id, name, map: null,
    questions: [...Array.from({ length: n }, (_, i) => { const q = { id: `q${i + 1}`, type: 'whole-number', text: `What is ${index + 1} plus 0?`, answers: [String(index + 1)], score: 10 }; questionList.push({ zone: id, id: q.id, index, score: 10, photo: false }); index += 1; return q; }),
      ...(photo ? [{ id: 'p1', type: 'photo', text: 'A photo of your team', answers: [], score: 20 }] : [])],
  });
  const zones = [zone('z1', 'Zone One', 4, false), zone('z2', 'Zone Two', 4, true)];
  questionList.push({ zone: 'z2', id: 'p1', index: 8, score: 20, photo: true });
  const content = await call('put-content', 'PUT', `/api/admin/events/${hunt.id}/content`, { body: { instructions: '# Load test', zones }, jar: organiser });
  const config = await call('put-config', 'PUT', `/api/admin/events/${hunt.id}/config`, { body: { name: 'Load test (temporary)', timeZone: 'UTC', day, start: '00:00', end: '23:59', teamNames: true, joinCode: '', whatsappUrl: '', override: 'override' }, jar: organiser }); // (a new hunt's default 9 to 12 window may be running right now, which locks the settings)
  if (content.status !== 200 || config.status !== 200) throw new Error(`could not set up the hunt: content ${content.status}, config ${config.status}`);
  for (let i = 0; i < OPT.teams; i += 1) {
    const name = `LT Team ${String(i + 1).padStart(2, '0')}`;
    const jar = new Map();
    const joined = await call('join', 'POST', `/api/events/${hunt.org}/${slug}/join`, { body: { name }, jar });
    if (joined.status !== 200) throw new Error(`team ${i + 1} could not join: ${joined.status} ${joined.json?.error ?? ''}`);
    teams.push({ name, jar, index: i, expected: questionList.filter((q, j) => !q.photo && !wrong(i, j)).reduce((n, q) => n + q.score, 0) });
  }
  const info = await call('info', 'GET', `/api/events/${hunt.org}/${slug}/info`);
  check('the throwaway hunt is open for play', info.json?.status === 'active', `status ${info.json?.status}`);
}

const base = () => `/api/events/${hunt.org}/${slug}`;

// ---- load: spectators, teams, organiser tabs, for a number of seconds
async function runLoad({ spectators, seconds, answering }) {
  const end = performance.now() + seconds * 1000;
  const live = () => performance.now() < end && !capHit && wafBlocks < 50;
  const guard = (fn) => fn().catch((e) => { if (!(e instanceof CapReached)) throw e; });
  const tasks = [];
  for (let i = 0; i < spectators; i += 1) {
    tasks.push(guard(async () => {
      await sleep(Math.random() * 5000);
      while (live()) {
        await Promise.all([call('info', 'GET', `${base()}/info`), call('scoreboard', 'GET', `${base()}/scoreboard`)]);
        await sleep(4500 + Math.random() * 1000);
      }
    }));
  }
  for (const t of teams) {
    tasks.push(guard(async () => {
      await sleep(Math.random() * 30_000 * Math.min(1, seconds / 30));
      while (live()) {
        await Promise.all([call('info', 'GET', `${base()}/info`), call('me', 'GET', `${base()}/me`, { jar: t.jar }), call('play', 'GET', `${base()}/play`, { jar: t.jar })]);
        await sleep(29_000 + Math.random() * 2000);
      }
    }));
    if (answering) {
      tasks.push(guard(async () => {
        for (const [j, q] of questionList.entries()) {
          await sleep((Math.random() * seconds * 800) / questionList.length + 200);
          if (!live()) return;
          const path = q.photo ? `${base()}/photo` : `${base()}/answer`;
          const body = q.photo ? { zone: q.zone, question: q.id } : { zone: q.zone, question: q.id, answer: wrong(t.index, j) ? wrongFor() : answerFor(q) };
          const r = await call(q.photo ? 'photo' : 'answer', 'POST', path, { body, jar: t.jar });
          if (r.status !== 200) answerFailures.push(`${t.name} ${q.id}: ${r.status} ${r.json?.error ?? ''}`);
        }
      }));
    }
  }
  for (let i = 0; i < OPT.organiserTabs; i += 1) {
    tasks.push(guard(async () => {
      await sleep(Math.random() * 5000);
      while (live()) {
        await Promise.all([call('org-teams', 'GET', `/api/admin/events/${hunt.id}/teams`, { jar: organiser }), call('scoreboard', 'GET', `${base()}/scoreboard`)]);
        await sleep(4500 + Math.random() * 1000);
      }
    }));
  }
  await Promise.all(tasks);
}
const answerFailures = [];

// ---- the phases
async function rush() {
  const t = performance.now();
  const jobs = [];
  for (let i = 0; i < OPT.spectators; i += 1) jobs.push((async () => { await sleep(Math.random() * 2000); await loadPage(`/e/${hunt.org}/${slug}/`); await Promise.all([call('info', 'GET', `${base()}/info`), call('scoreboard', 'GET', `${base()}/scoreboard`)]); })());
  for (const team of teams) jobs.push((async () => { await sleep(Math.random() * 2000); await loadPage(`/e/${hunt.org}/${slug}/play/`); await Promise.all([call('info', 'GET', `${base()}/info`), call('me', 'GET', `${base()}/me`, { jar: team.jar }), call('play', 'GET', `${base()}/play`, { jar: team.jar })]); })());
  await Promise.all(jobs.map((j) => j.catch((e) => { if (!(e instanceof CapReached)) throw e; })));
  console.log(`  ${((performance.now() - t) / 1000).toFixed(1)} s`);
}

async function ceiling() {
  const t = performance.now();
  let next = 0;
  const first429 = { at: null };
  const worker = async () => {
    while (next < OPT.ceilingRequests && !capHit) {
      const n = (next += 1);
      const r = await call('me-burst', 'GET', `${base()}/me`, { jar: teams[0].jar }).catch((e) => { if (e instanceof CapReached) return { status: -1 }; throw e; });
      if (r.status === 429 && first429.at === null) first429.at = n;
    }
  };
  await Promise.all(Array.from({ length: 40 }, worker));
  const seconds = (performance.now() - t) / 1000;
  const s = stats.get('ceiling|me-burst');
  console.log(`  ${s.n} requests in ${seconds.toFixed(1)} s = ${(s.n / seconds).toFixed(0)} per second; ${s.status[200] ?? 0} answered, ${s.status[429] ?? 0} refused with 429${first429.at ? ` (the first at request ${first429.at})` : ''}`);
  await sleep(3000);
  const after = await call('recovery', 'GET', `${base()}/me`, { jar: teams[0].jar });
  check('the API recovers after the burst', after.status === 200, `status ${after.status}`);
  return s;
}

async function verify() {
  await sleep(4000); // the scoreboard is cached for a few seconds
  const board = await call('scoreboard', 'GET', `${base()}/scoreboard`);
  const got = new Map((board.json?.teams ?? []).map((t) => [t.name, t.score]));
  const bad = teams.filter((t) => got.get(t.name) !== t.expected);
  check('the scoreboard lists every team with the right score', got.size === teams.length && bad.length === 0, bad.length ? `${bad.length} wrong, e.g. ${bad[0].name} shows ${got.get(bad[0].name)}, expected ${bad[0].expected}` : `${got.size} teams`);
  check('every answer was accepted', answerFailures.length === 0, answerFailures.slice(0, 2).join('; '));
}

async function cleanup() {
  phase = 'cleanup';
  if (!organiser.size) return;
  const del = await call('delete-account', 'POST', '/api/auth/delete', { body: { password }, jar: organiser, force: true });
  let gone = false;
  if (hunt) { const info = await call('info', 'GET', `${base()}/info`, { force: true }); gone = info.status === 400; }
  check('the throwaway account and its hunt were deleted', del.status === 200 && (hunt ? gone : true), `delete ${del.status}${hunt ? `, hunt address now ${gone ? 'unknown' : 'STILL THERE'}` : ''}`);
}

const started = performance.now();
console.log(`\nRunning as the throwaway organiser "${user}" (deleted at the end). Started ${new Date().toISOString()}`);
try {
  phase = 'setup';
  console.log('\n[setup]');
  await setup();
  console.log(`  hunt ${hunt.org}/${slug} with ${teams.length} teams`);
  phase = 'rush'; console.log('\n[rush] everybody opens the page at once'); await rush();
  phase = 'steady'; console.log(`\n[steady] ${OPT.spectators} spectators, ${teams.length} teams playing, ${OPT.organiserTabs} organiser tabs, ${OPT.steadySeconds} s`);
  await runLoad({ spectators: OPT.spectators, seconds: OPT.steadySeconds, answering: true });
  phase = 'verify'; console.log('\n[verify] does the scoreboard add up?'); await verify();
  if (!capHit) { phase = 'spike'; console.log(`\n[spike] ${OPT.spike} spectators, ${OPT.spikeSeconds} s`); await runLoad({ spectators: OPT.spike, seconds: OPT.spikeSeconds, answering: false }); }
  if (!capHit) { phase = 'ceiling'; console.log(`\n[ceiling] ${OPT.ceilingRequests} uncached API calls at once (429 is the API's limit working)`); await ceiling(); }
} catch (e) {
  console.error(`\nSTOPPED: ${e.message}`);
  checks.push({ name: 'the run completed', ok: false, detail: e.message });
} finally {
  console.log('\n[clean up]');
  await cleanup().catch((e) => { console.error(`cleanup problem: ${e.message}`); checks.push({ name: 'cleanup', ok: false, detail: e.message }); });
}

report();
const all = [...stats].map(([k, s]) => ({ phase: k.split('|')[0], tag: k.split('|')[1], s }));
const count = (fn) => all.filter(fn).reduce((n, x) => n + x.s.n, 0);
const statusSum = (fn, pred) => all.filter(fn).reduce((n, x) => n + Object.entries(x.s.status).filter(([c]) => pred(Number(c))).reduce((m, [, k]) => m + k, 0), 0);
console.log(`\nTotals: ${sent.toLocaleString()} requests in ${((performance.now() - started) / 1000).toFixed(0)} s (cap ${OPT.maxRequests.toLocaleString()}${capHit ? ', REACHED: the run was cut short' : ''})`);
console.log('\nChecks');
const polls = (x) => ['steady', 'spike', 'rush'].includes(x.phase);
check('no server errors (5xx) anywhere', statusSum(() => true, (c) => c >= 500) === 0, `${statusSum(() => true, (c) => c >= 500)} found`);
check('no network errors or timeouts', statusSum(() => true, (c) => c === 0) === 0, `${statusSum(() => true, (c) => c === 0)} found`);
check('every request in the rush, steady and spike phases succeeded', statusSum(polls, (c) => c !== 200) === 0, `${statusSum(polls, (c) => c !== 200)} of ${count(polls).toLocaleString()} did not`);
check('nothing was blocked by the firewall (403)', statusSum(() => true, (c) => c === 403) === 0, `${statusSum(() => true, (c) => c === 403)} found`);
check('stayed within the request cap', sent <= OPT.maxRequests && !capHit, `${sent.toLocaleString()} of ${OPT.maxRequests.toLocaleString()}`);
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} check(s) FAILED.` : '\nAll checks passed.');
process.exit(failed.length ? 1 : 0);
