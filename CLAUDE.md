# CLAUDE.md

A site that lets anyone create and run a free scavenger hunt. Players play identical to the reference project `../surf-club-scavenger-hunt` (read-only inspiration: never modify it, never reference its resources, share nothing with it except the AWS account `722937635825`, region `ap-southeast-2`).

## Vocabulary

- **Site admin**: the owner of the whole site; full control. **Event admin**: any user who registers to build and manage their own events; sees only their own. **Player**: joins a team in an event.
- **Event**: the named thing an event admin prepares (questions, maps, teams, results). **Active event**: the one being served. **Game**: only the playing of an event. Keep these words separate.

## Pipeline rules

- Everything this repo creates in AWS is named `fsh-*`; CI roles are `free-scavenger-hunt-ci-*` and live in `terraform/bootstrap/`. Never touch resources not named so.
- `terraform/bootstrap/` (state, CI roles, ALL GitHub settings) is applied only from an admin machine with `scripts/bootstrap.sh`, never by CI. `terraform/` is applied by CI after approval.
- Roles in `terraform/` must set `permissions_boundary = local.boundary_policy_arn`. New AWS services need permissions added in `bootstrap/iam.tf` first.
- No secrets in GitHub or in git. AWS access from workflows is OIDC only.
- `main` is protected by a ruleset (PR + required checks, no bypass). Work on a branch, open a PR, squash merge. Change GitHub settings in `terraform/bootstrap/github.tf`, not in the UI.
- Required checks are named in `terraform/bootstrap/variables.tf` (`required_checks`): keep them in step with job names in `.github/workflows/`.
- The sandbox's `terraform`/`aws` are snaps that need `dangerouslyDisableSandbox` to run.

See `README.md` (layout, workflows) and `docs/setup.md` (wiring).

## Application rules

- Spec: `docs/requirements.md`; API: `docs/api.md`. Keep them in step with the code.
- Everything an organiser needs lives in the site (editor, map upload, settings): never add a dependency on files from a repo, a CLI or another service.
- Game rules are pure functions in `api/lib/` (no AWS); routes in `api/routes-*.js`; stores implement one interface (`store/memory.js` is the reference, `tests/api/store.contract.js` the contract both pass).
- Tenancy: every admin route goes through `loadManagedEvent` (owner or site admin; anyone else gets `no-event`); every public route is scoped by slug; team cookies are per event. Add a case to `tests/api/tenancy.test.js` for each new admin route.
- API errors avoid 403/404 (CloudFront rewrites them). Answers never reach a browser before results are published (tests scan responses for them).
- Pages find elements by `data-testid` and the browser tests read those, not wording. No inline script/style/handlers; no innerHTML.
- Run `npm test` (fast) and `npm run test:browser` (Chromium) before a PR; `node scripts/smoke-test.js <url>` checks a running site.
- Deploy: merging `api/` or `web/` changes deploys automatically; infrastructure changes need the apply approval.
- Privacy: never store personal data (no email, names or addresses; rate counters use `clientKey`, a hash). Account recovery is by one-time recovery codes (`routes-auth.js`), not email.

## Security rules

The detailed security review (residual risks, cost-abuse economics, open items) is kept privately by the owner and is deliberately NOT in this public repository: never recreate it here or paste its contents into docs, comments or commit messages. Ask the owner for it when you need it.

- Never add a secret, key or token to the repo or GitHub. Never widen the CI roles or the boundary without saying so; every new AWS service goes through `bootstrap/iam.tf`.
- Any new `/api/admin/*` or `/api/site/*` route must pass `tests/api/security.test.js` unchanged (it enumerates routes). Never trust a client address except through `clientKey`. Never put user text into the DOM except with `textContent`.
- Workflows: no `pull_request_target`; never interpolate event data into a script (use `env:`); new third-party actions must be pinned by SHA and added to `patterns_allowed` in `bootstrap/github.tf`.
- Git identity for this repo is the GitHub no-reply address: never commit with a personal email.
- CloudFront must stay eligible for the Free/Pro flat-rate plans (the Free plan makes CDN cost fixed at $0 with no overage): only AWS-managed response-header, cache and origin-request policies, at most 5 cache behaviors. Security headers come from `terraform/headers.js`. Only `/api/events/*/info` and `/scoreboard` may ever be cached; never put anything personal in them.

## Addresses and the demo

- A hunt's address is `/e/<organiser code>/<hunt>/`; API `/api/events/:org/:slug/...`. Every account has a 4 character code (`orgCodeFor` assigns one lazily to older accounts). Hunt names are unique per organiser, not globally. Never build a hunt address from a slug alone.
- Every signup creates a `demo-hunt` (`api/demo/`): 6 zones, 53 questions, pictures in `api/demo/images/` (licences in `api/demo/credits.json`, shown in the demo's instructions). If you change the demo's questions keep the Code-breakers answers derived from the questions they refer to (`tests/api/demo.test.js` checks), and keep every image's licence and author in `credits.json`. `scripts/make-demo-logo.js` redraws the Code-breakers picture.
- Players must never be given a way out of a game by accident: no link to `/` on view/play/results pages (the browser tests check), and the landing page offers the last hunt back.

## Front page and About

- `web/index.html` keeps the owner's original wording (pitch, joining box, three steps): decorate around it, never rewrite it. `web/about/index.html` is the owner's personal story in their voice: do not invent biography, and keep every privacy/cost claim true (verified 2026-11-22: CloudFront, API Gateway and WAF logging are off; the Lambda logs only timing lines).
- Pages may link out only with `rel="noopener"`; nothing they load may come from another origin (`tests/unit/frontend.test.js`).

## Phones

- Every page, signed-in organiser pages included, must fit a 360 px wide Android phone with nothing off the right edge and every bar button on screen (`tests/browser/admin-phone.test.js`, `site-pages.test.js`). Measure element edges, not `scrollWidth`: phone emulation silently zooms out to hide the overflow. When you add a page or a bar, add it to those tests.
