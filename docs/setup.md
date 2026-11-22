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
- IAM cannot scope CloudFront, API Gateway or ACM by name, so the apply role has those on `*` in this account. Terraform in this repo only ever manages its own resources; nothing references another project's.
- The account's single GitHub OIDC provider belongs to another project's Terraform. This repo only references its ARN; each role's trust policy pins this repository by immutable ID (`repo:<owner>@<id>/<repo>@<id>`).

## Custom domain

Not yet configured: the site is served from the `site_url` output (a `*.cloudfront.net` address).
