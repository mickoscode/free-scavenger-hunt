#!/usr/bin/env node
// A usage report for the CloudFront plan's request allowance (and the API behind it), from CloudWatch. Read-only: it changes nothing.
//
//   node scripts/usage-report.js                                         this month so far, day by day, against the allowance
//   node scripts/usage-report.js --day 2026-11-27                        plus that day hour by hour
//   node scripts/usage-report.js --day 2026-11-27 --window 16:45-18:20   plus the window's total, average and busiest 5 minutes (e.g. the game)
//
// Options: --month YYYY-MM (default: this month)   --tz Australia/Perth (the zone for days and hours; default Australia/Perth)
//          --quota 1000000 (the plan's monthly requests; the Free plan)   --region ap-southeast-2 (where the API runs)
//
// Needs the AWS CLI and credentials that can read CloudWatch and list CloudFront distributions (the administrator's, not CI's).
// CloudWatch lags a few minutes, so the latest hour can be a little short. "Requests" counts every request CloudFront received; AWS does not
// count requests its firewall blocked against the allowance, so the figure here is the safe (high) side. The authoritative balance is in the
// CloudFront console (the distribution's plan).
import { execFileSync } from 'node:child_process';
import { addDays, dayHours, localToUtcMs, monthSummary, points, renderDay, renderMonth, renderWindow, windowStats, zoned } from './lib/usage.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const tz = opt('tz', 'Australia/Perth');
const region = opt('region', process.env.AWS_REGION ?? 'ap-southeast-2');
const quota = Number(opt('quota', 1_000_000));
const now = Date.now();
const month = opt('month', zoned(now, 'UTC').date.slice(0, 7));
const day = opt('day', null);
const window = opt('window', null);
if (!/^\d{4}-\d{2}$/.test(month)) { console.error('--month must look like 2026-11'); process.exit(2); }
if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) { console.error('--day must look like 2026-11-27'); process.exit(2); }
if (window && (!day || !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(window))) { console.error('--window needs --day and looks like 16:45-18:20'); process.exit(2); }
try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { console.error(`unknown time zone ${tz}`); process.exit(2); }

const aws = (list) => {
  try { return JSON.parse(execFileSync('aws', [...list, '--output', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch (e) { console.error(`The AWS CLI failed: ${String(e.stderr ?? e.message).split('\n').filter(Boolean).slice(0, 3).join(' ')}\nCheck that it is installed and signed in (aws sts get-caller-identity).`); process.exit(1); }
};
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const metric = (reg, namespace, name, dimensions, from, to, period) => points(aws([
  'cloudwatch', 'get-metric-statistics', '--region', reg, '--namespace', namespace, '--metric-name', name, '--dimensions', ...dimensions,
  '--start-time', iso(from), '--end-time', iso(to), '--period', String(period), '--statistics', 'Sum',
]));

// The distribution is found by its comment, the way the deploy workflow finds it (no id is stored anywhere).
const id = aws(['cloudfront', 'list-distributions', '--query', "DistributionList.Items[?Comment=='free-scavenger-hunt'].Id | [0]"]);
if (!id) { console.error('No CloudFront distribution with the comment "free-scavenger-hunt" was found in this account.'); process.exit(1); }
const cfDims = [`Name=DistributionId,Value=${id}`, 'Name=Region,Value=Global'];
const lambdaDims = ['Name=FunctionName,Value=fsh-api'];

// the whole month, hourly, from local midnight of its first day (so every local day is complete)
const monthStartLocal = localToUtcMs(`${month}-01`, tz);
const monthEnd = Date.parse(`${month}-01T00:00:00Z`) + 32 * 86_400_000;
const to = Math.min(now, monthEnd);
const from = Math.min(monthStartLocal, Date.parse(`${month}-01T00:00:00Z`));
const fetchHourly = (reg, ns, name, dims) => metric(reg, ns, name, dims, Math.floor(from / 3_600_000) * 3_600_000, to, 3600);
const requests = fetchHourly('us-east-1', 'AWS/CloudFront', 'Requests', cfDims);
const bytes = fetchHourly('us-east-1', 'AWS/CloudFront', 'BytesDownloaded', cfDims);
const calls = fetchHourly(region, 'AWS/Lambda', 'Invocations', lambdaDims);

console.log(`Usage report for distribution ${id}, generated ${new Date(now).toISOString()}\n`);
const summary = monthSummary({ requests, calls, bytes, month, tz, quota });
for (const line of renderMonth({ summary, month, tz, quota, now })) console.log(line);

if (day) {
  const rows = dayHours({ requests, calls, bytes, date: day, tz });
  const [from5, to5] = window ? window.split('-') : [null, null];
  for (const line of renderDay({ rows, date: day, tz, gameFrom: from5, gameTo: to5 })) console.log(line);
  if (window) {
    const start = localToUtcMs(day, tz, from5);
    const end = localToUtcMs(day, tz, to5);
    const req5 = metric('us-east-1', 'AWS/CloudFront', 'Requests', cfDims, start, end, 300);
    const call5 = metric(region, 'AWS/Lambda', 'Invocations', lambdaDims, start, end, 300);
    for (const line of renderWindow({ stats: windowStats({ requests: req5, calls: call5, date: day, from: from5, to: to5, tz }), date: day, from: from5, to: to5, tz })) console.log(line);
  }
}
console.log('\n(CloudWatch lags a few minutes; the authoritative allowance balance is in the CloudFront console.)');
