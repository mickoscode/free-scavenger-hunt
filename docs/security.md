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
- **API only through CloudFront**: CloudFront adds a secret header and the API refuses everything without it. The API's raw address is not secret (it appears in public build logs), but is useless on its own, and the viewer address used for rate limits can no longer be forged.
- **Abuse limits**: registrations, logins, joins, recovery attempts, password checks and uploads are rate limited; API Gateway throttles at 100 requests per second (burst 300); the Lambda has a concurrency ceiling so a flood cannot use up the account's capacity.
- **Privacy**: no personal data (no email, names, addresses). Rate-limit counters use a hash of the address and expire within two hours.

**Residual / accepted:**
- A site admin account can reset organisers' passwords by design (the owner sees a notice).
- A stranger can make an organiser's *recovery* or a hunt's *join code* guessing slower for everyone only by exhausting generous per-address limits; nothing reveals a secret.
- The default `*.cloudfront.net` certificate permits TLS 1.0; a custom domain (planned) removes that.
- Anyone can create an account (open registration, rate limited). The site admin can close registration, suspend or delete accounts.
- Denial of service at scale needs a WAF or Shield (a cost decision; the API throttle and Lambda ceiling bound the cost).

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
