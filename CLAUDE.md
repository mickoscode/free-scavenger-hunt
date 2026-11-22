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
