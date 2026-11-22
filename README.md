# free-scavenger-hunt

A website that lets anyone create and host a free scavenger hunt for their community. Players join as teams, answer questions and send photos; **event admins** build and run their own events; the **site admin** oversees everything.

Status: infrastructure and delivery pipeline are in place; the application itself is being built (see `docs/requirements.md` once it exists).

## Layout

| Path | What it is |
|---|---|
| `web/` | The static site (served from a private S3 bucket through CloudFront) |
| `terraform/` | The app's infrastructure. Applied by CI, as a role that can only touch resources named `fsh-*` |
| `terraform/bootstrap/` | State bucket, the CI roles and **every GitHub setting of this repo**. Applied from an administrator's computer (`scripts/bootstrap.sh`) |
| `scripts/` | `build.sh` (assembles `dist/`), `bootstrap.sh` |
| `tests/` | Tests (`npm test`) |
| `docs/setup.md` | One-time setup and how the pipeline is wired |
| `.github/workflows/` | CI/CD (below) |

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `web-pr.yml` | pull request | Build and tests. Required check: `Validate site` |
| `terraform-pr.yml` | PR touching `terraform/` | fmt, validate (both roots), tflint, Trivy scan, read-only plan posted as a PR comment. Required: `Terraform validate`, `Terraform security scan`, `Terraform plan` |
| `terraform-apply.yml` | push to `main` touching `terraform/` | plan, then an apply that waits for the administrator's approval (`terraform-production` environment), then starts a deploy |
| `deploy.yml` | push to `main` touching `web/`, or manual | build, test, sync to S3, invalidate CloudFront |
| `delete-merged-branch.yml` | PR merged | deletes the branch |

No secrets are stored in GitHub and no AWS keys exist: workflows assume AWS roles through GitHub OIDC, each limited to what it needs.

## Isolation

This project shares only the AWS account with anything else. It has its own Terraform state bucket, its own CI roles and its own resources (all `fsh-*`). CI roles are capped by a permissions boundary and cannot read or change other resources in the account, except for services IAM cannot scope by name (CloudFront, API Gateway, ACM), documented in `docs/setup.md`.

## Develop

```sh
npm test    # builds dist/ and runs the tests
```
