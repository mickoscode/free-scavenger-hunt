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
