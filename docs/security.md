# Security

What an attacker could try, what stops them, what is left. Reviewed end to end on 2026-11-22 (code, configuration, live site, IAM simulation); re-run the checks listed at the end after any change to authentication, IAM or the workflows.

## 1. The AWS account

An attacker has three routes to your AWS resources. None works from a clone of this repository.

| Route | Why it fails |
|---|---|
| **Credentials in the repo or its history** | None exist: no keys, tokens or passwords in any commit (scanned), no GitHub secrets, no deploy keys, no webhooks. CI uses short-lived OIDC credentials. |
| **Assuming a CI role from GitHub** | Each role's trust policy requires the OIDC token's subject to be this repository **by its numeric IDs** (`repo:mickoscode@15779346/free-scavenger-hunt@1467037526`), so another repo, a fork, a renamed or recreated repo cannot match. The *apply* role additionally requires the `terraform-production` environment, which only `main` can use and which waits for your approval. Fork pull requests are never issued OIDC tokens. |
| **A malicious change merged to `main`** | Needs write access to this repo: only your account has it. `main` accepts only pull requests that pass the checks; Terraform changes then wait for your approval. |

Even with CI code execution, damage is bounded (verified with IAM policy simulation against the live account): the apply role **cannot** edit itself or the permissions boundary, create users, roles without the boundary, access keys, or roles outside `fsh-*`, assume any other role, or touch surf-club's buckets, Lambda functions, tables or secrets. Roles it creates are capped by the boundary. CloudFront distributions and API Gateway APIs are writable only when tagged `Project=free-scavenger-hunt`, so other projects' CDNs and APIs cannot be changed.

The API Lambda itself can only read and write its own table and its own bucket; a bug in the application cannot change AWS configuration.

**Residual:** CloudFront cache policies, origin access controls and functions, and ACM, cannot be tagged or named-scoped, so a malicious merged change could alter those *in the account*. Mitigations: review every Terraform plan before approving (you do), and the approval gate.

## 2. Your GitHub account and this repository

Cloning, forking or analysing the repository gives an attacker nothing that acts on your account: the repo holds no token or credential, and workflows run in this repo's context only.

- `main` is protected by a ruleset (pull request, required checks, no force pushes, no deletion, **no bypass**).
- Workflows get a read-only `GITHUB_TOKEN` by default and cannot approve pull requests.
- Fork pull requests run **without secrets or AWS access**, and only after approval for every external contributor.
- Only GitHub's own actions plus four named third-party actions may run, **pinned to commit SHAs** (enforced). No `pull_request_target`, no `issue_comment`/`workflow_run` triggers, and no workflow interpolates attacker-controlled text into a script (branch names go through environment variables).
- Secret scanning, push protection and Dependabot security updates are on.
- All of this is code in `terraform/bootstrap/github.tf`.

**Needs your action (your GitHub account, not this repo):** the public history contains your real name and personal email address. See "Open items" below.

## 3. The website

- **Authorization**: every admin route resolves the hunt through its owner. Another organiser's hunt answers exactly like a missing one. A test enumerates *every* registered route automatically, so a new route without a check fails the build (`tests/api/security.test.js`).
- **Authentication**: scrypt passwords (10+ characters, common and username-based passwords refused), random session tokens stored only as hashes, 12 hours, `HttpOnly; Secure; SameSite=Strict`, ended by password change, reset, recovery or suspension. Login failures are limited per account **and address** (so a stranger cannot lock the owner out) and per account overall. Recovery codes: 99 bits, hashed, single use even under concurrent requests.
- **CSRF / CORS**: no CORS headers; state changes require `application/json` (cannot be sent by a cross-site form) and the session cookie is `SameSite=Strict`.
- **Injection / XSS**: no user text is ever parsed as HTML (`textContent` everywhere; a markdown renderer that builds text nodes); the content security policy allows only the site's own files and no inline script. Tested in a real browser with hostile markup in every field. Uploaded images are checked by their bytes, and their names are chosen by the server.
- **Security headers**: CloudFront's headers function covers every successful response, but CloudFront Functions do not run on error responses (found when the Free-plan change shipped and the live probe flagged it), so API responses set their own CSP, framing, nosniff and HSTS headers (errors included, tested), and the 404 page carries its own policy in a `<meta>` tag.
- **API only through CloudFront**: CloudFront adds a secret header and the API refuses everything without it. The API's raw address is not secret (it appears in public build logs), but is useless on its own, and the viewer address used for rate limits can no longer be forged.
- **Abuse limits**: registrations, logins, joins, recovery attempts, password checks and uploads are rate limited; API Gateway throttles at 100 requests per second (burst 300); the Lambda has a concurrency ceiling so a flood cannot use up the account's capacity.
- **Privacy**: no personal data (no email, names, addresses). Rate-limit counters use a hash of the address and expire within two hours.

