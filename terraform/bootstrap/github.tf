# Every GitHub setting of this repository, as code. Nothing outside this one repository is managed or read.
# The repository already exists (created by hand), so it is imported rather than created.
import {
  to = github_repository.this
  id = var.github_repo
}

data "github_user" "owner" {
  username = var.github_owner
}

data "github_user" "admin" {
  username = var.github_admin_user
}

resource "github_repository" "this" {
  name         = var.github_repo
  description  = "Web site that enables anyone to create and host a free scavenger hunt game for their community"
  visibility   = "public"
  has_issues   = true
  has_projects = false
  has_wiki     = false

  # Squash merges only: one commit per pull request, a linear history on main.
  allow_squash_merge          = true
  allow_merge_commit          = false
  allow_rebase_merge          = false
  squash_merge_commit_title   = "PR_TITLE"
  squash_merge_commit_message = "PR_BODY"

  allow_auto_merge       = true
  allow_update_branch    = true
  delete_branch_on_merge = true

  security_and_analysis {
    secret_scanning {
      status = "enabled"
    }

    secret_scanning_push_protection {
      status = "enabled"
    }
  }

  archive_on_destroy = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "github_repository_vulnerability_alerts" "this" {
  repository = github_repository.this.name
  enabled    = true
}

# GitHub Actions: workflows get a read-only token unless a job asks for more, and cannot approve pull requests.
resource "github_workflow_repository_permissions" "this" {
  repository                       = github_repository.this.name
  default_workflow_permissions     = "read"
  can_approve_pull_request_reviews = false
}

# Which actions workflows may use: GitHub's own, plus exactly the four third party ones this repository needs (all pinned to a
# commit, which is also enforced). A pull request cannot pull in any other action.
resource "github_actions_repository_permissions" "this" {
  repository           = github_repository.this.name
  enabled              = true
  allowed_actions      = "selected"
  sha_pinning_required = true

  allowed_actions_config {
    github_owned_allowed = true
    verified_allowed     = false
    patterns_allowed = [
      "hashicorp/setup-terraform@*",
      "terraform-linters/setup-tflint@*",
      "aquasecurity/trivy-action@*",
      "aquasecurity/setup-trivy@*",
      "aws-actions/configure-aws-credentials@*",
    ]
  }
}

# Workflows from forks and from first time contributors wait for the owner's approval before they run anything.
# (The GitHub provider has no resource for this setting yet, so it is applied through the API.)
resource "terraform_data" "fork_pr_approval" {
  triggers_replace = ["all_external_contributors", github_repository.this.name]

  provisioner "local-exec" {
    environment = { REPO = "${var.github_owner}/${github_repository.this.name}" }
    command     = "curl -fsS -X PUT -H \"Authorization: Bearer $GITHUB_TOKEN\" -H 'Accept: application/vnd.github+json' https://api.github.com/repos/$REPO/actions/permissions/fork-pr-contributor-approval -d '{\"approval_policy\":\"all_external_contributors\"}'"
  }
}

resource "github_repository_dependabot_security_updates" "this" {
  repository = github_repository.this.name
  enabled    = true
}

# The protected branch. No bypass actors: nobody, including the administrator, can push straight to main.
# One approval is not required because the administrator is usually the only reviewer (GitHub does not let
# anyone approve their own pull request); the required checks are the gate.
resource "github_repository_ruleset" "main" {
  repository  = github_repository.this.name
  name        = "main"
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  rules {
    deletion         = true
    non_fast_forward = true

    pull_request {
      required_approving_review_count   = 0
      dismiss_stale_reviews_on_push     = false
      require_code_owner_review         = false
      require_last_push_approval        = false
      required_review_thread_resolution = false
    }

    required_status_checks {
      strict_required_status_checks_policy = false

      dynamic "required_check" {
        for_each = var.required_checks

        content {
          context = required_check.value
        }
      }
    }
  }
}

# The Terraform apply job runs in this environment, so it waits for the administrator's approval and only
# main can use it. The AWS apply role trusts this environment's name and nothing else.
resource "github_repository_environment" "terraform_production" {
  repository          = github_repository.this.name
  environment         = "terraform-production"
  can_admins_bypass   = false
  prevent_self_review = false

  reviewers {
    users = [data.github_user.admin.id]
  }

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "terraform_production_main" {
  repository     = github_repository.this.name
  environment    = github_repository_environment.terraform_production.environment
  branch_pattern = "main"
}

# Non-secret values the workflows need. There are no secrets in this repository at all.
resource "github_actions_variable" "this" {
  for_each = {
    AWS_REGION         = var.aws_region
    AWS_ACCOUNT_ID     = local.account_id
    AWS_PLAN_ROLE_ARN  = aws_iam_role.plan.arn
    AWS_APPLY_ROLE_ARN = aws_iam_role.apply.arn
  }

  repository    = github_repository.this.name
  variable_name = each.key
  value         = each.value
}
