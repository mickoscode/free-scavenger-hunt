# Setup and pipeline wiring

## What exists (done once, by `scripts/bootstrap.sh`)

| Where | What |
|---|---|
| AWS (`ap-southeast-2`) | S3 bucket `free-scavenger-hunt-tfstate-<account>` (private, versioned, encrypted; holds state for `terraform/` and `terraform/bootstrap/`), IAM roles `free-scavenger-hunt-ci-plan` (read-only) and `free-scavenger-hunt-ci-apply` (write to `fsh-*` only), and the permissions boundary policy `free-scavenger-hunt-ci-boundary` |
| GitHub | repository settings (squash-only merges, branch auto-delete, secret scanning), the `main` ruleset (PR required, no force pushes, required checks, no bypass), the `terraform-production` environment (administrator approval, `main` only) and Actions variables `AWS_REGION`, `AWS_ACCOUNT_ID`, `AWS_PLAN_ROLE_ARN`, `AWS_APPLY_ROLE_ARN` |

Not used: HCP Terraform, GitHub secrets, long-lived AWS keys.

## First-time site admin

After the first successful deploy, from a computer with AWS credentials for the account and this repo checked out (`npm ci` first):

```sh
FSH_TABLE=fsh-main node scripts/create-site-admin.js        # prints a random password for the user "siteadmin"
```

Sign in at `/admin/` and change the password. Run it again to reset the site admin's password if it is ever lost.

## Day to day

Open a PR. Checks run; a Terraform change gets a plan comment. Merge. If `terraform/` changed, approve the apply in the Actions run (**Review deployments**); the deploy then runs by itself. If only `web/` changed, the deploy runs straight away.

## Changing bootstrap (settings, CI roles, permissions)

Edit `terraform/bootstrap/`, open a PR (validated by CI), merge, then from a computer with AWS credentials and a GitHub token for this repository:

```sh
git checkout main && git pull
./scripts/bootstrap.sh        # shows a plan, asks before applying
```

Needs: terraform >= 1.10, AWS credentials for the account, `gh auth login` (or `GITHUB_TOKEN`) with a token able to administer this repository. The bootstrap is deliberately not run by CI: it holds the keys to CI itself.

If the app needs a new AWS service (for example Cognito or SES), add its permissions to `terraform/bootstrap/iam.tf` (`app_access` for name-scoped services), apply the bootstrap, then use it in `terraform/`.

## Guard rails

- Roles created by `terraform/` must set `permissions_boundary = local.boundary_policy_arn`; the apply role is not allowed to create a role without it, and cannot edit the CI roles or the boundary.
- The apply role can change a CloudFront distribution or an API Gateway API only if it is tagged `Project=free-scavenger-hunt` (explicit denies in `terraform/bootstrap/iam.tf`); Terraform tags everything it creates, so other projects' distributions and APIs are out of its reach. Nothing in this repo references another project's resources.
- The account's single GitHub OIDC provider belongs to another project's Terraform. This repo only references its ARN; each role's trust policy pins this repository by immutable ID (`repo:<owner>@<id>/<repo>@<id>`).

## Custom domain

Not yet configured: the site is served from the `site_url` output (a `*.cloudfront.net` address).

## Load test (a deployed site)

`scripts/load-test.js` runs a capped load test with a throwaway organiser and hunt that it deletes at the end (it never touches an existing hunt). It simulates an event's traffic compressed into minutes: everybody opening the page, spectators on the scoreboard, teams playing and answering, organiser tabs, a spike with more spectators, and a burst of uncached API calls to see the API's request limit and the recovery. It checks the scoreboard adds up and prints response times, cache hits, errors and PASS/FAIL checks (exit code 1 on a failure).

```sh
node scripts/load-test.js https://xxxx.cloudfront.net          # prints the plan and its request budget, sends nothing
node scripts/load-test.js https://xxxx.cloudfront.net --yes    # runs it (about 26,000 requests, 6 minutes, hard cap 50,000)
```

Every request counts toward the CloudFront plan's monthly request allowance (the Free plan: 1 M requests), so check the balance first with `node scripts/usage-report.js` (below). It comes from one address, so it can join at most about 28 teams (the API allows 30 joins per hour per address per hunt), and it refuses to run between 23:30 and 00:15 UTC (the throwaway hunt is a game "today" in UTC). A few 429 answers in the *ceiling* phase are expected: that is the API throttle working.

## Usage report (the request allowance)

`scripts/usage-report.js` reads CloudWatch and shows how much of the CloudFront plan's monthly request allowance (the Free plan: 1 M requests) is used, day by day, with the API calls and data sent alongside. It is read-only. Run it from a computer with the AWS CLI signed in as the administrator:

```sh
node scripts/usage-report.js                                          # this month so far, per day, against the allowance
node scripts/usage-report.js --day 2026-11-27                         # plus that day hour by hour (the whole day, before and after an event)
node scripts/usage-report.js --day 2026-11-27 --window 16:45-18:20    # plus the window's total, average and busiest 5 minutes (the game)
node scripts/usage-report.js --month 2026-12 --tz Australia/Sydney    # another month or time zone (default Australia/Perth)
```

Days and hours are in the chosen time zone; the allowance month is the UTC month. CloudWatch lags a few minutes, and `Requests` counts everything CloudFront received (AWS does not count firewall-blocked requests against the allowance), so the report errs on the high side. The authoritative balance is in the CloudFront console. Going over the allowance has no overage charge (AWS adjusts delivery only after sustained excess over several months; the first spike up to 3x in a month is free of effect).

## Resetting organiser data (once, when addresses changed shape)

Hunt addresses gained an organiser code (`/e/<code>/<hunt>/`), so hunts created before that cannot be reached. To clear old test organisers, hunts and pictures (the site admin is never touched), from a computer with AWS credentials:

```sh
node scripts/reset-organisers.js          # lists what would be removed, changes nothing
node scripts/reset-organisers.js --yes    # removes it
```

## The master Demo Hunt (once, and to restore it)

New organisers get a copy of the hunt called `master-demo` in the site admin's account as their Demo Hunt. The original demo is kept as data in `scripts/demo-master/`, and this command makes `master-demo` from it (or restores it), from a computer with AWS credentials:

```sh
node scripts/seed-master-demo.js                  # shows what it would do
node scripts/seed-master-demo.js --yes            # creates master-demo (does nothing if it exists)
node scripts/seed-master-demo.js --replace --yes  # throws the current one away and restores the original
```