**Residual / accepted:**
- A site admin account can reset organisers' passwords by design (the owner sees a notice).
- A stranger can make an organiser's *recovery* or a hunt's *join code* guessing slower for everyone only by exhausting generous per-address limits; nothing reveals a secret.
- The default `*.cloudfront.net` certificate permits TLS 1.0; a custom domain (planned) removes that.
- Anyone can create an account (open registration, rate limited). The site admin can close registration, suspend or delete accounts.
- Denial of service at scale needs a WAF or Shield (a cost decision; the API throttle and Lambda ceiling bound the cost).

## 4. Cost exposure (a "denial of wallet" attack)

Nobody can *take the site over* by flooding it, but a flood costs money, because AWS bills per request. Prices below are approximate for Sydney (ap-southeast-2); check the AWS pricing pages before relying on them. Baseline on 2026-11-22: the whole account cost **$0.78** for the month; a $5 monthly account budget emails at 80% (actual and forecast) and 100%.

| Path of the attack | What limits it | Worst case if sustained non-stop |
|---|---|---|
| **API calls** (login, join, answers...) | API Gateway throttle: **25 requests/second** sustained, burst 60 (a throttled request never reaches Lambda or the database). Cached scoreboard reads are served by CloudFront and mostly never reach the API | about **$0.60 an hour, $15 a day, $450 a month** (API Gateway ~$80, Lambda $20-80, DynamoDB up to ~$250 when every call is a failed login, CloudFront requests ~$100). Before this change the throttle was 100/s, four times that |
| **Database growth** | Signups capped at 30 an hour overall and 4 an hour per address; 3 hunts per account; 300 teams per hunt; 256 KB of questions per hunt; counters expire by themselves (TTL) | under $1 a month per day of sustained attack |
| **Image storage** | 60 uploads an hour per hunt, 60 MB of uploads in total per hunt, 500 KB per picture, only real images | roughly $3 a month of extra storage per day of sustained attack (needs 30 accounts an hour) |
| **Static pages and pictures through CloudFront** | **nothing**: CloudFront has no request limit, and billing is per request and per GB (~$0.11/GB). An attacker repeatedly downloading a 500 KB map can run up far more than the API ever could | unbounded by design; a modest 1 Gbps flood is about $50 an hour |

The last row is the real exposure. Options, cheapest first:

1. **CloudFront flat-rate pricing plan, Free tier ($0/month)**: switch the distribution to a plan (CloudFront console, *Distribution > Plan*). It bundles DDoS protection and WAF, and has **no overage charges**: beyond its allowance (1 million requests and 100 GB a month) AWS may reduce delivery performance instead of billing, and blocked attacks never count against the allowance. For a site with no users yet this makes the CDN cost a fixed $0. **The distribution is built to be eligible** (checked against AWS's plan feature table, 2026-11-22): the Free and Pro tiers only allow AWS-managed response-header, cache and origin-request policies (custom ones need the $200 Business tier), so the security headers come from a CloudFront Function (`terraform/headers.js`), the API uses the managed `CachingDisabled` policy, and the two public reads (`/api/events/*/info` and `/scoreboard`) have their own behaviors with the managed `CachingOptimized` policy (5 cache behaviors in total, the Free limit). Caveats: an AWS account on the new credit-based "Free plan" cannot use plans; a busy real event may exceed the Free allowance, in which case use the $15 Pro plan (10 million requests); API Gateway, Lambda and DynamoDB are billed separately (limited by the throttle above). The console removes the distribution's price class when you subscribe; Terraform is already set to `PriceClass_All` and to ignore the web ACL a plan attaches, so subscribing outside Terraform causes no drift fight. After subscribing, run `node scripts/security-probe.js <site>`: it must still pass (headers, CSP, API lock).
2. **AWS WAF rate-based rule** on the distribution (about $7 a month): blocks an address that sends more than N requests in five minutes, before any billing for origin work. Only stops single-source floods.
3. **Watch the budget**: the existing $5 account budget will email you within hours of an attack. If it does, the fastest stop is the API throttle (set both `api_throttle_*` variables to 0 and apply) or disabling the distribution.

Raising the throttle: busy events are fine at the default (viewers are served from the CloudFront cache; the API sees about one request every 3 seconds per hunt for the scoreboard, plus team submissions). If a large event needs more, raise `api_throttle_rate_limit` in `terraform/variables.tf` before the event and lower it afterwards.

## Open items for the owner

1. **Personal email in git history.** Commits made before 2026-11-22 carry your real name and a personal email. Turn on *GitHub Settings > Emails > Keep my email addresses private* and *Block command line pushes that expose my email*; this repository's local git identity is already the no-reply address. Rewriting history is possible but cannot remove old pull request refs on GitHub (only GitHub Support can), so recreating the repository is the only complete fix; judge whether that is worth it (the same address is probably already public from other repositories).
2. Keep your own GitHub token and AWS CLI keys short-lived and out of shared shells. They are the only credentials that could change things outside CI, and they are not in this repository.

## Re-running the checks

```sh
npm test                                              # includes the route-by-route authorization tests and the pages vs CSP
npm run test:browser                                  # includes hostile text in a real browser
node scripts/security-probe.js <site> [raw api url]   # attacks a live deployment (read-only)
aws iam simulate-principal-policy ...                 # CI role escalation checks (see the review notes in this file's history)
```
